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
    URLIngestRequest,
)
from app.services.ingestion import ingest_document
from app.services.vectorstore import vector_store
from app.services.s3 import s3_service
from app.services.job_store import job_store
from app.services.auth import SessionLocal

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Documents"])

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx", ".json", ".md"}
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB


def _run_ingestion_job(
    job_id: str,
    file_path: str,
    filename: str,
    file_type: str,
    user_id: str,
):
    db = SessionLocal()
    try:
        job_store.update(job_id, status="processing")

        result = ingest_document(
            file_path=file_path,
            filename=filename,
            file_type=file_type,
            user_id=user_id,
        )

        db_doc = Document(
            id=result["document_id"],
            user_id=user_id,
            filename=result["filename"],
            file_type=file_type,
            chunk_count=str(result["chunk_count"]),
            is_encrypted="TRUE",
            encrypted_dek=result.get("encrypted_dek"),
            s3_uri=result.get("s3_uri"),
            summary=result.get("summary"),
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
        try:
            os.remove(file_path)
        except OSError:
            pass


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


def _run_url_ingestion_job(
    job_id: str,
    url: str,
    user_id: str,
    folder_id: str | None = None,
):
    """Background task: scrape URL, clean HTML, ingest as text document."""
    import requests
    from bs4 import BeautifulSoup

    db = SessionLocal()
    try:
        job_store.update(job_id, status="processing")

        # 1. Fetch the page (use realistic browser headers to avoid 403s)
        resp = requests.get(url, timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
        })
        resp.raise_for_status()

        # 2. Parse and clean HTML
        soup = BeautifulSoup(resp.content, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)

        if not text or len(text.strip()) < 50:
            raise ValueError("Could not extract meaningful text from this URL.")

        # 3. Derive a readable filename from the page title or URL
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else url
        # Sanitize for use as a filename
        safe_title = "".join(c if c.isalnum() or c in " -_" else "" for c in title)[:80].strip()
        filename = f"web-{safe_title or 'page'}.txt"

        # 4. Save to temp file
        temp_path = Path(settings.UPLOAD_DIR) / f"{job_id}_{filename}"
        with open(temp_path, "w", encoding="utf-8") as f:
            f.write(text)

        try:
            result = ingest_document(
                file_path=str(temp_path),
                filename=filename,
                file_type="txt",
                user_id=user_id,
            )

            db_doc = Document(
                id=result["document_id"],
                user_id=user_id,
                filename=result["filename"],
                file_type="txt",
                chunk_count=str(result["chunk_count"]),
                folder_id=folder_id,
                is_encrypted="TRUE",
                encrypted_dek=result.get("encrypted_dek"),
                s3_uri=result.get("s3_uri"),
                summary=result.get("summary"),
            )
            db.add(db_doc)
            db.commit()

            job_store.update(job_id, status="done", result={
                "document_id": result["document_id"],
                "filename": result["filename"],
                "chunk_count": result["chunk_count"],
            })
            logger.info("URL ingestion job %s completed for %s", job_id, url)
        finally:
            if temp_path.exists():
                os.remove(temp_path)

    except Exception as exc:
        db.rollback()
        logger.exception("URL ingestion job %s failed for %s", job_id, url)
        job_store.update(job_id, status="failed", error=str(exc))
    finally:
        db.close()


@router.post("/documents/ingest-url", response_model=UploadJobResponse)
async def ingest_from_url(
    payload: URLIngestRequest,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_user),
):
    """Scrape a URL and ingest its text content as a document."""
    job_id = str(uuid.uuid4())
    job_store.create(job_id, user_id=str(current_user.id), filename=payload.url)

    background_tasks.add_task(
        _run_url_ingestion_job,
        job_id=job_id,
        url=payload.url,
        user_id=str(current_user.id),
        folder_id=payload.folder_id,
    )

    return UploadJobResponse(
        job_id=job_id,
        filename=payload.url,
        status="pending",
        message="URL accepted. Scraping and ingesting in background.",
    )


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
    docs_raw = db.query(Document).filter(Document.user_id == str(current_user.id)).order_by(Document.uploaded_at.desc()).all()

    documents = [
        DocumentInfo(
            document_id=d.id,
            filename=d.filename,
            chunk_count=int(float(d.chunk_count)) if d.chunk_count else 0,
            uploaded_at=d.uploaded_at.isoformat() if d.uploaded_at else "",
            file_type=d.file_type or "",
            folder_id=d.folder_id,
            summary=d.summary,
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
