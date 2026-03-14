"""API routes for managing document folders."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.models.database import Folder, Document
from app.models.schemas import (
    FolderCreate, 
    FolderInfo, 
    FolderListResponse, 
    MoveToFolderRequest,
    DeleteResponse
)
from app.services.auth import get_current_user, get_db
from app.models.database import User

router = APIRouter(prefix="/folders", tags=["folders"])


@router.post("", response_model=FolderInfo, status_code=status.HTTP_201_CREATED)
async def create_folder(
    payload: FolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new folder for the current user."""
    new_folder = Folder(
        id=str(uuid.uuid4()),
        name=payload.name,
        user_id=current_user.id
    )
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    
    return FolderInfo(
        id=new_folder.id,
        name=new_folder.name,
        created_at=new_folder.created_at.isoformat()
    )


@router.get("", response_model=FolderListResponse)
async def list_folders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all folders belonging to the current user."""
    folders = db.query(Folder).filter(Folder.user_id == current_user.id).all()
    return FolderListResponse(
        folders=[
            FolderInfo(
                id=f.id,
                name=f.name,
                created_at=f.created_at.isoformat()
            ) for f in folders
        ]
    )


@router.delete("/{folder_id}", response_model=DeleteResponse)
async def delete_folder(
    folder_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a folder. Documents in the folder are moved to root (Uncategorized)."""
    folder = db.query(Folder).filter(
        Folder.id == folder_id, 
        Folder.user_id == current_user.id
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Move documents to root (null folder_id)
    db.query(Document).filter(Document.folder_id == folder_id).update({"folder_id": None})
    
    db.delete(folder)
    db.commit()
    
    return DeleteResponse(message="Folder deleted", document_id=folder_id)


@router.put("/move-documents", response_model=dict)
async def move_documents_to_folder(
    payload: MoveToFolderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Batch move documents into a folder (or to root if folder_id is None)."""
    # Verify the folder exists if provided
    if payload.folder_id:
        folder = db.query(Folder).filter(
            Folder.id == payload.folder_id,
            Folder.user_id == current_user.id
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Target folder not found")
    
    # Update documents
    db.query(Document).filter(
        Document.id.in_(payload.document_ids),
        Document.user_id == current_user.id
    ).update({"folder_id": payload.folder_id}, synchronize_session=False)
    
    db.commit()
    return {"message": f"Moved {len(payload.document_ids)} documents successfully"}
