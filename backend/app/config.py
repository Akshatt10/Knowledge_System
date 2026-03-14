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
    LLM_MODEL: str = "gpt-4.1-mini"  # Default production model

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
        """Construct database URL from environment variables. 
        If specific POSTGRES_* vars are provided, they take precedence over a generic DATABASE_URL 
        to ensure local Docker setups work reliably.
        """
        # If any specific Postgres vars are provided in .env, rebuild the URL
        # We check if they are different from the hardcoded defaults in the class
        has_specific_db_vars = any([
            self.POSTGRES_USER != "postgres",
            self.POSTGRES_PASSWORD != "postgres",
            self.POSTGRES_HOST != "localhost",
            self.POSTGRES_PORT != 5432,
            self.POSTGRES_DB != "postgres"
        ])

        if not self.DATABASE_URL or has_specific_db_vars:
            self.DATABASE_URL = (
                f"postgresql+psycopg://{self.POSTGRES_USER}:"
                f"{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:"
                f"{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        else:
            # Handle string normalization for DATABASE_URL if it was provided directly
            url = self.DATABASE_URL
            if url.startswith("postgres://"):
                self.DATABASE_URL = url.replace("postgres://", "postgresql+psycopg://", 1)
            elif url.startswith("postgresql://"):
                self.DATABASE_URL = url.replace("postgresql://", "postgresql+psycopg://", 1)
                
        return self
    
    DB_ENGINE: str = "postgresql+psycopg" # Added for compatibility

    # ─────────────────────────────────────
    # AWS / S3 / MinIO
    # ─────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = "minioadmin"
    AWS_SECRET_ACCESS_KEY: str = "minioadmin"
    AWS_DEFAULT_REGION: str = "ap-south-1"
    S3_ENDPOINT_URL: str | None = None  # None = use real AWS S3; "http://localhost:9000" = use MinIO
    S3_BUCKET_NAME: str = "nexus-knowledge-base-2026"

    # ─────────────────────────────────────
    # Encryption
    # ─────────────────────────────────────
    DOCUMENT_ENCRYPTION_KEY: str = "" # Master Key (32-byte base64)

    # ─────────────────────────────────────
    # Auth
    # ─────────────────────────────────────
    JWT_SECRET: str = "super_secret_jwt_key_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"
    FRONTEND_URL: str = "http://localhost:5173"

    # ─────────────────────────────────────
    # CORS
    # ─────────────────────────────────────
    CORS_ORIGINS: list[str] = ["*"]

    # ─────────────────────────────────────
    # Connectors (Google Drive)
    # ─────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/connectors/google/callback"
    FRONTEND_URL: str = "http://localhost:5173"

    # ─────────────────────────────────────
    # Connectors (Notion)
    # ─────────────────────────────────────
    NOTION_CLIENT_ID: str = ""
    NOTION_CLIENT_SECRET: str = ""
    NOTION_REDIRECT_URI: str = "http://localhost:8000/api/connectors/notion/callback"

    # ─────────────────────────────────────
    # Connectors (Slack)
    # ─────────────────────────────────────
    SLACK_CLIENT_ID: str = ""
    SLACK_CLIENT_SECRET: str = ""
    SLACK_REDIRECT_URI: str = "http://localhost:8000/api/connectors/slack/callback"

    # ─────────────────────────────────────
    # Connectors (GitHub)
    # ─────────────────────────────────────
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "http://localhost:8000/api/connectors/github/callback"

    # ─────────────────────────────────────
    # LiveKit (Video Calling)
    # ─────────────────────────────────────
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""
    LIVEKIT_URL: str = ""

    # ─────────────────────────────────────
    # Redis (Job Queue Storage)
    # ─────────────────────────────────────
    REDIS_URL: str = "redis://:FlyH1gherRedis!@localhost:6379/0"


settings = Settings()