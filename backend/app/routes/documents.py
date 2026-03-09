"""Document management routes – upload, list, delete."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.orm import Session
from app.services.auth import get_current_user, require_admin, get_db
from app.models.database import User, Document

from app.config import settings
from app.models.schemas import (
    DeleteResponse,
    DocumentInfo,
    DocumentListResponse,
    UploadResponse,
)
from app.services.ingestion import ingest_document
from app.services.vectorstore import vector_store
from app.services.s3 import s3_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Documents"])

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx", ".json"}


from typing import List
from app.models.schemas import UploadResult

@router.post("/documents/upload", response_model=UploadResponse)
async def upload_document(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload multiple documents (PDF, TXT or DOCX)."""
    results = []
    
    for file in files:
        if not file.filename:
            continue

        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            logger.warning(f"Skipping unsupported file type: {ext}")
            continue

        # Save to upload directory
        upload_path = Path(settings.UPLOAD_DIR) / file.filename
        try:
            with open(upload_path, "wb") as buf:
                shutil.copyfileobj(file.file, buf)
        except Exception as exc:
            logger.exception(f"Failed to save {file.filename}")
            continue

        # Ingest (Embed -> Encrypt -> Upload)
        try:
            result = ingest_document(
                file_path=str(upload_path),
                filename=file.filename,
                file_type=ext.lstrip("."),
                user_id=str(current_user.id)
            )
        except Exception as exc:
            logger.exception(f"Ingestion failed for {file.filename}")
            upload_path.unlink(missing_ok=True)
            continue
            
        # Success: save record to Postgres
        try:
            db_doc = Document(
                id=result["document_id"],
                user_id=str(current_user.id),
                filename=result["filename"],
                file_type=ext.lstrip("."),
                chunk_count=str(result["chunk_count"]),
                is_encrypted="TRUE",
                encrypted_dek=result.get("encrypted_dek"),
                s3_uri=result.get("s3_uri")
            )
            db.add(db_doc)
            db.commit()
            
            results.append(UploadResult(
                document_id=result["document_id"],
                filename=result["filename"],
                chunk_count=result["chunk_count"]
            ))

            # Security: Wipe local raw file
            upload_path.unlink(missing_ok=True)
            
        except Exception as exc:
            logger.exception(f"Failed to save document metadata to Postgres for {file.filename}")
            db.rollback()
            # ROLLBACK: If DB fails, delete S3 backup
            if "object_name" in result:
                s3_service.delete_file(result["object_name"])
            upload_path.unlink(missing_ok=True)
            continue

    if not results:
        raise HTTPException(status_code=400, detail="No valid documents were uploaded.")

    return UploadResponse(
        results=results,
        total_files=len(results),
        message=f"Successfully ingested {len(results)} documents."
    )


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List documents belonging to the current user."""
    docs_raw = db.query(Document).filter(Document.user_id == str(current_user.id)).all()
    
    documents = [
        DocumentInfo(
            document_id=d.id,
            filename=d.filename,
            chunk_count=int(float(d.chunk_count)) if d.chunk_count else 0,
            uploaded_at=d.uploaded_at.isoformat() if d.uploaded_at else "",
            file_type=d.file_type or "",
        )
        for d in docs_raw
    ]
    return DocumentListResponse(documents=documents, total=len(documents))


@router.delete("/documents/{doc_id}", response_model=DeleteResponse)
async def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Fetch from Postgres
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == str(current_user.id)).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    # 2. Delete from Pinecone
    vector_store.delete_document(doc_id, user_id=str(current_user.id))
    
    # 3. Delete from S3 (Backup)
    if doc.s3_uri:
        try:
            object_key = doc.s3_uri.replace(f"s3://{settings.S3_BUCKET_NAME}/", "")
            s3_service.delete_file(object_key)
        except Exception as e:
            logger.error(f"Failed to delete S3 object for {doc_id}: {e}")

    # 4. Delete from Postgres
    db.delete(doc)
    db.commit()

    return DeleteResponse(message="Document deleted successfully.", document_id=doc_id)
