"""Tests for FastAPI routes using TestClient."""

import os
import tempfile

os.environ.setdefault("OPENAI_API_KEY", "sk-test-key")
os.environ.setdefault("CHROMA_PERSIST_DIR", tempfile.mkdtemp())
os.environ.setdefault("UPLOAD_DIR", tempfile.mkdtemp())

from fastapi.testclient import TestClient
from app import create_app

client = TestClient(create_app())


class TestHealthRoute:
    """Test the health check endpoint."""

    def test_health(self):
        res = client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"


class TestAdminRoute:
    """Test the admin stats endpoint."""

    def test_stats(self):
        res = client.get("/api/admin/stats")
        assert res.status_code == 200
        data = res.json()
        assert "total_documents" in data
        assert "total_chunks" in data


class TestDocumentRoutes:
    """Test document upload and listing."""

    def test_list_documents(self):
        res = client.get("/api/documents")
        assert res.status_code == 200
        data = res.json()
        assert "documents" in data
        assert "total" in data

    def test_upload_unsupported_type(self):
        res = client.post(
            "/api/documents/upload",
            files={"file": ("test.xyz", b"hello world", "application/octet-stream")},
        )
        assert res.status_code == 400

    def test_upload_txt(self):
        content = b"This is a test document about artificial intelligence and machine learning."
        res = client.post(
            "/api/documents/upload",
            files={"file": ("test_doc.txt", content, "text/plain")},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["filename"] == "test_doc.txt"
        assert data["chunk_count"] >= 1
        assert "document_id" in data

    def test_delete_nonexistent(self):
        res = client.delete("/api/documents/nonexistent-id")
        assert res.status_code == 404
