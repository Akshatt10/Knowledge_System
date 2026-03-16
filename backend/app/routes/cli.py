from __future__ import annotations

import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.services.auth import get_current_user, get_db
from app.models.database import User, Document, QueryLog
from app.models.schemas import CLIStatusResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["CLI"])

@router.get("/cli/status", response_model=CLIStatusResponse)
async def get_cli_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return high-level system status for the Home dashboard and CLI."""
    # 1. Total documents (global or per user? let's do per user as it's a personal dashboard)
    doc_count = db.query(Document).filter(Document.user_id == str(current_user.id)).count()
    
    # 2. Queries this week
    one_week_ago = datetime.utcnow() - timedelta(days=7)
    queries_week = db.query(QueryLog).filter(
        QueryLog.user_id == str(current_user.id),
        QueryLog.created_at >= one_week_ago
    ).count()
    
    # 3. Vault Health (avg confidence of last 20 queries)
    last_20 = db.query(QueryLog.confidence_score).filter(
        QueryLog.user_id == str(current_user.id)
    ).order_by(QueryLog.created_at.desc()).limit(20).all()
    
    if not last_20:
        vault_health = 0.0
    else:
        scores = [q[0] for q in last_20 if q[0] is not None]
        vault_health = (sum(scores) / len(scores) * 100) if scores else 0.0
        
    return CLIStatusResponse(
        total_docs=doc_count,
        queries_this_week=queries_week,
        vault_health=round(vault_health, 1)
    )
