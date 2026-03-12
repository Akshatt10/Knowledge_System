"""
RAG query engine using LangChain framework supporting Gemini.
"""

from __future__ import annotations

import logging
import time
from typing import List, Dict

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from app.config import settings
from app.services.vectorstore import vector_store

logger = logging.getLogger(__name__)


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

    def answer_query(
        self,
        question: str,
        user_id: str,
        chat_history: list[dict[str, str]] | None = None,
        provider: str = "openai",
    ) -> dict:
        """Execute RAG pipeline and return grounded answer."""

        llm = self.get_llm(provider=provider)

        # Better retriever with MMR for diverse but relevant chunks
        retriever = vector_store.get_retriever(
            user_id=user_id,
            search_type="mmr",
            search_kwargs={
                "k": 5,
                "fetch_k": 15,
            },
        )

        # 1️⃣ Retrieve documents
        docs = retriever.invoke(question)

        if not docs:
            logger.warning("No documents retrieved for query: %s", question)
            return {
                "answer": "I couldn't find this information in your documents.",
                "sources": [],
            }

        # 2️⃣ Build structured context
        context_parts = []
        sources_meta = []

        for i, doc in enumerate(docs):
            filename = doc.metadata.get("filename", "Unknown Source")
            content = doc.page_content.strip()

            context_parts.append(
                f"[SOURCE {i+1}: {filename}]\n{content}"
            )

            sources_meta.append({
                "filename": filename,
                "chunk_excerpt": content[:200] + "...",
            })

        formatted_context = "\n\n".join(context_parts)

        # 3️⃣ Build prompt
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
            "Executing RAG for user %s with %d context chunks using %s",
            user_id,
            len(docs),
            provider
        )

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

        return {
            "answer": answer_text,
            "sources": sources_meta,
        }


rag_service = RAGService()