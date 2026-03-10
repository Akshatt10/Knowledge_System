"""Document management routes – upload, list, delete."""

from __future__ import annotations

import logging
import shutil
import uuid
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.services.auth import get_current_user, require_admin, get_db
from app.models.database import User, Document

from app.config import settings
from app.models.schemas import (
    DeleteResponse,
    DocumentInfo,
    DocumentListResponse,
    UploadResponse,
    UploadResult,
    UploadJobResponse,
    JobStatusResponse,
)
from app.services.ingestion import ingest_document
from app.services.vectorstore import vector_store
from app.services.s3 import s3_service
from app.services.job_store import job_store
from app.services.auth import SessionLocal

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Documents"])

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx", ".json"}
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB


# ── Background worker ──────────────────────────────────────────────────

def _run_ingestion_job(
    job_id: str,
    file_path: str,
    filename: str,
    file_type: str,
    user_id: str,
):
    """Runs in a background thread. Handles full ingestion + DB commit."""
    db = SessionLocal()
    try:
        job_store.update(job_id, status="processing")

        result = ingest_document(
            file_path=file_path,
            filename=filename,
            file_type=file_type,
            user_id=user_id,
        )

        # Save record to Postgres
        db_doc = Document(
            id=result["document_id"],
            user_id=user_id,
            filename=result["filename"],
            file_type=file_type,
            chunk_count=str(result["chunk_count"]),
            is_encrypted="TRUE",
            encrypted_dek=result.get("encrypted_dek"),
            s3_uri=result.get("s3_uri"),
        )
        db.add(db_doc)
        db.commit()

        job_store.update(job_id, status="done", result={
            "document_id": result["document_id"],
            "filename": result["filename"],
            "chunk_count": result["chunk_count"],
        })
        logger.info("Job %s completed for %s", job_id, filename)

    except Exception as exc:
        db.rollback()
        logger.exception("Ingestion job %s failed for %s", job_id, filename)
        job_store.update(job_id, status="failed", error=str(exc))
    finally:
        db.close()
        # Cleanup temp file
        try:
            os.remove(file_path)
        except OSError:
            pass


# ── Routes ─────────────────────────────────────────────────────────────

from typing import List


@router.post("/documents/upload", response_model=list[UploadJobResponse])
async def upload_document(
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_user),
):
    """Upload documents for async background processing.
    
    Files are validated and saved immediately, then ingestion
    (chunking → embedding → encryption → S3) runs in the background.
    Returns a list of job IDs for polling.
    """
    jobs: list[UploadJobResponse] = []

    for file in files:
        if not file.filename:
            continue

        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            logger.warning("Skipping unsupported file type: %s", ext)
            continue

        # Read and validate size before saving
        contents = await file.read()
        if len(contents) > MAX_UPLOAD_SIZE:
            logger.warning("File %s exceeds 20MB limit, skipping", file.filename)
            continue

        # Save to temp location
        job_id = str(uuid.uuid4())
        temp_path = Path(settings.UPLOAD_DIR) / f"{job_id}_{file.filename}"
        try:
            with open(temp_path, "wb") as buf:
                buf.write(contents)
        except Exception:
            logger.exception("Failed to save %s", file.filename)
            continue

        # Register the job
        job_store.create(job_id, user_id=str(current_user.id), filename=file.filename)

        # Schedule background ingestion
        background_tasks.add_task(
            _run_ingestion_job,
            job_id=job_id,
            file_path=str(temp_path),
            filename=file.filename,
            file_type=ext.lstrip("."),
            user_id=str(current_user.id),
        )

        jobs.append(UploadJobResponse(
            job_id=job_id,
            filename=file.filename,
            status="pending",
        ))

    if not jobs:
        raise HTTPException(status_code=400, detail="No valid documents were provided.")

    return jobs


@router.get("/documents/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """Poll the status of an ingestion job."""
    job = job_store.get(job_id)
    if not job or job["user_id"] != str(current_user.id):
        raise HTTPException(status_code=404, detail="Job not found.")

    result_data = None
    if job["result"]:
        result_data = UploadResult(
            document_id=job["result"]["document_id"],
            filename=job["result"]["filename"],
            chunk_count=job["result"]["chunk_count"],
        )

    return JobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        filename=job["filename"],
        result=result_data,
        error=job["error"],
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
            logger.error("Failed to delete S3 object for %s: %s", doc_id, e)

    # 4. Delete from Postgres
    db.delete(doc)
    db.commit()

    return DeleteResponse(message="Document deleted successfully.", document_id=doc_id)
