"""
Application configuration loaded from environment variables.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator


class Settings(BaseSettings):
    """Central configuration for the Knowledge Intelligence System."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ─────────────────────────────────────
    # Paths
    # ─────────────────────────────────────
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    UPLOAD_DIR: Path = Path("uploads")

    # ─────────────────────────────────────
    # LLM Configuration
    # ─────────────────────────────────────
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = "your-api-key"
    LLM_MODEL: str = "gpt-4o-mini"  # Default production model

    # ─────────────────────────────────────
    # Embeddings / RAG
    # ─────────────────────────────────────
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 150
    TOP_K_RESULTS: int = 5

    # ─────────────────────────────────────
    # Pinecone Vector Store
    # ─────────────────────────────────────
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = "knowledge-base"

    # ─────────────────────────────────────
    # PostgreSQL
    # ─────────────────────────────────────
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "postgres"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str | None = None

    @model_validator(mode="after")
    def assemble_db_connection(self) -> "Settings":
        """Construct database URL from environment variables if not explicitly provided."""
        if getattr(self, "DATABASE_URL", None):
            url = self.DATABASE_URL
            if url.startswith("postgres://"):
                self.DATABASE_URL = url.replace("postgres://", "postgresql+psycopg://", 1)
            elif url.startswith("postgresql://"):
                self.DATABASE_URL = url.replace("postgresql://", "postgresql+psycopg://", 1)
        else:
            self.DATABASE_URL = (
                f"postgresql+psycopg://{self.POSTGRES_USER}:"
                f"{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:"
                f"{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self

    # ─────────────────────────────────────
    # AWS / S3 / MinIO
    # ─────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = "minioadmin"
    AWS_SECRET_ACCESS_KEY: str = "minioadmin"
    AWS_DEFAULT_REGION: str = "ap-south-1"
    S3_ENDPOINT_URL: str | None = None  # None = use real AWS S3; "http://localhost:9000" = use MinIO
    S3_BUCKET_NAME: str = "nexus-knowledge-base-2026"

    # ─────────────────────────────────────
    # Auth
    # ─────────────────────────────────────
    JWT_SECRET: str = "super_secret_jwt_key_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # ─────────────────────────────────────
    # CORS
    # ─────────────────────────────────────
    CORS_ORIGINS: list[str] = ["*"]


settings = Settings()