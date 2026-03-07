"""
Application configuration loaded from environment variables.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    CHROMA_PERSIST_DIR: Path = Path("chroma_data")

    # ─────────────────────────────────────
    # LLM Configuration
    # ─────────────────────────────────────
    GEMINI_API_KEY: str = ""
    LLM_MODEL: str = "gemini-2.5-flash"

    # ─────────────────────────────────────
    # Embeddings / RAG
    # ─────────────────────────────────────
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 150
    TOP_K_RESULTS: int = 5

    # ─────────────────────────────────────
    # Chroma Vector Store
    # ─────────────────────────────────────
    CHROMA_COLLECTION_NAME: str = "knowledge_base"

    # ─────────────────────────────────────
    # PostgreSQL
    # ─────────────────────────────────────
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432

    @property
    def DATABASE_URL(self) -> str:
        """Construct database URL from environment variables."""
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:"
            f"{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:"
            f"{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ─────────────────────────────────────
    # AWS / S3 / MinIO
    # ─────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = "minioadmin"
    AWS_SECRET_ACCESS_KEY: str = "minioadmin"
    AWS_DEFAULT_REGION: str = "us-east-1"
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_BUCKET_NAME: str = "knowledge-base"

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