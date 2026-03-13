"""Admin & health-check routes."""

from __future__ import annotations

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.services.auth import require_admin, get_db
from app.models.database import User, Document
from app.models.schemas import (
    HealthResponse, 
    StatsResponse, 
    UserOut, 
    UserUpdate,
    TimeSeriesResponse
)
from app.services.vectorstore import vector_store

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Admin"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Basic health probe for Docker / Kubernetes readiness checks."""
    return HealthResponse()


@router.get("/admin/stats", response_model=StatsResponse)
async def collection_stats(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Return high-level knowledge base statistics (Admin only)."""
    user_count = db.query(User).count()
    doc_count = db.query(Document).count()
    stats = vector_store.get_collection_stats()
    return StatsResponse(
        total_documents=doc_count,
        total_chunks=stats["total_chunks"],
        total_users=user_count,
        collection_name=stats["collection_name"]
    )

@router.get("/admin/stats/time-series", response_model=TimeSeriesResponse)
async def time_series_stats(
    period: str = "30d",
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Return time-series statistics for user signups and document uploads."""
    from datetime import datetime, timedelta
    from sqlalchemy import func
    from app.models.database import ChatMessage

    now = datetime.utcnow()
    
    # Determine the time horizon and formatting
    if period == "1d":
        start_date = now - timedelta(days=1)
        def format_date(d: datetime): return d.strftime('%Y-%m-%d %H:00')
    elif period == "7d":
        start_date = now - timedelta(days=7)
        def format_date(d: datetime): return d.strftime('%Y-%m-%d')
    elif period == "30d":
        start_date = now - timedelta(days=30)
        def format_date(d: datetime): return d.strftime('%Y-%m-%d')
    elif period == "6m":
        start_date = now - timedelta(days=6 * 30)
        def format_date(d: datetime): return d.strftime('%Y-%m')
    elif period == "12m":
        start_date = now - timedelta(days=365)
        def format_date(d: datetime): return d.strftime('%Y-%m')
    else:
        raise HTTPException(status_code=400, detail="Invalid period. Use 1d, 7d, 30d, 6m, or 12m.")

    # 1. Fetch Users Growth
    users = db.query(User.created_at).filter(User.created_at >= start_date).all()
    user_counts = {}
    for u in users:
        if u[0]:
            k = format_date(u[0])
            user_counts[k] = user_counts.get(k, 0) + 1

    # 2. Fetch Documents (and collect user_ids for active users)
    docs = db.query(Document.uploaded_at, Document.user_id).filter(Document.uploaded_at >= start_date).all()
    doc_counts = {}
    active_users_map = {} # Maps formatted_date -> set(user_ids)
    
    for d in docs:
        if d[0]:
            k = format_date(d[0])
            doc_counts[k] = doc_counts.get(k, 0) + 1
            if k not in active_users_map:
                active_users_map[k] = set()
            if d[1]:  # user_id
                active_users_map[k].add(d[1])

    # 3. Fetch AI Queries (Chat Messages sent by humans)
    # sender_id is NULL for AI responses, so we only count non-null sender_ids
    queries = db.query(ChatMessage.created_at, ChatMessage.sender_id).filter(
        ChatMessage.created_at >= start_date,
        ChatMessage.sender_id.isnot(None)
    ).all()
    
    query_counts = {}
    for q in queries:
        if q[0]:
            k = format_date(q[0])
            query_counts[k] = query_counts.get(k, 0) + 1
            if k not in active_users_map:
                active_users_map[k] = set()
            if q[1]: # sender_id
                active_users_map[k].add(q[1])

    # 4. Generate empty timeline
    timeline = []
    currentp = start_date
    if period == "1d":
        while currentp <= now + timedelta(hours=1):
            timeline.append(format_date(currentp))
            currentp += timedelta(hours=1)
    elif period in ["7d", "30d"]:
        while currentp <= now + timedelta(days=1):
            timeline.append(format_date(currentp))
            currentp += timedelta(days=1)
    elif period in ["6m", "12m"]:
        while currentp <= now + timedelta(days=32):
            timeline.append(format_date(currentp))
            # Rough month addition
            year = currentp.year + (currentp.month // 12)
            month = ((currentp.month % 12) + 1)
            currentp = currentp.replace(year=year, month=month, day=1)
    
    timeline = sorted(list(set(timeline)))

    user_growth = [{"timestamp": t, "value": user_counts.get(t, 0)} for t in timeline]
    doc_growth = [{"timestamp": t, "value": doc_counts.get(t, 0)} for t in timeline]
    ai_queries = [{"timestamp": t, "value": query_counts.get(t, 0)} for t in timeline]
    
    # Active users value is the length of the set of unique user IDs for that timestamp
    active_users = [{"timestamp": t, "value": len(active_users_map.get(t, set()))} for t in timeline]

    return TimeSeriesResponse(
        user_growth=user_growth,
        document_growth=doc_growth,
        active_users=active_users,
        ai_queries=ai_queries
    )
    


@router.get("/admin/users", response_model=List[UserOut])
async def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all registered users (Admin only)."""
    users = db.query(User).all()
    return [
        UserOut(
            id=user.id,
            email=user.email,
            role=user.role,
            is_active=True
        ) for user in users
    ]


@router.patch("/admin/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update user role or status (Admin only)."""
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if payload.role:
        db_user.role = payload.role
    
    db.commit()
    db.refresh(db_user)
    return UserOut(
        id=db_user.id, 
        email=db_user.email, 
        role=db_user.role,
        is_active=True
    )


@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete a user (Admin only)."""
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")
        
    db.delete(db_user)
    db.commit()
    return {"message": "User deleted successfully", "user_id": user_id}
