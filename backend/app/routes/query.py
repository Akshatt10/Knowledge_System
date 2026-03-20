"""Q&A / chat endpoint powered by the RAG engine."""

from __future__ import annotations

import logging
import uuid
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from app.services.auth import get_current_user, get_db
from app.models.database import User, QueryLog, QueryFeedback
from sqlalchemy.orm import Session

from app.models.schemas import (
    QueryRequest,
    QueryResponse,
    SourceCitation,
    FeedbackRequest,
    AnnotationRequest,
    AnnotationResponse,
    BatchQueryRequest,
    BatchCheckpointResult,
    BatchReportResponse,
    CheckListExtractionRequest,
    DeepResearchRequest,
    DeepResearchResponse,
)
from app.services.rag import rag_service
from app.services.vectorstore import vector_store
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Query"])


def _log_query(
    db: Session,
    user_id: str,
    question: str,
    analytics: dict,
    answer_text: str | None = None,
    follow_up_questions: list[str] | None = None,
) -> str | None:
    """Persist a QueryLog record for analytics and return its ID."""
    try:
        log_id = str(uuid.uuid4())
        log = QueryLog(
            id=log_id,
            user_id=user_id,
            question=question,
            provider=analytics.get("provider", "unknown"),
            latency_ms=analytics.get("latency_ms", 0),
            chunks_retrieved=analytics.get("chunks_retrieved", 0),
            had_answer=analytics.get("had_answer", False),
            confidence_score=analytics.get("confidence_score", 0.0),
            answer_text=answer_text,
            follow_up_questions=follow_up_questions or [],
        )
        db.add(log)
        db.commit()
        return log_id
    except Exception as e:
        logger.error("Failed to persist QueryLog: %s", e)
        db.rollback()
        return None


@router.post("/query", response_model=QueryResponse)
async def ask_question(
    payload: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit a question to the RAG engine (Authenticated users only)."""
    try:
        result = rag_service.answer_query(
            question=payload.question,
            user_id=str(current_user.id),
            chat_history=payload.chat_history,
            provider=payload.provider,
            folder_id=payload.folder_id,
            db=db
        )
    except Exception as exc:
        logger.exception("RAG query failed")
        raise HTTPException(status_code=500, detail=f"Query error: {exc}")

    # Log query analytics
    query_id = None
    confidence_score = None
    if "analytics" in result:
        query_id = _log_query(
            db,
            str(current_user.id),
            payload.question,
            result["analytics"],
            answer_text=result.get("answer"),
            follow_up_questions=result.get("follow_up_questions", []),
        )
        confidence_score = result["analytics"].get("confidence_score")

    sources = [
        SourceCitation(
            filename=s["filename"],
            chunk_excerpt=s["chunk_excerpt"],
            relevance_score=s.get("relevance_score"),
        )
        for s in result.get("sources", [])
    ]

    return QueryResponse(
        answer=result["answer"],
        sources=sources,
        query_id=query_id,
        confidence_score=confidence_score,
        follow_up_questions=result.get("follow_up_questions", []),
    )


@router.post("/query/batch", response_model=BatchReportResponse)
async def batch_research(
    payload: BatchQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run a batch of checklist questions against the RAG engine using Long-Context processing.

    This endpoint uses a single massive LLM call instead of sequential chunks.
    Returns a compiled report with coverage indicators per checkpoint.
    """
    if not payload.questions:
        return BatchReportResponse(results=[], total_checkpoints=0, strong_coverage=0, partial_coverage=0, no_coverage=0)

    try:
        llm = rag_service.get_llm(provider=payload.provider)
        
        # 1. Fetch relevant chunks context for all questions simultaneously (high K)
        filter_dict = {}
        if payload.folder_id:
            from app.models.database import Document
            doc_ids = [d.id for d in db.query(Document).filter(
                Document.folder_id == payload.folder_id,
                Document.user_id == str(current_user.id)
            ).all()]
            if not doc_ids:
                return BatchReportResponse(results=[], total_checkpoints=len(payload.questions), strong_coverage=0, partial_coverage=0, no_coverage=len(payload.questions))
            filter_dict["document_id"] = {"$in": doc_ids}

        # Combine all questions to form a massive search query to fetch diverse context
        combined_query = " ".join([q.strip() for q in payload.questions if q.strip()])
        docs = vector_store.hybrid_search(
            query=combined_query,
            user_id=str(current_user.id),
            top_k=40,
            filter_dict=filter_dict,
        )

        context_parts = []
        for i, doc in enumerate(docs):
            filename = doc.metadata.get("filename", "Unknown Source")
            content = doc.page_content.strip()
            context_parts.append(f"[SOURCE {i+1}: {filename}]\n{content}")
            
        formatted_context = "\n\n".join(context_parts) if context_parts else "No context available in the database to answer these checklist items."

        # 2. Build the LLM Prompt for strict JSON evaluation
        system_prompt = """You are an expert auditor evaluating a document against a checklist of requirements.
You MUST output your evaluation strictly as a valid JSON array of objects, with NO markdown formatting, NO backticks, and NO extra text.
Do not wrap the output in ```json ... ```. Just return the raw JSON array.
Each object in the array must match this structure exactly:
{
    "question": "The original requirement text from the checklist",
    "coverage": "strong" | "partial" | "none",
    "answer": "Detailed explanation of whether the requirement is met, citing specific details from the context.",
    "citations": ["filename1.pdf", "filename2.docx"]
}

Rules for evaluation:
- "strong": The document explicitly and clearly meets the requirement.
- "partial": The document partially addresses it, or it is ambiguous.
- "none": The document does not address this requirement at all.
- In your answer, use **bold** markdown for key terms.
- Base your evaluation ONLY on the provided context. If it's missing, mark as "none" and say the information was missing.
- For citations, use the exact filenames found in the [SOURCE X: filename] tags.
"""
        user_prompt = f"""
CONTEXT:
{formatted_context}

CHECKLIST TO EVALUATE:
{json.dumps([q.strip() for q in payload.questions if q.strip()], indent=2)}

Remember: Output ONLY a strict JSON array of objects.
"""
        # 3. Call the LLM (Gemini 1.5 Pro Long-Context ideal)
        resp = await llm.ainvoke([
            ("system", system_prompt),
            ("human", user_prompt)
        ])
        
        raw_text = resp.content.strip()
        # Clean up Markdown formatting if LLM still hallucinates it
        if raw_text.startswith("```"):
            lines = raw_text.splitlines()
            if len(lines) >= 2:
                raw_text = "\n".join(lines[1:-1])
                
        try:
            parsed_results = json.loads(raw_text)
            if not isinstance(parsed_results, list):
                raise ValueError("LLM returned JSON object, expected JSON array")
        except json.JSONDecodeError as e:
            logger.error("Failed to parse LLM JSON output: %s\nRaw Output: %s", e, raw_text)
            raise ValueError(f"Invalid JSON response from LLM: {str(e)}")

        results: list[BatchCheckpointResult] = []
        strong = partial = none = 0

        # Log overarching bulk audit
        _log_query(
            db, str(current_user.id), f"Bulk Audit: {len(payload.questions)} items", {},
            answer_text="Parsed via bulk long-context pipeline",
            follow_up_questions=[],
        )

        for r in parsed_results:
            coverage = str(r.get("coverage", "none")).lower()
            if coverage not in ["strong", "partial", "none"]:
                coverage = "none"
                
            if coverage == "strong": strong += 1
            elif coverage == "partial": partial += 1
            else: none += 1
            
            citations = r.get("citations", [])
            sources = [SourceCitation(filename=str(s), chunk_excerpt="See full document context", relevance_score=1.0) for s in citations if isinstance(s, str)]

            question_text = str(r.get("question", "Unknown Question"))
            results.append(BatchCheckpointResult(
                question=question_text,
                coverage=coverage,
                answer=str(r.get("answer", "No answer provided by LLM.")),
                sources=sources,
                confidence_score=1.0 if coverage == "strong" else (0.5 if coverage == "partial" else 0.0),
            ))

        return BatchReportResponse(
            results=results,
            total_checkpoints=len(results),
            strong_coverage=strong,
            partial_coverage=partial,
            no_coverage=none,
        )

    except Exception as exc:
        logger.error("Batch query LLM failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Audit failed: {str(exc)}")


@router.post("/query/deep-research", response_model=DeepResearchResponse)
async def deep_research(
    payload: DeepResearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate an extensive, long-form research report based on a user prompt.
    
    1. Fetches a massive context block (k=40-50).
    2. Uses LLM to write a comprehensive markdown report.
    """
    llm = rag_service.get_llm(provider=payload.provider)
    
    # Use maximum possible retrieval for report writing
    k_to_use = 40 if payload.provider == "gemini" else 20
    
    docs = []
    filter_dict = {}
    if payload.folder_id:
        filter_dict["folder_id"] = payload.folder_id

    docs = vector_store.hybrid_search(
        query=payload.prompt,
        user_id=str(current_user.id),
        top_k=k_to_use,
        filter_dict=filter_dict if filter_dict else None,
    )
        
    if not docs:
        raise HTTPException(status_code=400, detail="Not enough documents found to generate a report.")
        
    # Build massive context string
    context_str = "\n\n".join([
        f"--- Document: {doc.metadata.get('filename', 'Unknown')} ---\n{doc.page_content}"
        for doc in docs
    ])
    
    system_prompt = f"""You are Nexus, an advanced Deep Research AI. Your task is to write a highly detailed, comprehensive, and exhaustive research report or paper based STRICTLY on the provided context.

Context from User's Knowledge Base:
{context_str}

Instructions:
1. Thoroughly fulfill the user's prompt using only the provided context.
2. Structure the output professionally, using Markdown headers, lists, and bold text for readability.
3. If the context does not contain enough information to fully address the prompt, state what is missing but synthesize what is available.
4. Do NOT make up information outside of the context.
5. Provide a synthesis of the knowledge, not just quotes.
"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=payload.prompt)
    ]
    
    try:
        start_time = datetime.now()
        response = llm.invoke(messages)
        end_time = datetime.now()
        latency = int((end_time - start_time).total_seconds() * 1000)
        
        # Aggregate unique sources
        unique_sources = {}
        for d in docs:
            fname = d.metadata.get("filename", "Unknown")
            if fname not in unique_sources:
                unique_sources[fname] = SourceCitation(
                    filename=fname,
                    chunk_excerpt=d.page_content[:200] + "...",
                    relevance_score=1.0
                )
                
        # Log this massive query
        _log_query(
            db, str(current_user.id), f"Deep Research Report: {payload.prompt}", 
            analytics={"provider": payload.provider, "latency_ms": latency, "chunks_retrieved": len(docs), "had_answer": True, "confidence_score": 1.0},
            answer_text="Generated Deep Research Report",
            follow_up_questions=[],
        )
        
        return DeepResearchResponse(
            report=response.content,
            sources=list(unique_sources.values())
        )
        
    except Exception as exc:
        logger.error("Deep Research LLM failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(exc)}")


@router.post("/query/extract-checklist", response_model=list[str])
async def extract_checklist(
    payload: CheckListExtractionRequest,
    current_user: User = Depends(get_current_user),
):
    """Auto-extract checklist items from a specific document.
    
    1. Fetches all chunks for the document.
    2. Uses LLM to extract requirements/checkpoints as a JSON array of strings.
    """
    
    if not vector_store.vectorstore:
        raise HTTPException(status_code=500, detail="Vector store not initialized")

    try:
        # 1. Fetch chunks for the document
        docs = vector_store.vectorstore.similarity_search(
            query="checklist requirements steps format items", # Dummy topic-focused query
            k=50, # High K to get most/all chunks
            filter={
                "document_id": payload.document_id,
                "user_id": str(current_user.id)
            }
        )
        
        if not docs:
            raise HTTPException(status_code=404, detail="Document not found or is empty.")
            
        context = "\n\n---\n".join([d.page_content for d in docs])
        
        # 2. Get LLM and prompt
        llm = rag_service.get_llm(provider=payload.provider)
        
        system_prompt = (
            "You are a strict data extraction AI. Extract all checklist items, checkpoints, "
            "requirements, or to-do tasks from the provided text.\n"
            "CRITICAL RULES:\n"
            "- Return ONLY a valid JSON array of strings.\n"
            "- Do NOT wrap the JSON in Markdown formatting (no ```json).\n"
            "- Do NOT include any conversational text or explanations.\n"
            "- Example output: [\"Verify user input\", \"Deploy to staging\"]\n"
            "If no checklist items are found, return precisely: []"
        )
        
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"TEXT TO EXTRACT FROM:\n{context}")
        ]
        
        try:
            response = llm.invoke(messages)
        except Exception as e:
            error_str = str(e)
            logger.warning("Primary LLM (%s) failed during extraction: %s", payload.provider, error_str)
            
            if payload.provider == "gemini" and ("429" in error_str or "RESOURCE_EXHAUSTED" in error_str):
                rag_service._trip_gemini_breaker()
                
            if payload.provider == "gemini" and rag_service.openai_llm:
                logger.info("Extraction falling back to OpenAI LLM...")
                response = rag_service.openai_llm.invoke(messages)
            elif payload.provider == "openai" and rag_service.gemini_llm:
                logger.info("Extraction falling back to Gemini LLM...")
                response = rag_service.gemini_llm.invoke(messages)
            else:
                raise
                
        content_str = str(response.content).strip()
        
        if content_str.startswith("```json"):
            content_str = content_str[7:].strip()
        if content_str.endswith("```"):
            content_str = content_str[:-3].strip()
            
        extracted: list[str] = json.loads(content_str)
        if not isinstance(extracted, list):
            raise ValueError("LLM did not return a list")
            
        return extracted

    except Exception as exc:
        logger.exception("Failed to extract checklist: %s", exc)
        raise HTTPException(status_code=500, detail="Checklist extraction failed")




@router.get("/query/stream")
async def stream_question(
    question: str = Query(..., min_length=1, max_length=2000),
    provider: str = Query(default="openai"),
    folder_id: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """SSE streaming endpoint for token-by-token RAG responses."""
    query_id = str(uuid.uuid4())

    async def event_generator():
        analytics_data = {}
        followups_data: list[str] = []
        full_answer = ""

        async for event in rag_service.stream_answer_query(
            question=question,
            user_id=str(current_user.id),
            provider=provider,
            folder_id=folder_id,
            query_id=query_id,
            db=db,
        ):
            yield event

            # Capture analytics from the analytics event for later logging
            if '"type": "analytics"' in event or '"type":"analytics"' in event:
                try:
                    data_line = event.strip().replace("data: ", "", 1)
                    analytics_data = json.loads(data_line)
                except Exception:
                    pass

            # Capture follow-ups for DB persistence
            if '"type": "followups"' in event or '"type":"followups"' in event:
                try:
                    data_line = event.strip().replace("data: ", "", 1)
                    parsed = json.loads(data_line)
                    followups_data = parsed.get("questions", [])
                except Exception:
                    pass

            # Accumulate answer tokens
            if '"type": "token"' in event or '"type":"token"' in event:
                try:
                    data_line = event.strip().replace("data: ", "", 1)
                    parsed = json.loads(data_line)
                    full_answer += parsed.get("content", "")
                except Exception:
                    pass

        # Log query after stream completes — use pre-assigned query_id
        if analytics_data:
            try:
                log = QueryLog(
                    id=query_id,
                    user_id=str(current_user.id),
                    question=question,
                    provider=analytics_data.get("provider", provider),
                    latency_ms=analytics_data.get("latency_ms", 0),
                    chunks_retrieved=analytics_data.get("chunks_retrieved", 0),
                    had_answer=analytics_data.get("had_answer", False),
                    confidence_score=analytics_data.get("confidence_score", 0.0),
                    answer_text=full_answer or None,
                    follow_up_questions=followups_data or [],
                )
                db.add(log)
                db.commit()
            except Exception as e:
                logger.error("Failed to persist QueryLog: %s", e)
                db.rollback()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/query/history")
async def get_query_history(
    limit: int = Query(10, gt=0, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve the recent query history for the current user."""
    queries = db.query(QueryLog).filter(
        QueryLog.user_id == str(current_user.id)
    ).order_by(QueryLog.created_at.desc()).limit(limit).all()
    
    return queries


@router.post("/query/{query_id}/feedback")
async def give_feedback(
    query_id: str,
    payload: FeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit thumbs up (1) or thumbs down (-1) for a specific query."""
    query = db.query(QueryLog).filter(
        QueryLog.id == query_id,
        QueryLog.user_id == str(current_user.id)
    ).first()
    if not query:
        raise HTTPException(status_code=404, detail="Query log not found")

    existing = db.query(QueryFeedback).filter(QueryFeedback.query_id == query_id).first()
    if existing:
        existing.feedback = payload.feedback
        existing.created_at = datetime.utcnow()
    else:
        feedback = QueryFeedback(
            id=str(uuid.uuid4()),
            user_id=str(current_user.id),
            query_id=query_id,
            feedback=payload.feedback
        )
        db.add(feedback)
    
    db.commit()
    return {"status": "success", "feedback": payload.feedback}


@router.patch("/query/{query_id}/annotation", response_model=AnnotationResponse)
async def save_annotation(
    query_id: str,
    payload: AnnotationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save or update a personal annotation on an AI answer."""
    query = db.query(QueryLog).filter(
        QueryLog.id == query_id,
        QueryLog.user_id == str(current_user.id)
    ).first()
    if not query:
        raise HTTPException(status_code=404, detail="Query not found")

    query.user_annotation = payload.annotation
    db.commit()

    return AnnotationResponse(
        query_id=query_id,
        annotation=payload.annotation,
        updated_at=datetime.utcnow().isoformat(),
    )
