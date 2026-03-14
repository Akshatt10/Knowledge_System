"""Redis-backed job store for tracking async ingestion tasks."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
import redis
from app.config import settings

logger = logging.getLogger(__name__)

class JobStore:
    """Redis-backed store for background ingestion jobs.
    
    Provides persistence and accessibility across multiple instances.
    Jobs are stored with a TTL (e.g., 24 hours).
    """

    def __init__(self, redis_url: str, ttl_seconds: int = 86400) -> None:
        self._redis = redis.from_url(redis_url, decode_responses=True)
        self._ttl = ttl_seconds

    def create(self, job_id: str, user_id: str, filename: str) -> dict:
        """Create a new pending job entry in Redis."""
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
        try:
            self._redis.setex(
                f"job:{job_id}",
                self._ttl,
                json.dumps(job)
            )
        except Exception as e:
            logger.error(f"Failed to create job {job_id} in Redis: {e}")
        return job

    def update(self, job_id: str, status: str, result: dict | None = None, error: str | None = None):
        """Update job status in Redis."""
        try:
            job_str = self._redis.get(f"job:{job_id}")
            if not job_str:
                logger.warning(f"Attempted to update non-existent job {job_id}")
                return
            
            job = json.loads(job_str)
            job["status"] = status
            job["updated_at"] = datetime.now(timezone.utc).isoformat()
            if result is not None:
                job["result"] = result
            if error is not None:
                job["error"] = error
                
            self._redis.setex(
                f"job:{job_id}",
                self._ttl,
                json.dumps(job)
            )
        except Exception as e:
            logger.error(f"Failed to update job {job_id} in Redis: {e}")

    def get(self, job_id: str) -> dict | None:
        """Get job by ID from Redis."""
        try:
            job_str = self._redis.get(f"job:{job_id}")
            if job_str:
                return json.loads(job_str)
        except Exception as e:
            logger.error(f"Failed to get job {job_id} from Redis: {e}")
        return None

    def cleanup_old_jobs(self, max_age_seconds: int = 3600):
        """No longer strictly needed as we use Redis TTL, but kept for interface compatibility."""
        pass


# Module-level singleton
job_store = JobStore(settings.REDIS_URL)
