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
        import os
        logger.info("Loading HuggingFace embedding model: %s", settings.EMBEDDING_MODEL)
        self.embeddings = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)
        
        # Inject into os.environ to ensure all client libraries see it
        if settings.PINECONE_API_KEY:
            os.environ["PINECONE_API_KEY"] = settings.PINECONE_API_KEY
        
        if not settings.PINECONE_API_KEY:
            logger.warning("PINECONE_API_KEY not set. Pinecone features will not work.")
            self.vectorstore = None
            return

        logger.info("Initializing LangChain Pinecone client")
        self.pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        
        self.vectorstore = PineconeVectorStore(
            index_name=settings.PINECONE_INDEX_NAME,
            embedding=self.embeddings,
            pinecone_api_key=settings.PINECONE_API_KEY
        )

    def get_retriever(
        self,
        user_id: str | None = None,
        search_type: str = "similarity",
        search_kwargs: dict | None = None,
        filter_dict: dict | None = None,
    ):
        """Return a retriever scoped using Pinecone metadata filtering."""

        if search_kwargs is None:
            search_kwargs = {"k": 5}

        final_filter = {}
        if user_id:
            final_filter["user_id"] = user_id
        if filter_dict:
            final_filter.update(filter_dict)

        return self.vectorstore.as_retriever(
            search_type=search_type,
            search_kwargs={
                **search_kwargs,
                "filter": final_filter
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

    def get_collection_stats(self) -> dict:
        """Return high-level stats for the Pinecone index."""
        try:
            if not settings.PINECONE_API_KEY or not self.pc:
                return {"total_chunks": 0, "collection_name": "Pinecone (Disabled)"}
                
            index = self.pc.Index(settings.PINECONE_INDEX_NAME)
            stats = index.describe_index_stats()
            
            return {
                "total_chunks": stats.total_vector_count,
                "collection_name": settings.PINECONE_INDEX_NAME
            }
        except Exception as e:
            logger.error("Failed to fetch Pinecone stats: %s", str(e))
            return {"total_chunks": 0, "collection_name": "Pinecone (Error)"}

    def _get_index(self):
        """Return the raw Pinecone Index object for direct queries."""
        return self.pc.Index(settings.PINECONE_INDEX_NAME)

    def hybrid_search(
        self,
        query: str,
        user_id: str | None = None,
        top_k: int = 15,
        filter_dict: dict | None = None,
    ) -> list:
        """Hybrid BM25 + dense vector search via Pinecone.

        Falls back to dense-only similarity search if pinecone-text
        is not installed or sparse encoding fails.
        """
        from langchain_core.documents import Document as LCDocument

        # Build metadata filter
        final_filter = {}
        if user_id:
            final_filter["user_id"] = user_id
        if filter_dict:
            final_filter.update(filter_dict)

        # 1. Generate dense embedding
        dense_vector = self.embeddings.embed_query(query)

        # 2. Try to generate sparse BM25 vector
        sparse_vector = None
        try:
            from pinecone_text.sparse import BM25Encoder
            bm25 = BM25Encoder.default()
            sparse_result = bm25.encode_queries(query)
            sparse_vector = {
                "indices": sparse_result["indices"],
                "values": sparse_result["values"],
            }
        except ImportError:
            logger.info("pinecone-text not installed; using dense-only search")
        except Exception as e:
            logger.warning("BM25 sparse encoding failed, falling back to dense-only: %s", e)

        # 3. Query Pinecone
        index = self._get_index()

        query_params = {
            "vector": dense_vector,
            "top_k": top_k,
            "include_metadata": True,
        }
        if sparse_vector:
            query_params["sparse_vector"] = sparse_vector
        if final_filter:
            query_params["filter"] = final_filter

        results = index.query(**query_params)

        # 4. Convert Pinecone matches → LangChain Document objects
        documents = []
        for match in results.get("matches", []):
            metadata = match.get("metadata", {})
            text = metadata.pop("text", "")  # Pinecone stores text in metadata
            metadata["score"] = match.get("score", 0.0)
            documents.append(LCDocument(page_content=text, metadata=metadata))

        logger.info(
            "Hybrid search returned %d results for query (user=%s)",
            len(documents), user_id
        )
        return documents

# ── Module-level singleton ─────────────────────────────────────────────
vector_store = VectorStoreService()
