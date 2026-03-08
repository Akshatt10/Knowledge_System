"""Pinecone vector store wrapper using LangChain."""

from __future__ import annotations

import logging
from typing import Any

from langchain_pinecone import PineconeVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from pinecone import Pinecone

from app.config import settings

logger = logging.getLogger(__name__)


class VectorStoreService:
    """Wrapper around LangChain Pinecone integration + HuggingFaceEmbeddings."""

    def __init__(self) -> None:
        logger.info("Loading HuggingFace embedding model: %s", settings.EMBEDDING_MODEL)
        self.embeddings = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)
        
        if not settings.PINECONE_API_KEY:
            logger.warning("PINECONE_API_KEY not set. Pinecone features will not work.")
            self.vectorstore = None
            return

        logger.info("Initializing LangChain Pinecone client")
        pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        
        self.vectorstore = PineconeVectorStore(
            index_name=settings.PINECONE_INDEX_NAME,
            embedding=self.embeddings,
            pinecone_api_key=settings.PINECONE_API_KEY
        )

    def get_retriever(
        self,
        user_id: str,
        search_type: str = "similarity",
        search_kwargs: dict | None = None,
    ):
        """Return a retriever scoped to a specific user using Pinecone metadata filtering."""

        if search_kwargs is None:
            search_kwargs = {"k": 5}

        return self.vectorstore.as_retriever(
            search_type=search_type,
            search_kwargs={
                **search_kwargs,
                "filter": {"user_id": user_id}
            },
        )

    def add_documents(self, documents: list) -> int:
        """Add LangChain Document objects to Pinecone. Returns count."""
        ids = self.vectorstore.add_documents(documents)
        logger.info("Upserted %d docs into Pinecone", len(ids))
        return len(ids)

    def delete_document(self, doc_id: str, user_id: str | None = None) -> bool:
        """Remove all chunks belonging to *doc_id* (and verified by user_id)."""
        # Note: Pinecone deletion by metadata filter requires a dictionary query.
        filter_query = {"document_id": {"$eq": doc_id}}
        if user_id:
            filter_query["user_id"] = {"$eq": user_id}
            
        try:
            # We interact with the pinecone index natively for metadata deletions
            index = self.vectorstore.get_pinecone_index(settings.PINECONE_INDEX_NAME)
            index.delete(filter=filter_query)
            logger.info("Deleted chunks for document %s", doc_id)
            return True
        except Exception as e:
            logger.error("Failed to delete from pinecone: %s", str(e))
            return False

# ── Module-level singleton ─────────────────────────────────────────────
vector_store = VectorStoreService()
