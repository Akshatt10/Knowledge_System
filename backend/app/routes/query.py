"""Q&A / chat endpoint powered by the RAG engine."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Depends
from app.services.auth import get_current_user
from app.models.database import User

from app.models.schemas import QueryRequest, QueryResponse, SourceCitation
from app.services.rag import rag_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Query"])


@router.post("/query", response_model=QueryResponse)
async def ask_question(
    payload: QueryRequest,
    current_user: User = Depends(get_current_user)
):
    """Submit a question to the RAG engine (Authenticated users only)."""
    try:
        result = rag_service.answer_query(
            question=payload.question,
            chat_history=payload.chat_history,
            provider=payload.provider
        )
    except Exception as exc:
        logger.exception("RAG query failed")
        raise HTTPException(status_code=500, detail=f"Query error: {exc}")

    sources = [
        SourceCitation(
            filename=s["filename"],
            chunk_excerpt=s["chunk_excerpt"],
            relevance_score=s.get("relevance_score"),
        )
        for s in result.get("sources", [])
    ]

    return QueryResponse(answer=result["answer"], sources=sources)
