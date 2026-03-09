"""Document ingestion pipeline using LangChain Loaders and S3."""

from __future__ import annotations

import logging
import uuid
import os
from datetime import datetime, timezone
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain_experimental.text_splitter import SemanticChunker

from app.config import settings
from app.services.vectorstore import vector_store
from app.utils.encryption import encryption_service
from app.services.s3 import s3_service

logger = logging.getLogger(__name__)


def ingest_document(file_path: str | Path, filename: str, file_type: str, user_id: str) -> dict:
    """
    Enterprise-grade ingestion pipeline with Envelope Encryption.

    1. Load text using LangChain Loaders (Local RAW).
    2. Split + Embed in Vector Database (Local RAW).
    3. Generate per-file DEK and encrypt RAW bytes.
    4. Upload encrypted blob to S3.
    """
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # 0. Read raw bytes once (to avoid multiple disk reads and ensure consistency)
    with open(file_path, "rb") as f:
        raw_bytes = f.read()

    # 1. AI Processing (Perform this FIRST to fail fast)
    loader_map = {
        "pdf": PyPDFLoader,
        "txt": TextLoader,
        "docx": Docx2txtLoader,
        "json": TextLoader
    }
    
    loader_class = loader_map.get(file_type.lower())
    if not loader_class:
        raise ValueError(f"Unsupported file type: {file_type}")
        
    # Python loaders often need a file path, so we use the local temp file
    loader = loader_class(str(file_path))
    raw_docs = loader.load()
    
    if not raw_docs:
        raise ValueError(f"No text could be extracted from '{filename}'.")

    splitter = SemanticChunker(
        vector_store.embeddings,
        breakpoint_threshold_type="percentile",
        breakpoint_threshold_amount=80
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

    # Embed + store in Vector Store (Fail fast here before cloud upload)
    chunk_count = vector_store.add_documents(chunks)
    logger.info("Successfully vectorized %d chunks for %s", chunk_count, filename)

    # 2. ENVELOPE ENCRYPTION (Local)
    dek = encryption_service.generate_dek()
    encrypted_bytes = encryption_service.encrypt_file(raw_bytes, dek)
    
    # Encrypt the DEK with our master key for storage in Postgres
    encrypted_dek_b64 = encryption_service.encrypt_dek(dek)

    # 3. SECURE CLOUD STORAGE (S3)
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
        "object_name": object_name # Crucial for rollback logic
    }
