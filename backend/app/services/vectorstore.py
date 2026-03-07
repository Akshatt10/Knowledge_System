"""ChromaDB vector store wrapper using LangChain."""

from __future__ import annotations

import logging
from typing import Any

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

from app.config import settings

logger = logging.getLogger(__name__)


class VectorStoreService:
    """Wrapper around LangChain Chroma integration + HuggingFaceEmbeddings."""

    def __init__(self) -> None:
        logger.info("Loading HuggingFace embedding model: %s", settings.EMBEDDING_MODEL)
        self.embeddings = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)
        
        logger.info("Initializing LangChain Chroma client at %s", settings.CHROMA_PERSIST_DIR)
        self.vectorstore = Chroma(
            collection_name=settings.CHROMA_COLLECTION_NAME,
            embedding_function=self.embeddings,
            persist_directory=str(settings.CHROMA_PERSIST_DIR)
        )

    def get_retriever(self, k: int | None = None):
        """Returns the LangChain retriever interface."""
        top_k = k or settings.TOP_K_RESULTS
        return self.vectorstore.as_retriever(search_kwargs={"k": top_k})

    def add_documents(self, documents: list) -> int:
        """Add LangChain Document objects to ChromaDB. Returns count."""
        ids = self.vectorstore.add_documents(documents)
        logger.info("Upserted %d docs into ChromaDB", len(ids))
        return len(ids)

    def list_documents(self) -> list[dict[str, Any]]:
        """Return unique document metadata (de-duplicated from chunks)."""
        all_meta = self.vectorstore.get(include=["metadatas"])
        seen: dict[str, dict[str, Any]] = {}
        for meta in (all_meta.get("metadatas") or []):
            if meta is None:
                continue
            doc_id = meta.get("document_id", "")
            if doc_id and doc_id not in seen:
                seen[doc_id] = meta
                seen[doc_id]["chunk_count"] = 1
            elif doc_id in seen:
                seen[doc_id]["chunk_count"] = seen[doc_id].get("chunk_count", 0) + 1
        return list(seen.values())

    def delete_document(self, doc_id: str) -> bool:
        """Remove all chunks belonging to *doc_id*."""
        existing = self.vectorstore.get(where={"document_id": doc_id})
        ids_to_delete = existing.get("ids", [])
        if not ids_to_delete:
            return False
        self.vectorstore.delete(ids=ids_to_delete)
        logger.info("Deleted %d chunks for document %s", len(ids_to_delete), doc_id)
        return True

    def get_collection_stats(self) -> dict[str, Any]:
        """Return high-level collection statistics."""
        count = len(self.vectorstore.get(include=["metadatas"]).get("ids", []))
        docs = self.list_documents()
        return {
            "total_documents": len(docs),
            "total_chunks": count,
            "collection_name": settings.CHROMA_COLLECTION_NAME,
        }

# ── Module-level singleton ─────────────────────────────────────────────
vector_store = VectorStoreService()
