"""
RAG query engine using LangChain framework supporting Gemini.
Includes streaming SSE support, hybrid search, and cross-encoder re-ranking.
"""

from __future__ import annotations

import json
import logging
import math
import time
import uuid
from typing import AsyncGenerator, List, Dict

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from app.config import settings
from app.services.vectorstore import vector_store
from app.services.reranker import reranker_service

logger = logging.getLogger(__name__)


def sigmoid(x: float) -> float:
    """Normalize a logit score into a probability range [0, 1]."""
    if x > 20: return 1.0
    if x < -20: return 0.0
    return 1 / (1 + math.exp(-x))


SYSTEM_PROMPT = """
You are a retrieval-augmented AI assistant.

You MUST answer questions only using the provided context.

Rules:
1. Use ONLY the information present in the context sources.
2. If the answer is not present in the context, reply exactly:
   "I couldn't find this information in your documents."
3. Do NOT guess or use outside knowledge.
4. Always cite the source filename when referencing information.
5. If multiple sources provide information, mention all relevant ones.
6. Keep answers concise but clear.
7. Use markdown formatting (bullet points, headings) for readability.
8. CRITICAL: ALWAYS wrap important terms, names, specific codes, and key entities in **bold** markdown (like **this**). This is required for the UI syntax highlighting to work correctly.
"""


class RAGService:
    """Retrieval-Augmented Generation using LangChain."""

    def __init__(self) -> None:
        self.gemini_llm = None
        self.openai_llm = None

        # Circuit breaker: skip Gemini for COOLDOWN seconds after a 429
        self._gemini_blocked_until: float = 0.0
        self._COOLDOWN = 10800  # 3 hours (Gemini free tier = 20 req/day)

        if settings.GEMINI_API_KEY:
            self.gemini_llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-flash",
                temperature=0.0,
                google_api_key=settings.GEMINI_API_KEY,
            )
        
        if settings.OPENAI_API_KEY:
            self.openai_llm = ChatOpenAI(
                model=settings.LLM_MODEL,
                temperature=0.0,
                openai_api_key=settings.OPENAI_API_KEY,
            )

    def _is_gemini_cooled_down(self) -> bool:
        """Check if Gemini is currently in cooldown after a rate limit."""
        return time.time() < self._gemini_blocked_until

    def _trip_gemini_breaker(self):
        """Block Gemini requests for COOLDOWN seconds."""
        self._gemini_blocked_until = time.time() + self._COOLDOWN
        logger.info("Circuit breaker tripped: skipping Gemini for %ds", self._COOLDOWN)

    def get_llm(self, provider: str = "openai"):
        if provider == "gemini":
            # If Gemini is in cooldown, skip directly to fallback
            if self._is_gemini_cooled_down():
                logger.info("Gemini in cooldown, routing directly to OpenAI")
                if self.openai_llm:
                    return self.openai_llm
            if not self.gemini_llm:
                if self.openai_llm:
                    logger.warning("Gemini not configured, falling back to OpenAI")
                    return self.openai_llm
                raise ValueError("Gemini API key not configured (and no OpenAI fallback).")
            return self.gemini_llm
        
        # Default to OpenAI for production reliability
        if not self.openai_llm:
            if self.gemini_llm:
                logger.warning("OpenAI not configured, falling back to Gemini")
                return self.gemini_llm
            raise ValueError("No LLM provider configured. Add API keys to .env")
        return self.openai_llm

    # ── Shared retrieval logic ──────────────────────────────────────────

    def _retrieve_and_build_context(
        self,
        question: str,
        user_id: str,
        provider: str = "openai",
        folder_id: str | None = None,
        db=None,
    ) -> tuple:
        """Retrieve documents via hybrid search + re-rank, build prompt context.

        Returns:
            (llm, messages, docs, sources_meta, context_parts)
        """
        llm = self.get_llm(provider=provider)

        filter_dict = {}
        if folder_id and db:
            from app.models.database import Document
            doc_ids = [d.id for d in db.query(Document).filter(
                Document.folder_id == folder_id,
                Document.user_id == user_id
            ).all()]

            if not doc_ids:
                return llm, None, [], [], []

            filter_dict["document_id"] = {"$in": doc_ids}

        # ── Hybrid Search (BM25 + Dense) ───────────────────────────────
        try:
            docs = vector_store.hybrid_search(
                query=question,
                user_id=user_id,
                top_k=15,
                filter_dict=filter_dict,
            )
        except Exception as e:
            logger.warning("Hybrid search failed, falling back to MMR retriever: %s", e)
            retriever = vector_store.get_retriever(
                user_id=user_id,
                search_type="mmr",
                search_kwargs={"k": 5, "fetch_k": 15},
                filter_dict=filter_dict,
            )
            docs = retriever.invoke(question)

        if not docs:
            return llm, None, [], [], []

        # ── Cross-Encoder Re-ranking ───────────────────────────────────
        try:
            docs = reranker_service.rerank(query=question, documents=docs, top_k=5)
        except Exception as e:
            logger.warning("Re-ranking failed, using raw retrieval order: %s", e)
            docs = docs[:5]

        # ── Build structured context ───────────────────────────────────
        context_parts = []
        sources_meta = []

        for i, doc in enumerate(docs):
            filename = doc.metadata.get("filename", "Unknown Source")
            content = doc.page_content.strip()
            # Normalize scores from re-ranker logits
            raw_score = doc.metadata.get("relevance_score", doc.metadata.get("score", 0.0))
            relevance_score = sigmoid(raw_score) if "relevance_score" in doc.metadata else raw_score

            context_parts.append(
                f"[SOURCE {i+1}: {filename}]\n{content}"
            )

            sources_meta.append({
                "filename": filename,
                "chunk_excerpt": content[:200] + "...",
                "relevance_score": relevance_score,
            })

        formatted_context = "\n\n".join(context_parts)

        user_prompt = f"""
CONTEXT:
{formatted_context}

QUESTION:
{question}

Answer the question using ONLY the context above.
"""

        messages = [
            ("system", SYSTEM_PROMPT),
            ("human", user_prompt)
        ]

        logger.info(
            "RAG retrieval for user %s: %d chunks (hybrid+rerank) using %s",
            user_id, len(docs), provider
        )

        return llm, messages, docs, sources_meta, context_parts

    # ── Synchronous (legacy) query ──────────────────────────────────────

    def answer_query(
        self,
        question: str,
        user_id: str,
        chat_history: list[dict[str, str]] | None = None,
        provider: str = "openai",
        folder_id: str | None = None,
        db=None,
    ) -> dict:
        """Execute RAG pipeline and return grounded answer."""
        start_time = time.time()

        llm, messages, docs, sources_meta, _ = self._retrieve_and_build_context(
            question, user_id, provider, folder_id, db
        )

        if messages is None:
            return {
                "answer": "I couldn't find this information in your documents." if not docs else "This folder is empty. Please add some documents to it first.",
                "sources": [],
                "analytics": {
                    "latency_ms": int((time.time() - start_time) * 1000),
                    "chunks_retrieved": 0,
                    "had_answer": False,
                    "provider": provider,
                },
            }

        try:
            response = llm.invoke(messages)
        except Exception as e:
            error_str = str(e)
            logger.warning("Primary LLM (%s) failed: %s", provider, error_str)

            # Trip circuit breaker on Gemini rate limit
            if provider == "gemini" and ("429" in error_str or "RESOURCE_EXHAUSTED" in error_str):
                self._trip_gemini_breaker()

            if provider == "gemini" and self.openai_llm:
                logger.info("Automatically falling back to OpenAI LLM...")
                response = self.openai_llm.invoke(messages)
            elif provider == "openai" and self.gemini_llm:
                logger.info("Automatically falling back to Gemini LLM...")
                response = self.gemini_llm.invoke(messages)
            else:
                raise

        answer_text = response.content.strip()
        latency_ms = int((time.time() - start_time) * 1000)
        had_answer = "couldn't find this information" not in answer_text.lower()

        # ── Confidence Calculation ─────────────────────────────────────
        confidence_score = 0.0
        if had_answer and docs:
            # Derive from re-ranker scores if available, else use chunk density
            scores = [d.metadata.get("relevance_score", d.metadata.get("score", 0.0)) for d in docs]
            if any(s > 0 for s in scores):
                # Normalize re-ranker scores (assumed range roughly 0-1 or high-neg to high-pos)
                # For simplicity, we avg top 3 and cap
                avg_score = sum(sorted(scores, reverse=True)[:3]) / 3.0
                confidence_score = min(1.0, max(0.0, avg_score))
            else:
                # Fallback to chunk density score: len(docs)/5.0
                confidence_score = min(1.0, len(docs) / 5.0)
        
        confidence_score = round(confidence_score, 2)

        return {
            "answer": answer_text,
            "sources": sources_meta,
            "analytics": {
                "latency_ms": latency_ms,
                "chunks_retrieved": len(docs),
                "had_answer": had_answer,
                "provider": provider,
                "confidence_score": confidence_score,
            },
        }

    # ── Streaming query (SSE) ──────────────────────────────────────────

    async def stream_answer_query(
        self,
        question: str,
        user_id: str,
        chat_history: list = None,
        provider: str = "openai",
        folder_id: str = None,
        query_id: str = None,
        db: Session = None,
    ) -> AsyncGenerator[str, None]:
        """Execute RAG pipeline and yield SSE events token-by-token.

        Yields:
            SSE-formatted strings: data: {"type":"token","content":"..."}\n\n
        """
        start_time = time.time()

        llm, messages, docs, sources_meta, _ = self._retrieve_and_build_context(
            question, user_id, provider, folder_id, db
        )

        if messages is None:
            no_answer = "I couldn't find this information in your documents." if not docs else "This folder is empty. Please add some documents to it first."
            yield f'data: {json.dumps({"type": "token", "content": no_answer})}\n\n'
            yield f'data: {json.dumps({"type": "sources", "sources": []})}\n\n'
            yield f'data: {json.dumps({"type": "analytics", "query_id": query_id, "latency_ms": int((time.time() - start_time) * 1000), "chunks_retrieved": 0, "had_answer": False, "provider": provider})}\n\n'
            yield 'data: {"type": "done"}\n\n'
            return

        full_response = ""
        actual_provider = provider

        try:
            async for chunk in llm.astream(messages):
                if chunk.content:
                    full_response += chunk.content
                    yield f'data: {json.dumps({"type": "token", "content": chunk.content})}\n\n'

        except Exception as e:
            error_str = str(e)
            logger.warning("Primary LLM (%s) failed during stream: %s", provider, error_str)

            if provider == "gemini" and ("429" in error_str or "RESOURCE_EXHAUSTED" in error_str):
                self._trip_gemini_breaker()

            # Attempt fallback
            fallback_llm = None
            if provider == "gemini" and self.openai_llm:
                fallback_llm = self.openai_llm
                actual_provider = "openai"
            elif provider == "openai" and self.gemini_llm:
                fallback_llm = self.gemini_llm
                actual_provider = "gemini"

            if fallback_llm:
                yield f'data: {json.dumps({"type": "token", "content": "[Switching provider...]"})}\n\n'
                try:
                    async for chunk in fallback_llm.astream(messages):
                        if chunk.content:
                            full_response += chunk.content
                            yield f'data: {json.dumps({"type": "token", "content": chunk.content})}\n\n'
                except Exception as fallback_err:
                    error_msg = f"[Error: Both providers failed: {str(fallback_err)}]"
                    yield f'data: {json.dumps({"type": "token", "content": error_msg})}\n\n'
            else:
                yield f'data: {json.dumps({"type": "token", "content": f"[Error: {error_str}]"})}\n\n'

        # Send sources and analytics
        latency_ms = int((time.time() - start_time) * 1000)
        had_answer = "couldn't find this information" not in full_response.lower()

        # ── Confidence Calculation ─────────────────────────────────────
        confidence_score = 0.0
        if had_answer and docs:
            # Use normalized scores for a meaningful average
            norm_scores = [sigmoid(d.metadata.get("relevance_score", d.metadata.get("score", 0.0))) 
                          if "relevance_score" in d.metadata else d.metadata.get("score", 0.0) 
                          for d in docs]
            
            if norm_scores:
                avg_score = sum(sorted(norm_scores, reverse=True)[:3]) / min(3, len(norm_scores))
                confidence_score = min(1.0, max(0.0, avg_score))
        
        confidence_score = round(confidence_score, 2)

        yield f'data: {json.dumps({"type": "sources", "sources": sources_meta})}\n\n'
        yield f'data: {json.dumps({"type": "analytics", "query_id": query_id, "latency_ms": latency_ms, "chunks_retrieved": len(docs), "had_answer": had_answer, "provider": actual_provider, "confidence_score": confidence_score})}\n\n'
        yield 'data: {"type": "done"}\n\n'


rag_service = RAGService()