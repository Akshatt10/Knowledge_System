# Knowledge Intelligence System

A production-ready, containerized **RAG (Retrieval-Augmented Generation)** application that lets users upload documents, store them as vector embeddings in **ChromaDB**, and ask natural-language questions answered by an **LLM** with context retrieved from their knowledge base.

![Python](https://img.shields.io/badge/Python-3.11-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green) ![Docker](https://img.shields.io/badge/Docker-Compose-blue) ![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector_Store-orange)

---

## ✨ Features

- **Document Ingestion** — Upload PDF, TXT, DOCX files. Automatic text extraction, chunking, and embedding.
- **AI Document Summaries** — Auto-generated 2-sentence summaries for every uploaded document.
- **RAG-Powered Q&A** — Ask questions and get accurate, context-aware answers with source citations.
- **Contextual Follow-ups** — The AI generates 3 clickable follow-up questions tailored to your query.
- **Personal Annotations** — Add inline personal study notes/interpretations to any AI answer.
- **Vector Search** — ChromaDB with `all-MiniLM-L6-v2` sentence-transformer embeddings.
- **Admin Dashboard** — View collection stats, document count, and system health.
- **Beautiful UI** — Dark glassmorphism design with chat interface, drag-and-drop upload, and responsive layout.
- **Fully Containerized** — Docker Compose for one-command deployment.

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- OpenAI API Key

### 1. Clone & Configure

```bash
cd ProjectGenAI
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

### 2. Launch

```bash
docker compose up -d --build
```

### 3. Use

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:3000       |
| Backend  | http://localhost:8000       |
| API Docs | http://localhost:8000/docs  |

---

## 🏗️ Architecture

```
┌──────────────────┐     HTTP     ┌──────────────────┐
│  Frontend (Nginx)│────────────→│  Backend (FastAPI)│
│  :3000           │ /api/ proxy  │  :8000           │
└──────────────────┘              └────────┬─────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          │                │                │
                    ┌─────▼─────┐   ┌──────▼──────┐  ┌─────▼─────┐
                    │ ChromaDB  │   │   Uploads   │  │  OpenAI   │
                    │ (Vectors) │   │ (File Store)│  │  LLM API  │
                    └───────────┘   └─────────────┘  └───────────┘
```

---

## 📡 API Reference

| Method   | Endpoint                   | Description                    |
|----------|----------------------------|--------------------------------|
| `POST`   | `/api/documents/upload`    | Upload & ingest a document     |
| `GET`    | `/api/documents`           | List all documents             |
| `DELETE` | `/api/documents/{doc_id}`  | Delete a document              |
| `POST`   | `/api/query`               | Ask a question (RAG)           |
| `GET`    | `/api/admin/stats`         | Collection statistics          |
| `GET`    | `/api/health`              | Health check                   |

Full interactive docs at **http://localhost:8000/docs** (Swagger UI).

---

## ⚙️ Configuration

All settings via environment variables (see `.env.example`):

| Variable              | Default           | Description                      |
|-----------------------|-------------------|----------------------------------|
| `OPENAI_API_KEY`      | *(required)*      | Your OpenAI API key              |
| `LLM_MODEL`           | `gpt-3.5-turbo`   | OpenAI model name                |
| `EMBEDDING_MODEL`     | `all-MiniLM-L6-v2`| Sentence-transformer model       |
| `CHUNK_SIZE`           | `1000`            | Text chunk size in characters    |
| `CHUNK_OVERLAP`        | `200`             | Overlap between chunks           |
| `TOP_K_RESULTS`        | `5`               | Number of context chunks to retrieve |

---

## 🛠️ Local Development (without Docker)

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # add your OPENAI_API_KEY
uvicorn main:app --reload --port 8000

# Frontend — serve with any static server
cd frontend
python -m http.server 3000
```

---

## 📁 Project Structure

```
ProjectGenAI/
├── backend/
│   ├── app/
│   │   ├── __init__.py       # FastAPI app factory
│   │   ├── config.py         # Settings (env vars)
│   │   ├── routes/           # API endpoints
│   │   ├── services/         # Business logic
│   │   ├── utils/            # Text extraction & splitting
│   │   └── models/           # Pydantic schemas
│   ├── tests/                # Pytest suite
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── index.html            # SPA entry
│   ├── css/styles.css        # Dark glassmorphism design
│   ├── js/                   # Modular JS (app, chat, upload, admin)
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
└── .env.example
```

---

## License

MIT
