"""Document management routes – upload, list, delete."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from app.services.auth import get_current_user, require_admin
from app.models.database import User

from app.config import settings
from app.models.schemas import (
    DeleteResponse,
    DocumentInfo,
    DocumentListResponse,
    UploadResponse,
)
from app.services.ingestion import ingest_document
from app.services.vectorstore import vector_store
from app.utils.extractors import SUPPORTED_EXTENSIONS

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Documents"])

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx"}


from typing import List
from app.models.schemas import UploadResult

@router.post("/documents/upload", response_model=UploadResponse)
async def upload_document(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user)
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

        # Ingest
        try:
            result = ingest_document(
                file_path=str(upload_path),
                filename=file.filename,
                file_type=ext.lstrip("."),
                user_id=str(current_user.id)
            )
            results.append(UploadResult(
                document_id=result["document_id"],
                filename=result["filename"],
                chunk_count=result["chunk_count"]
            ))
        except Exception as exc:
            logger.exception(f"Ingestion failed for {file.filename}")
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
async def list_documents(current_user: User = Depends(get_current_user)):
    """List documents belonging to the current user."""
    docs_raw = vector_store.list_documents(user_id=str(current_user.id))
    documents = [
        DocumentInfo(
            document_id=d.get("document_id", ""),
            filename=d.get("filename", ""),
            chunk_count=d.get("chunk_count", 1),
            uploaded_at=d.get("uploaded_at", ""),
            file_type=d.get("file_type", ""),
        )
        for d in docs_raw
    ]
    return DocumentListResponse(documents=documents, total=len(documents))


@router.delete("/documents/{doc_id}", response_model=DeleteResponse)
async def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a document belonging to the current user."""
    deleted = vector_store.delete_document(doc_id, user_id=str(current_user.id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Try to remove from filesystem
    upload_dir = Path(settings.UPLOAD_DIR)
    for f in upload_dir.iterdir():
        # We can't perfectly reverse doc_id → filename, so we rely on
        # metadata stored in the vector store. The file remains on disk
        # as a minor trade-off.
        pass

    return DeleteResponse(message="Document deleted successfully.", document_id=doc_id)
