"""Cross-encoder re-ranker for improving RAG retrieval quality."""

from __future__ import annotations

import logging
from typing import List

from langchain_core.documents import Document

logger = logging.getLogger(__name__)


class RerankerService:
    """Re-ranks retrieved documents using a cross-encoder model for higher precision."""

    def __init__(self) -> None:
        self._model = None

    def _load_model(self):
        """Lazy-load the cross-encoder model on first use."""
        if self._model is None:
            from sentence_transformers import CrossEncoder

            logger.info("Loading cross-encoder re-ranker model...")
            self._model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
            logger.info("Cross-encoder model loaded successfully.")

    def rerank(
        self,
        query: str,
        documents: List[Document],
        top_k: int = 5,
    ) -> List[Document]:
        """Re-rank documents by cross-encoder relevance score.

        Args:
            query: The user's search query.
            documents: Candidate documents from the retriever.
            top_k: Number of top documents to return after re-ranking.

        Returns:
            The top_k most relevant documents, sorted by cross-encoder score.
        """
        if not documents:
            return documents

        if len(documents) <= top_k:
            return documents

        self._load_model()

        # Build (query, passage) pairs for scoring
        pairs = [(query, doc.page_content) for doc in documents]

        # Predict relevance scores (~50ms for 15 pairs)
        scores = self._model.predict(pairs)

        # Attach scores to documents and sort
        scored_docs = list(zip(documents, scores))
        scored_docs.sort(key=lambda x: x[1], reverse=True)

        # Take top_k and inject relevance score into metadata
        result = []
        for doc, score in scored_docs[:top_k]:
            doc.metadata["relevance_score"] = float(score)
            result.append(doc)

        logger.info(
            "Re-ranked %d candidates down to %d (scores: %.3f – %.3f)",
            len(documents),
            len(result),
            result[-1].metadata["relevance_score"],
            result[0].metadata["relevance_score"],
        )
        return result


# ── Module-level singleton ─────────────────────────────────────────────
reranker_service = RerankerService()
