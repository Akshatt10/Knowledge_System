"""Pydantic request / response schemas for the Knowledge Intelligence System."""

from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


# ── Document Endpoints ─────────────────────────────────────────────────


class UploadResponse(BaseModel):
    """Returned after a successful document upload + ingestion."""

    document_id: str
    filename: str
    chunk_count: int
    message: str = "Document ingested successfully"


class DocumentInfo(BaseModel):
    """Metadata for a single document in the knowledge base."""

    document_id: str
    filename: str
    chunk_count: int
    uploaded_at: str
    file_type: str


class DocumentListResponse(BaseModel):
    """List of all ingested documents."""

    documents: list[DocumentInfo]
    total: int


class DeleteResponse(BaseModel):
    """Returned after deleting a document."""

    message: str
    document_id: str


# ── Query Endpoints ────────────────────────────────────────────────────


class QueryRequest(BaseModel):
    """User question submitted to the RAG engine."""

    question: str = Field(..., min_length=1, max_length=2000)
    provider: str = Field(default="openai", description="The LLM provider to use (openai or gemini).")
    chat_history: list[dict[str, str]] | None = Field(
        default=None,
        description="Optional list of previous exchanges: [{role, content}, ...]",
    )


class SourceCitation(BaseModel):
    """A single source chunk backing an AI answer."""

    filename: str
    chunk_excerpt: str
    relevance_score: float | None = None


class QueryResponse(BaseModel):
    """AI-generated answer plus source citations."""

    answer: str
    sources: list[SourceCitation]


# ── Admin Endpoints ────────────────────────────────────────────────────


class StatsResponse(BaseModel):
    """Collection-level statistics."""

    total_documents: int
    total_chunks: int
    collection_name: str


class HealthResponse(BaseModel):
    """Health check payload."""

    status: str = "healthy"
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
