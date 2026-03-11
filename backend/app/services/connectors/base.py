"""Abstract base class for enterprise connectors."""

from abc import ABC, abstractmethod


class BaseConnector(ABC):

    @abstractmethod
    def get_auth_url(self, user_id: str) -> str:
        """Return the OAuth2 redirect URL for the provider."""

    @abstractmethod
    def handle_callback(self, code: str, user_id: str, db) -> dict:
        """Exchange the auth code for tokens and persist them."""

    @abstractmethod
    def fetch_documents(self, user_id: str, db) -> list[dict]:
        """List available documents from the connected source."""

    @abstractmethod
    def sync_documents(self, user_id: str, db) -> dict:
        """Download new/changed docs and run them through the ingestion pipeline."""
