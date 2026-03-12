"""Thread-safe in-memory job store for tracking async ingestion tasks."""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any


class JobStore:
    """Simple in-memory store for background ingestion jobs.
    
    Sufficient for single-instance deployments. For multi-instance
    setups, swap this for Redis or a Postgres-backed store.
    """

    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def create(self, job_id: str, user_id: str, filename: str) -> dict:
        """Create a new pending job entry."""
        job = {
            "job_id": job_id,
            "user_id": user_id,
            "filename": filename,
            "status": "pending",
            "result": None,
            "error": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        with self._lock:
            self._jobs[job_id] = job
        return job

    def update(self, job_id: str, status: str, result: dict | None = None, error: str | None = None):
        """Update job status."""
        with self._lock:
            if job_id not in self._jobs:
                return
            self._jobs[job_id]["status"] = status
            self._jobs[job_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
            if result is not None:
                self._jobs[job_id]["result"] = result
            if error is not None:
                self._jobs[job_id]["error"] = error

    def get(self, job_id: str) -> dict | None:
        """Get job by ID."""
        with self._lock:
            return self._jobs.get(job_id)

    def cleanup_old_jobs(self, max_age_seconds: int = 3600):
        """Remove completed jobs older than max_age_seconds."""
        cutoff = datetime.now(timezone.utc).timestamp() - max_age_seconds
        with self._lock:
            to_remove = [
                jid for jid, job in self._jobs.items()
                if job["status"] in ("done", "failed")
                and datetime.fromisoformat(job["updated_at"]).timestamp() < cutoff
            ]
            for jid in to_remove:
                del self._jobs[jid]


# Module-level singleton
job_store = JobStore()
