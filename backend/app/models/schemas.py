"""Pydantic request / response schemas for the Knowledge Intelligence System."""

from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


# ── Document Endpoints ─────────────────────────────────────────────────


class UploadResult(BaseModel):
    """Result for a single file in a bulk upload."""
    document_id: str
    filename: str
    chunk_count: int

class UploadResponse(BaseModel):
    """Returned after a successful bulk document upload + ingestion."""
    results: list[UploadResult]
    message: str = "Documents ingested successfully"
    total_files: int


class UploadJobResponse(BaseModel):
    """Returned immediately when upload is accepted for background processing."""
    job_id: str
    filename: str
    status: str = "pending"
    message: str = "File accepted. Processing in background."


class JobStatusResponse(BaseModel):
    """Status of a background ingestion job."""
    job_id: str
    status: str  # pending | processing | done | failed
    filename: str
    result: UploadResult | None = None
    error: str | None = None


class DocumentInfo(BaseModel):
    """Metadata for a single document in the knowledge base."""

    document_id: str
    filename: str
    chunk_count: int
    uploaded_at: str
    file_type: str
    folder_id: str | None = None
    summary: str | None = None


class DocumentListResponse(BaseModel):
    """List of all ingested documents."""

    documents: list[DocumentInfo]
    total: int


class DeleteResponse(BaseModel):
    """Returned after deleting a document."""

    message: str
    document_id: str


# ── Folder Endpoints ───────────────────────────────────────────────────


class FolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class FolderInfo(BaseModel):
    id: str
    name: str
    created_at: str


class FolderListResponse(BaseModel):
    folders: list[FolderInfo]


class MoveToFolderRequest(BaseModel):
    document_ids: list[str]
    folder_id: str | None = None


# ── Query Endpoints ────────────────────────────────────────────────────


class QueryRequest(BaseModel):
    """User question submitted to the RAG engine."""

    question: str = Field(..., min_length=1, max_length=2000)
    provider: str = Field(default="openai", description="The LLM provider to use (openai or gemini).")
    chat_history: list[dict[str, str]] | None = Field(
        default=None,
        description="Optional list of previous exchanges: [{role, content}, ...]",
    )
    folder_id: str | None = Field(default=None, description="Optional folder to restrict the query to.")


class SourceCitation(BaseModel):
    """A single source chunk backing an AI answer."""

    filename: str
    chunk_excerpt: str
    relevance_score: float | None = None


class QueryResponse(BaseModel):
    """AI-generated answer plus source citations and reliability metrics."""

    answer: str
    sources: list[SourceCitation]
    query_id: str | None = None
    confidence_score: float | None = None
    follow_up_questions: list[str] = []


class FeedbackRequest(BaseModel):
    """User feedback for a query."""
    feedback: int = Field(..., description="1 for thumbs up, -1 for thumbs down")


class FeedbackStatsResponse(BaseModel):
    """Aggregated feedback metrics."""
    total_positive: int
    total_negative: int
    positive_rate_percent: float
    breakdown_by_folder: list[dict] | None = None


class AnnotationRequest(BaseModel):
    """Payload for saving a personal annotation against a query answer."""
    annotation: str = Field(..., max_length=5000)


class AnnotationResponse(BaseModel):
    """Returned after saving an annotation."""
    query_id: str
    annotation: str
    updated_at: str


# ── Batch Research Mode ────────────────────────────────────────────────


class BatchQueryRequest(BaseModel):
    """User submits a checklist of questions to run as a batch."""
    questions: list[str] = Field(..., min_length=1, max_length=50)
    folder_id: str | None = Field(default=None, description="Optional folder to scope all queries to.")
    provider: str = Field(default="openai")


class CheckListExtractionRequest(BaseModel):
    """Request to extract a checklist automatically from a document."""
    document_id: str
    provider: str = Field(default="openai")


class BatchCheckpointResult(BaseModel):
    """Result for a single checklist item in batch research."""
    question: str
    coverage: str  # "strong", "partial", "none"
    answer: str
    sources: list[SourceCitation]
    confidence_score: float | None = None


class BatchReportResponse(BaseModel):
    """Compiled research report from batch queries."""
    results: list[BatchCheckpointResult]
    total_checkpoints: int
    strong_coverage: int
    partial_coverage: int
    no_coverage: int


# ── URL Ingestion ──────────────────────────────────────────────────────


class URLIngestRequest(BaseModel):
    """User pastes a URL to scrape and ingest as a document."""
    url: str = Field(..., min_length=10, max_length=2000)
    folder_id: str | None = None


# ── Admin Endpoints ────────────────────────────────────────────────────


class StatsResponse(BaseModel):
    """Collection-level statistics."""

    total_documents: int
    total_chunks: int
    total_users: int
    collection_name: str


class UserOut(BaseModel):
    """Safe user data for administrative listing."""
    id: str
    email: str
    role: str
    is_active: bool = True

class UserUpdate(BaseModel):
    """Payload for updating user roles or status."""
    role: str | None = None
    is_active: bool | None = None

class HealthResponse(BaseModel):
    """Health check payload."""

    status: str = "healthy"
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ── Connector Endpoints ────────────────────────────────────────────────


class ConnectedAccountResponse(BaseModel):
    id: str
    provider: str
    connected_at: str
    last_synced_at: str | None = None


class ConnectorListResponse(BaseModel):
    accounts: list[ConnectedAccountResponse]


class SyncResponse(BaseModel):
    synced_count: int
    new_documents: list[str]
    errors: list[str]
    

# ── Admin Stats ──────────────────────────────────────────────────────────

class DataPoint(BaseModel):
    timestamp: str
    value: int

class TimeSeriesResponse(BaseModel):
    user_growth: list[DataPoint]
    document_growth: list[DataPoint]
    active_users: list[DataPoint]
    ai_queries: list[DataPoint]


class CLIStatusResponse(BaseModel):
    """Summarized status for the Home dashboard and CLI."""
    total_docs: int
    queries_this_week: int
    vault_health: float  # average confidence of last 20 queries

class DeepResearchRequest(BaseModel):
    """Payload for generating a deep research long-form report."""
    prompt: str = Field(..., max_length=5000)
    folder_id: str | None = None
    provider: str = "gemini"

class DeepResearchResponse(BaseModel):
    """Response containing the long-form markdown report."""
    report: str
    sources: list[SourceCitation]

# ── Graph Endpoints ───────────────────────────────────────────────────

class GraphNodeInfo(BaseModel):
    id: str
    label: str  # maps to entity_name / filename
    type: str   # 'document', 'folder', 'concept', 'person', etc.
    document_id: str | None = None
    folder_id: str | None = None
    chunk_count: int | None = None
    summary: str | None = None

class GraphEdgeInfo(BaseModel):
    id: str
    source: str
    target: str
    label: str  # relationship
    weight: float = 1.0
    chunk_id: str | None = None

class GraphDataResponse(BaseModel):
    nodes: list[GraphNodeInfo]
    edges: list[GraphEdgeInfo]
