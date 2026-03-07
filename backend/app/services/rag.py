"""
RAG query engine using LangChain framework supporting Gemini.
"""

from __future__ import annotations

import logging
from typing import List, Dict

from langchain_google_genai import ChatGoogleGenerativeAI

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
        self.llm = None

        if settings.GEMINI_API_KEY:
            self.llm = ChatGoogleGenerativeAI(
                model=settings.LLM_MODEL,
                temperature=0.0,  # deterministic answers for RAG
                google_api_key=settings.GEMINI_API_KEY,
            )

    def _get_llm(self):
        if not self.llm:
            raise ValueError(
                "Gemini API key not configured. "
                "Please add GEMINI_API_KEY to .env"
            )
        return self.llm

    def answer_query(
        self,
        question: str,
        user_id: str,
        chat_history: list[dict[str, str]] | None = None,
    ) -> dict:
        """Execute RAG pipeline and return grounded answer."""

        llm = self._get_llm()

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
            "Executing RAG for user %s with %d context chunks",
            user_id,
            len(docs)
        )

        response = llm.invoke(messages)

        answer_text = response.content.strip()

        return {
            "answer": answer_text,
            "sources": sources_meta,
        }


rag_service = RAGService()