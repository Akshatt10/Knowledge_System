# Nexus — Knowledge Intelligence System

A production-grade **RAG (Retrieval-Augmented Generation)** platform that lets teams upload documents, build a searchable knowledge base with **Pinecone** vector embeddings, and query it with natural language — powered by **Gemini** and **OpenAI** with automatic failover.

![Python](https://img.shields.io/badge/Python-3.11+-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green) ![React](https://img.shields.io/badge/React-18-61dafb) ![Pinecone](https://img.shields.io/badge/Pinecone-Vector_Store-purple) ![Redis](https://img.shields.io/badge/Redis-Session_Store-red) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791)

---

## ✨ Features

### Core Intelligence
- **RAG-Powered Q&A** — Context-aware answers with source citations and confidence scores.
- **Streaming Responses** — Token-level SSE streaming for real-time AI typing feel.
- **Contextual Follow-ups** — Auto-generated follow-up questions tailored to each query.
- **Personal Annotations** — Attach inline study notes to any AI answer.
- **Folder-Scoped Queries** — Target specific document folders for precision retrieval.

### Deep Research
- **Checklist Analysis** — Bulk-evaluate requirements against your knowledge base in parallel.
- **Report Mode** — Generate comprehensive research reports from multiple queries.
- **AI Checklist Extraction** — Auto-extract requirements from uploaded documents via LLM.
- **Report History** — Persistent local storage of past research reports with export to Markdown.

### Collaboration
- **Real-Time Chat Rooms** — WebSocket-powered multiplayer rooms with `@ai` mentions.
- **Shared Document Vault** — Share documents across room members for collaborative RAG.
- **Video Calling** — LiveKit-powered WebRTC video integration within rooms.

### Knowledge Management
- **Document Ingestion** — Upload PDF, TXT, DOCX, MD files with auto-chunking and embedding.
- **URL Ingestion** — Paste a URL to scrape and ingest web content directly.
- **AI Document Summaries** — Auto-generated 2-sentence summaries on upload.
- **Knowledge Graph** — Interactive force-directed graph showing semantic relationships between documents.
- **Connectors** — OAuth2 integrations for Google Drive, Notion, Slack, and GitHub.

### Platform
- **Dual Theme System** — Dark (glassmorphism) and Light mode with CSS variable architecture.
- **Admin Dashboard** — Time-series analytics for user growth, query utilization, and system health.
- **Role-Based Access** — `ADMIN` and `USER` roles with protected routes.
- **Envelope Encryption** — Per-document AES encryption with S3/MinIO backup.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+ & Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Pinecone account (free tier works)
- OpenAI and/or Google Gemini API key

### 1. Clone & Configure

```bash
git clone <repo-url> && cd ProjectGenAI
cp .env.example .env
# Edit .env with your API keys (see Configuration section below)
```

### 2. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend-react
npm install
npm run dev
```

### 4. Access

| Service   | URL                       |
|-----------|---------------------------|
| Frontend  | http://localhost:5173      |
| Backend   | http://localhost:8000      |
| API Docs  | http://localhost:8000/docs |

---

## 🏗️ Architecture

```
┌────────────────────┐    HTTP/SSE    ┌────────────────────┐
│  React Frontend    │───────────────→│  FastAPI Backend    │
│  (Vite :5173)      │   /api/ proxy  │  (Uvicorn :8000)   │
└────────────────────┘                └────────┬───────────┘
                                               │
                    ┌──────────────┬────────────┼────────────┬──────────────┐
                    │              │            │            │              │
              ┌─────▼─────┐ ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐ ┌─────▼─────┐
              │ Pinecone  │ │ PostgreSQL│ │ Redis │ │   S3 /    │ │  LLM APIs │
              │ (Vectors) │ │  (Data)   │ │(Queue)│ │  MinIO    │ │Gemini/GPT │
              └───────────┘ └───────────┘ └───────┘ └───────────┘ └───────────┘
```

### Key Infrastructure
- **Pinecone** — Vector storage with hybrid search (dense + sparse) and MMR retrieval.
- **PostgreSQL** — Users, documents, rooms, query logs, graph nodes/edges, feedback.
- **Redis** — Job queue for async ingestion, OAuth state/verifier store, WebSocket pub/sub for multi-worker scaling.
- **S3/MinIO** — Encrypted document backup with envelope encryption.

---

## 📡 API Reference

| Method   | Endpoint                          | Description                         |
|----------|-----------------------------------|-------------------------------------|
| `POST`   | `/api/auth/register`              | Register a new user                 |
| `POST`   | `/api/auth/login`                 | Login and receive JWT               |
| `GET`    | `/api/auth/google`                | Initiate Google SSO                 |
| `POST`   | `/api/documents/upload`           | Upload & ingest a document          |
| `POST`   | `/api/documents/ingest-url`       | Ingest content from a URL           |
| `GET`    | `/api/documents`                  | List all documents                  |
| `DELETE` | `/api/documents/{doc_id}`         | Delete a document                   |
| `POST`   | `/api/query`                      | Ask a question (RAG)                |
| `GET`    | `/api/query/stream`               | Stream a RAG answer (SSE)           |
| `POST`   | `/api/query/batch`                | Batch checklist analysis            |
| `POST`   | `/api/query/extract-checklist`    | Extract checklist from a document   |
| `POST`   | `/api/rooms`                      | Create a collaboration room         |
| `GET`    | `/api/user/rooms`                 | List user's rooms                   |
| `GET`    | `/api/graph/data`                 | Get knowledge graph data            |
| `POST`   | `/api/graph/discover`             | Trigger semantic discovery           |
| `GET`    | `/api/admin/stats`                | System statistics                   |
| `GET`    | `/api/admin/stats/time-series`    | Time-series analytics               |
| `GET`    | `/api/connectors/{provider}/auth` | Initiate OAuth for a connector      |

Full interactive docs at **http://localhost:8000/docs** (Swagger UI).

---

## ⚙️ Configuration

All settings via environment variables (see `.env.example`):

| Variable                 | Required | Description                              |
|--------------------------|----------|------------------------------------------|
| `OPENAI_API_KEY`         | ✅       | OpenAI API key                           |
| `GEMINI_API_KEY`         | ✅       | Google Gemini API key                    |
| `PINECONE_API_KEY`       | ✅       | Pinecone vector database key             |
| `JWT_SECRET`             | ✅       | Secret for signing JWT tokens            |
| `DATABASE_URL`           | ✅       | PostgreSQL connection string             |
| `REDIS_URL`              | ✅       | Redis connection string                  |
| `GOOGLE_CLIENT_ID`       | Optional | For Google SSO login                     |
| `GOOGLE_CLIENT_SECRET`   | Optional | For Google SSO login                     |
| `DOCUMENT_ENCRYPTION_KEY`| Optional | 32-byte base64 key for envelope encryption |
| `CORS_ORIGINS`           | Optional | Allowed frontend origins (comma-separated) |
| `LLM_MODEL`              | Optional | Default: `gpt-4.1-mini`                 |

---

## 📁 Project Structure

```
ProjectGenAI/
├── backend/
│   ├── app/
│   │   ├── __init__.py             # FastAPI app factory & middleware
│   │   ├── config.py               # Pydantic settings (env vars)
│   │   ├── routes/                  # API endpoint controllers
│   │   │   ├── auth.py             # Login, register, Google SSO
│   │   │   ├── documents.py        # Upload, delete, URL ingest
│   │   │   ├── query.py            # RAG query, batch, extract
│   │   │   ├── multiplayer.py      # Rooms, WebSocket, shared vault
│   │   │   ├── admin.py            # Stats, user management
│   │   │   ├── connectors.py       # OAuth flows for integrations
│   │   │   ├── graph.py            # Knowledge graph API
│   │   │   └── folders.py          # Folder CRUD
│   │   ├── services/               # Business logic layer
│   │   │   ├── rag.py              # RAG engine, LLM orchestration
│   │   │   ├── ingestion.py        # Document parsing & embedding
│   │   │   ├── vectorstore.py      # Pinecone wrapper
│   │   │   ├── graph_service.py    # Semantic discovery engine
│   │   │   ├── websocket.py        # Redis pub/sub WebSocket manager
│   │   │   ├── session_store.py    # Redis-backed OAuth state store
│   │   │   ├── job_store.py        # Redis-backed async job tracker
│   │   │   ├── s3.py               # S3/MinIO encrypted backup
│   │   │   └── connectors/         # Google Drive, Notion, Slack, GitHub
│   │   ├── models/
│   │   │   ├── database.py         # SQLAlchemy ORM models
│   │   │   └── schemas.py          # Pydantic request/response schemas
│   │   └── utils/
│   │       ├── text_splitter.py    # Recursive character text splitter
│   │       └── extractors.py       # PDF, DOCX, TXT text extraction
│   ├── main.py                     # Uvicorn entrypoint
│   └── requirements.txt
├── frontend-react/
│   ├── src/
│   │   ├── pages/                  # Route-level page components
│   │   │   ├── Home.tsx            # Dashboard with stats & activity
│   │   │   ├── Chat.tsx            # AI chat & multiplayer rooms
│   │   │   ├── DeepResearch.tsx    # Checklist & report research
│   │   │   ├── KnowledgeBase.tsx   # Document upload & management
│   │   │   ├── KnowledgeGraph.tsx  # Interactive force-directed graph
│   │   │   ├── Connectors.tsx      # Third-party integrations
│   │   │   ├── AdminStats.tsx      # Analytics dashboard
│   │   │   └── UserManagement.tsx  # Admin user CRUD
│   │   ├── context/                # React Context providers
│   │   │   ├── AuthContext.tsx     # JWT auth state & SSO
│   │   │   ├── ChatContext.tsx     # Chat state & SSE streaming
│   │   │   ├── ThemeContext.tsx    # Dark/Light theme toggle
│   │   │   ├── WebSocketContext.tsx # Multiplayer WebSocket state
│   │   │   └── VideoCallContext.tsx # LiveKit video state
│   │   ├── components/             # Reusable UI components
│   │   ├── services/api.ts         # Axios wrapper & interceptors
│   │   └── index.css               # CSS variables & design tokens
│   ├── index.html
│   ├── vite.config.ts
│   └── tailwind.config.js
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## License

MIT
