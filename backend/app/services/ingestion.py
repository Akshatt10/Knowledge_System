"""Document ingestion pipeline using LangChain Loaders and S3."""

from __future__ import annotations

import logging
import uuid
import os
from datetime import datetime, timezone
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings
from app.services.vectorstore import vector_store
from app.utils.encryption import encryption_service
from app.services.s3 import s3_service

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB hard limit


def ingest_document(file_path: str | Path, filename: str, file_type: str, user_id: str) -> dict:
    """
    """
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    with open(file_path, "rb") as f:
        raw_bytes = f.read()

    if len(raw_bytes) > MAX_FILE_SIZE_BYTES:
        raise ValueError(f"File '{filename}' exceeds the 20 MB limit ({len(raw_bytes) / 1024 / 1024:.1f} MB).")

    loader_map = {
        "pdf": PyPDFLoader,
        "txt": TextLoader,
        "docx": Docx2txtLoader,
        "json": TextLoader,
        "md": TextLoader
    }

    loader_class = loader_map.get(file_type.lower())
    if not loader_class:
        raise ValueError(f"Unsupported file type: {file_type}")

    loader = loader_class(str(file_path))
    raw_docs = loader.load()

    if not raw_docs:
        raise ValueError(f"No text could be extracted from '{filename}'.")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE or 1000,
        chunk_overlap=settings.CHUNK_OVERLAP or 150,
    )

    temp_chunks = splitter.split_documents(raw_docs)
    chunks = []
    for chunk in temp_chunks:
        chunk.page_content = f"[Source: {filename}]\n{chunk.page_content}"
        chunks.append(chunk)

    for i, chunk in enumerate(chunks):
        chunk.metadata.update({
            "user_id": user_id,
            "document_id": doc_id,
            "filename": filename,
            "file_type": file_type,
            "chunk_index": i,
            "uploaded_at": now
        })

    chunk_count = vector_store.add_documents(chunks)
    logger.info("Successfully vectorized %d chunks for %s", chunk_count, filename)

    dek = encryption_service.generate_dek()
    encrypted_bytes = encryption_service.encrypt_file(raw_bytes, dek)

    encrypted_dek_b64 = encryption_service.encrypt_dek(dek)

    object_name = f"{user_id}/{doc_id}_{filename}.enc"
    s3_uri = s3_service.upload_encrypted_file(encrypted_bytes, object_name)
    logger.info("Zero-Trust: Uploaded ENCRYPTED blob for %s to S3 at %s", filename, s3_uri)

    return {
        "document_id": doc_id,
        "filename": filename,
        "chunk_count": chunk_count,
        "user_id": user_id,
        "s3_uri": s3_uri,
        "is_encrypted": True,
        "encrypted_dek": encrypted_dek_b64,
        "object_name": object_name  # Crucial for rollback logic
    }
