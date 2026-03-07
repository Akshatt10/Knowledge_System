"""RAG query engine using LangChain framework supporting OpenAI and Gemini."""
from __future__ import annotations

import logging
from typing import List, Dict

from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings
from app.services.vectorstore import vector_store

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a helpful Knowledge Intelligence Assistant. Your role is to answer "
    "the user's questions using ONLY the context provided below. Follow these rules:\n\n"
    "1. Base your answer exclusively on the provided context.\n"
    "2. If the context does not contain enough information, say so clearly.\n"
    "3. Be concise, accurate, and well-structured.\n"
    "4. Always use bullet points on new lines for lists (e.g., * Item).\n"
    "5. Use markdown formatting (**bold**, [links]) in your answer.\n\n"
    "--- CONTEXT ---\n"
    "{context}"
)


class RAGService:
    """Retrieval-Augmented Generation using LangChain."""

    def __init__(self) -> None:
        self.openai_llm = None
        self.gemini_llm = None

        if settings.OPENAI_API_KEY:
            self.openai_llm = ChatOpenAI(
                model=settings.LLM_MODEL,
                temperature=0.3,
                api_key=settings.OPENAI_API_KEY,
            )

        if settings.GEMINI_API_KEY:
            self.gemini_llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-flash",
                temperature=0.3,
                google_api_key=settings.GEMINI_API_KEY,
            )

    def _get_llm(self, provider: str = "openai"):
        if provider == "gemini" and self.gemini_llm:
            return self.gemini_llm
        if provider == "openai" and self.openai_llm:
            return self.openai_llm
        # Fallbacks
        if self.openai_llm:
            return self.openai_llm
        if self.gemini_llm:
            return self.gemini_llm
        raise ValueError(
            "No LLM API keys configured. "
            "Please add OPENAI_API_KEY or GEMINI_API_KEY to .env"
        )

    def answer_query(
        self,
        question: str,
        chat_history: list[dict[str, str]] | None = None,
        provider: str = "openai",
    ) -> dict:
        """Uses LangChain's create_retrieval_chain to answer questions."""

        llm = self._get_llm(provider)
        retriever = vector_store.get_retriever()

        prompt = ChatPromptTemplate.from_messages([
            ("system", SYSTEM_PROMPT),
            ("human", "{input}"),
        ])

        document_chain = create_stuff_documents_chain(llm, prompt)
        retrieval_chain = create_retrieval_chain(retriever, document_chain)

        logger.info("Executing LangChain RAG with provider %s", provider)
        response = retrieval_chain.invoke({"input": question})

        answer_text = response["answer"]
        source_docs = response["context"]

        sources = []
        for doc in source_docs:
            sources.append({
                "filename": doc.metadata.get("filename", "unknown"),
                "chunk_excerpt": doc.page_content[:300] + (
                    "…" if len(doc.page_content) > 300 else ""
                ),
                "relevance_score": 1.0,
            })

        return {
            "answer": answer_text,
            "sources": sources,
        }


rag_service = RAGService()