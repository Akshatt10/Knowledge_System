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
    UserUpdate
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
