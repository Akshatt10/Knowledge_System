"""Q&A / chat endpoint powered by the RAG engine."""

from __future__ import annotations

import logging
import uuid
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from app.services.auth import get_current_user, get_db
from app.models.database import User, QueryLog, QueryFeedback
from sqlalchemy.orm import Session

from app.models.schemas import (
    QueryRequest,
    QueryResponse,
    SourceCitation,
    FeedbackRequest,
    AnnotationRequest,
    AnnotationResponse,
)
from app.services.rag import rag_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Query"])


def _log_query(
    db: Session,
    user_id: str,
    question: str,
    analytics: dict,
    answer_text: str | None = None,
    follow_up_questions: list[str] | None = None,
) -> str | None:
    """Persist a QueryLog record for analytics and return its ID."""
    try:
        log_id = str(uuid.uuid4())
        log = QueryLog(
            id=log_id,
            user_id=user_id,
            question=question,
            provider=analytics.get("provider", "unknown"),
            latency_ms=analytics.get("latency_ms", 0),
            chunks_retrieved=analytics.get("chunks_retrieved", 0),
            had_answer=analytics.get("had_answer", False),
            confidence_score=analytics.get("confidence_score", 0.0),
            answer_text=answer_text,
            follow_up_questions=follow_up_questions or [],
        )
        db.add(log)
        db.commit()
        return log_id
    except Exception as e:
        logger.error("Failed to persist QueryLog: %s", e)
        db.rollback()
        return None


@router.post("/query", response_model=QueryResponse)
async def ask_question(
    payload: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit a question to the RAG engine (Authenticated users only)."""
    try:
        result = rag_service.answer_query(
            question=payload.question,
            user_id=str(current_user.id),
            chat_history=payload.chat_history,
            provider=payload.provider,
            folder_id=payload.folder_id,
            db=db
        )
    except Exception as exc:
        logger.exception("RAG query failed")
        raise HTTPException(status_code=500, detail=f"Query error: {exc}")

    # Log query analytics
    query_id = None
    confidence_score = None
    if "analytics" in result:
        query_id = _log_query(
            db,
            str(current_user.id),
            payload.question,
            result["analytics"],
            answer_text=result.get("answer"),
            follow_up_questions=result.get("follow_up_questions", []),
        )
        confidence_score = result["analytics"].get("confidence_score")

    sources = [
        SourceCitation(
            filename=s["filename"],
            chunk_excerpt=s["chunk_excerpt"],
            relevance_score=s.get("relevance_score"),
        )
        for s in result.get("sources", [])
    ]

    return QueryResponse(
        answer=result["answer"],
        sources=sources,
        query_id=query_id,
        confidence_score=confidence_score,
        follow_up_questions=result.get("follow_up_questions", []),
    )


@router.get("/query/stream")
async def stream_question(
    question: str = Query(..., min_length=1, max_length=2000),
    provider: str = Query(default="openai"),
    folder_id: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """SSE streaming endpoint for token-by-token RAG responses."""
    query_id = str(uuid.uuid4())

    async def event_generator():
        analytics_data = {}
        followups_data: list[str] = []
        full_answer = ""

        async for event in rag_service.stream_answer_query(
            question=question,
            user_id=str(current_user.id),
            provider=provider,
            folder_id=folder_id,
            query_id=query_id,
            db=db,
        ):
            yield event

            # Capture analytics from the analytics event for later logging
            if '"type": "analytics"' in event or '"type":"analytics"' in event:
                try:
                    data_line = event.strip().replace("data: ", "", 1)
                    analytics_data = json.loads(data_line)
                except Exception:
                    pass

            # Capture follow-ups for DB persistence
            if '"type": "followups"' in event or '"type":"followups"' in event:
                try:
                    data_line = event.strip().replace("data: ", "", 1)
                    parsed = json.loads(data_line)
                    followups_data = parsed.get("questions", [])
                except Exception:
                    pass

            # Accumulate answer tokens
            if '"type": "token"' in event or '"type":"token"' in event:
                try:
                    data_line = event.strip().replace("data: ", "", 1)
                    parsed = json.loads(data_line)
                    full_answer += parsed.get("content", "")
                except Exception:
                    pass

        # Log query after stream completes — use pre-assigned query_id
        if analytics_data:
            try:
                log = QueryLog(
                    id=query_id,
                    user_id=str(current_user.id),
                    question=question,
                    provider=analytics_data.get("provider", provider),
                    latency_ms=analytics_data.get("latency_ms", 0),
                    chunks_retrieved=analytics_data.get("chunks_retrieved", 0),
                    had_answer=analytics_data.get("had_answer", False),
                    confidence_score=analytics_data.get("confidence_score", 0.0),
                    answer_text=full_answer or None,
                    follow_up_questions=followups_data or [],
                )
                db.add(log)
                db.commit()
            except Exception as e:
                logger.error("Failed to persist QueryLog: %s", e)
                db.rollback()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/query/history")
async def get_query_history(
    limit: int = Query(10, gt=0, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve the recent query history for the current user."""
    queries = db.query(QueryLog).filter(
        QueryLog.user_id == str(current_user.id)
    ).order_by(QueryLog.created_at.desc()).limit(limit).all()
    
    return queries


@router.post("/query/{query_id}/feedback")
async def give_feedback(
    query_id: str,
    payload: FeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit thumbs up (1) or thumbs down (-1) for a specific query."""
    query = db.query(QueryLog).filter(
        QueryLog.id == query_id,
        QueryLog.user_id == str(current_user.id)
    ).first()
    if not query:
        raise HTTPException(status_code=404, detail="Query log not found")

    existing = db.query(QueryFeedback).filter(QueryFeedback.query_id == query_id).first()
    if existing:
        existing.feedback = payload.feedback
        existing.created_at = datetime.utcnow()
    else:
        feedback = QueryFeedback(
            id=str(uuid.uuid4()),
            user_id=str(current_user.id),
            query_id=query_id,
            feedback=payload.feedback
        )
        db.add(feedback)
    
    db.commit()
    return {"status": "success", "feedback": payload.feedback}


@router.patch("/query/{query_id}/annotation", response_model=AnnotationResponse)
async def save_annotation(
    query_id: str,
    payload: AnnotationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save or update a personal annotation on an AI answer."""
    query = db.query(QueryLog).filter(
        QueryLog.id == query_id,
        QueryLog.user_id == str(current_user.id)
    ).first()
    if not query:
        raise HTTPException(status_code=404, detail="Query not found")

    query.user_annotation = payload.annotation
    db.commit()

    return AnnotationResponse(
        query_id=query_id,
        annotation=payload.annotation,
        updated_at=datetime.utcnow().isoformat(),
    )
