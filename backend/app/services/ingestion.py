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
from app.services.s3 import s3_service

logger = logging.getLogger(__name__)


def ingest_document(file_path: str | Path, filename: str, file_type: str) -> dict:
    """
    LangChain ingestion pipeline + S3 upload.

    1. Upload the raw file to MinIO/S3.
    2. Load text using LangChain Loaders.
    3. Split text using RecursiveCharacterTextSplitter.
    4. Store in ChromaDB vectorstore.
    """
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # 1. Upload to S3
    object_name = f"{doc_id}_{filename}"
    s3_uri = s3_service.upload_file(str(file_path), object_name)
    logger.info("Uploaded %s to S3 at %s", filename, s3_uri)

    # 2. Extract using LangChain Loaders
    loader_map = {
        "pdf": PyPDFLoader,
        "txt": TextLoader,
        "docx": Docx2txtLoader
    }
    
    loader_class = loader_map.get(file_type.lower())
    if not loader_class:
        raise ValueError(f"Unsupported file type: {file_type}")
        
    loader = loader_class(str(file_path))
    raw_docs = loader.load()
    
    if not raw_docs:
        raise ValueError(f"No text could be extracted from '{filename}'.")

    # 3. Chunk
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
    )
    chunks = splitter.split_documents(raw_docs)
    logger.info("Split '%s' into %d chunks", filename, len(chunks))

    # 4. Add Metadata
    for i, chunk in enumerate(chunks):
        chunk.metadata.update({
            "document_id": doc_id,
            "filename": filename,
            "file_type": file_type,
            "chunk_index": i,
            "uploaded_at": now,
            "s3_uri": s3_uri
        })

    # 5. Embed + store in Chroma
    chunk_count = vector_store.add_documents(chunks)

    # Note: We keep the file in settings.UPLOAD_DIR locally as well for fallback,
    # or we can delete it since it's on S3. For now we leave it per original logic.

    return {
        "document_id": doc_id,
        "filename": filename,
        "chunk_count": chunk_count,
        "s3_uri": s3_uri
    }
