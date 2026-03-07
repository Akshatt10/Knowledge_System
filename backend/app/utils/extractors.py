"""Text extractors for PDF, TXT, and DOCX files."""

from pathlib import Path

import PyPDF2
import docx


def extract_text_from_pdf(file_path: str | Path) -> str:
    """Extract all text from a PDF file using PyPDF2."""
    text_parts: list[str] = []
    with open(file_path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


def extract_text_from_txt(file_path: str | Path) -> str:
    """Read plain-text UTF-8 content."""
    return Path(file_path).read_text(encoding="utf-8")


def extract_text_from_docx(file_path: str | Path) -> str:
    """Extract text from a DOCX file paragraph-by-paragraph."""
    doc = docx.Document(str(file_path))
    return "\n\n".join(para.text for para in doc.paragraphs if para.text.strip())


# ── Dispatcher ─────────────────────────────────────────────────────────

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".docx"}


def extract_text(file_path: str | Path, file_type: str | None = None) -> str:
    """
    Extract text from a file based on its extension (or explicit *file_type*).

    Raises ``ValueError`` for unsupported file types.
    """
    path = Path(file_path)
    ext = (file_type or path.suffix).lower().lstrip(".")

    if ext == "pdf":
        return extract_text_from_pdf(path)
    if ext == "txt":
        return extract_text_from_txt(path)
    if ext == "docx":
        return extract_text_from_docx(path)

    raise ValueError(
        f"Unsupported file type '.{ext}'. Supported types: {SUPPORTED_EXTENSIONS}"
    )
