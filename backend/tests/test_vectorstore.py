"""Tests for ChromaDB vector store service."""

import os
import tempfile

import pytest


class TestVectorStore:
    """Test vector store add / query / delete lifecycle."""

    @pytest.fixture(autouse=True)
    def setup_store(self):
        """Create a fresh vector store for each test."""
        os.environ["CHROMA_PERSIST_DIR"] = tempfile.mkdtemp()
        # Reimport to get a fresh instance
        import importlib
        import app.services.vectorstore as vs_mod
        importlib.reload(vs_mod)
        self.vs = vs_mod.VectorStoreService()

    def test_add_and_query(self):
        chunks = [
            "Python is a programming language.",
            "JavaScript is used for web development.",
        ]
        metadatas = [
            {"document_id": "doc1", "filename": "test.txt", "chunk_index": 0},
            {"document_id": "doc1", "filename": "test.txt", "chunk_index": 1},
        ]
        count = self.vs.add_documents("doc1", chunks, metadatas)
        assert count == 2

        results = self.vs.query("programming language", n_results=2)
        docs = results["documents"][0]
        assert len(docs) > 0
        assert any("Python" in d for d in docs)

    def test_delete_document(self):
        chunks = ["Test content for deletion."]
        metadatas = [{"document_id": "doc_del", "filename": "del.txt", "chunk_index": 0}]
        self.vs.add_documents("doc_del", chunks, metadatas)

        deleted = self.vs.delete_document("doc_del")
        assert deleted is True

        # Verify it's gone
        deleted_again = self.vs.delete_document("doc_del")
        assert deleted_again is False

    def test_get_stats(self):
        stats = self.vs.get_collection_stats()
        assert "total_documents" in stats
        assert "total_chunks" in stats
        assert stats["total_chunks"] >= 0

    def test_delete_nonexistent(self):
        deleted = self.vs.delete_document("does_not_exist")
        assert deleted is False
