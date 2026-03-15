"""Q&A / chat endpoint powered by the RAG engine."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from app.services.auth import get_current_user, get_db
from app.models.database import User, QueryLog
from sqlalchemy.orm import Session

from app.models.schemas import QueryRequest, QueryResponse, SourceCitation
from app.services.rag import rag_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Query"])


def _log_query(db: Session, user_id: str, question: str, analytics: dict):
    """Persist a QueryLog record for analytics."""
    try:
        log = QueryLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            question=question,
            provider=analytics.get("provider", "unknown"),
            latency_ms=analytics.get("latency_ms", 0),
            chunks_retrieved=analytics.get("chunks_retrieved", 0),
            had_answer=analytics.get("had_answer", False),
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.error("Failed to persist QueryLog: %s", e)
        db.rollback()


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
    if "analytics" in result:
        _log_query(db, str(current_user.id), payload.question, result["analytics"])

    sources = [
        SourceCitation(
            filename=s["filename"],
            chunk_excerpt=s["chunk_excerpt"],
            relevance_score=s.get("relevance_score"),
        )
        for s in result.get("sources", [])
    ]

    return QueryResponse(answer=result["answer"], sources=sources)


@router.get("/query/stream")
async def stream_question(
    question: str = Query(..., min_length=1, max_length=2000),
    provider: str = Query(default="openai"),
    folder_id: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """SSE streaming endpoint for token-by-token RAG responses."""

    async def event_generator():
        analytics_data = {}

        async for event in rag_service.stream_answer_query(
            question=question,
            user_id=str(current_user.id),
            provider=provider,
            folder_id=folder_id,
            db=db,
        ):
            yield event

            # Capture analytics from the analytics event for logging
            if '"type": "analytics"' in event or '"type":"analytics"' in event:
                import json
                try:
                    # Parse the SSE data line
                    data_line = event.strip().replace("data: ", "", 1)
                    analytics_data = json.loads(data_line)
                except Exception:
                    pass

        # Log query after stream completes
        if analytics_data:
            _log_query(db, str(current_user.id), question, analytics_data)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
