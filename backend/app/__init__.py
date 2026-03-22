"""Knowledge Intelligence System – FastAPI application factory."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models.database import Base
from app.services.auth import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown events."""
    # ── Startup ────────────────────────────────────────────────────────
    # Create Database Tables
    Base.metadata.create_all(bind=engine)
    # Ensure required directories exist
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

    # Eagerly initialise the vector store so the embedding model is loaded
    from app.services.vectorstore import vector_store  # noqa: F401

    yield
    # ── Shutdown ───────────────────────────────────────────────────────


def create_app() -> FastAPI:
    """Build and return the FastAPI application."""

    app = FastAPI(
        title="Knowledge Intelligence System",
        description="RAG-based document Q&A powered by Pinecone + OpenAI/Gemini",
        version="1.0.0",
        lifespan=lifespan,
    )

    # ── CORS ───────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ────────────────────────────────────────────────────────
    from app.routes.documents import router as documents_router
    from app.routes.query import router as query_router
    from app.routes.admin import router as admin_router
    from app.routes.auth import router as auth_router
    from app.routes.multiplayer import router as multiplayer_router
    from app.routes.connectors import router as connectors_router
    from app.routes.video import router as video_router
    from app.routes.folders import router as folders_router
    from app.routes.graph import router as graph_router
    from app.routes.cli import router as cli_router

    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    app.include_router(documents_router, prefix="/api")
    app.include_router(query_router, prefix="/api")
    app.include_router(admin_router, prefix="/api")
    app.include_router(multiplayer_router, prefix="/api", tags=["multiplayer"])
    app.include_router(connectors_router, prefix="/api/connectors")
    app.include_router(video_router, prefix="/api", tags=["video"])
    app.include_router(folders_router, prefix="/api")
    app.include_router(graph_router, prefix="/api/graph", tags=["graph"])
    app.include_router(cli_router, prefix="/api")

    return app
