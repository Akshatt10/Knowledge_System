"""Admin & health-check routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from app.services.auth import require_admin
from app.models.database import User

from app.models.schemas import HealthResponse, StatsResponse
from app.services.vectorstore import vector_store

router = APIRouter(tags=["Admin"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Basic health probe for Docker / Kubernetes readiness checks."""
    return HealthResponse()


@router.get("/admin/stats", response_model=StatsResponse)
async def collection_stats(current_user: User = Depends(require_admin)):
    """Return high-level knowledge base statistics (Admin only)."""
    stats = vector_store.get_collection_stats()
    return StatsResponse(**stats)
