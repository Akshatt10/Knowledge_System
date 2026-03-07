"""Shared fixtures for the test suite."""

import os
import tempfile
from pathlib import Path

import pytest

# Override env before importing app
os.environ.setdefault("OPENAI_API_KEY", "sk-test-key")
os.environ.setdefault("CHROMA_PERSIST_DIR", tempfile.mkdtemp())
os.environ.setdefault("UPLOAD_DIR", tempfile.mkdtemp())


@pytest.fixture
def sample_txt_file(tmp_path: Path) -> Path:
    """Create a sample .txt file for testing."""
    f = tmp_path / "sample.txt"
    f.write_text(
        "Artificial intelligence (AI) is the simulation of human intelligence "
        "processes by machines, especially computer systems. These processes "
        "include learning, reasoning, and self-correction.\n\n"
        "Machine learning is a subset of AI that provides systems the ability "
        "to automatically learn and improve from experience without being "
        "explicitly programmed.\n\n"
        "Deep learning is a subset of machine learning that uses neural "
        "networks with many layers to model complex patterns in data.",
        encoding="utf-8",
    )
    return f
