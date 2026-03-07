"""Recursive character text splitter for chunking documents."""

from __future__ import annotations


class RecursiveCharacterTextSplitter:
    """
    Split text into chunks using a hierarchy of separators.

    Tries to split on ``\\n\\n`` first, then ``\\n``, then ``". "``, then ``" "``,
    falling back to character-level splitting if none work.
    """

    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        separators: list[str] | None = None,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n", "\n", ". ", " ", ""]

    # ───────────────────────────────────────────────────────────────────
    def split_text(self, text: str) -> list[str]:
        """Return a list of text chunks respecting *chunk_size* and *chunk_overlap*."""
        final_chunks: list[str] = []
        separator = self._pick_separator(text)

        splits = text.split(separator) if separator else list(text)
        current_chunk: list[str] = []
        current_length = 0

        for piece in splits:
            piece_len = len(piece) + (len(separator) if current_chunk else 0)

            if current_length + piece_len > self.chunk_size and current_chunk:
                chunk_text = separator.join(current_chunk).strip()
                if chunk_text:
                    final_chunks.append(chunk_text)

                # Keep overlap
                while current_length > self.chunk_overlap and current_chunk:
                    removed = current_chunk.pop(0)
                    current_length -= len(removed) + len(separator)

            current_chunk.append(piece)
            current_length += piece_len

        # Remaining text
        if current_chunk:
            chunk_text = separator.join(current_chunk).strip()
            if chunk_text:
                final_chunks.append(chunk_text)

        return final_chunks

    # ───────────────────────────────────────────────────────────────────
    def _pick_separator(self, text: str) -> str:
        """Choose the highest-priority separator that appears in *text*."""
        for sep in self.separators:
            if sep == "":
                return ""
            if sep in text:
                return sep
        return ""
