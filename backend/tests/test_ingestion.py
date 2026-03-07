"""Tests for text extraction and chunking."""

from pathlib import Path

from app.utils.extractors import extract_text
from app.utils.text_splitter import RecursiveCharacterTextSplitter


class TestExtractors:
    """Test text extraction from different file types."""

    def test_extract_txt(self, sample_txt_file: Path):
        text = extract_text(sample_txt_file)
        assert "Artificial intelligence" in text
        assert "Machine learning" in text
        assert len(text) > 100

    def test_extract_unsupported(self, tmp_path: Path):
        bad_file = tmp_path / "test.xyz"
        bad_file.write_text("hello")
        try:
            extract_text(bad_file)
            assert False, "Should raise ValueError"
        except ValueError as e:
            assert "Unsupported" in str(e)


class TestTextSplitter:
    """Test the recursive character text splitter."""

    def test_basic_split(self):
        splitter = RecursiveCharacterTextSplitter(chunk_size=100, chunk_overlap=20)
        text = "A " * 200  # 400 chars
        chunks = splitter.split_text(text)
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk) <= 110  # some tolerance for boundary

    def test_small_text_single_chunk(self):
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        text = "This is a short sentence."
        chunks = splitter.split_text(text)
        assert len(chunks) == 1
        assert chunks[0] == text

    def test_paragraph_splitting(self):
        splitter = RecursiveCharacterTextSplitter(chunk_size=100, chunk_overlap=20)
        text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph with more content to fill up space."
        chunks = splitter.split_text(text)
        assert len(chunks) >= 1
        assert "First paragraph" in chunks[0]

    def test_overlap_present(self):
        splitter = RecursiveCharacterTextSplitter(chunk_size=50, chunk_overlap=20)
        text = "word " * 50
        chunks = splitter.split_text(text)
        if len(chunks) > 1:
            # Some overlap should exist between consecutive chunks
            chunk0_words = set(chunks[0].split())
            chunk1_words = set(chunks[1].split())
            assert chunk0_words & chunk1_words  # some intersection
