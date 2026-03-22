import redis
import json
import logging
from app.config import settings

logger = logging.getLogger(__name__)

class SessionStore:
    """Store short-lived OAuth states and verifiers in Redis."""
    
    def __init__(self):
        try:
            self.redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
            self.redis.ping()
            logger.info("SessionStore connected to Redis successfully.")
        except Exception as e:
            logger.error(f"Failed to connect SessionStore to Redis: {e}")
            self.redis = None

    def set_verifier(self, state: str, verifier: str, ttl: int = 600):
        """Save a code_verifier or user_id for a given state."""
        if not self.redis:
            return
        try:
            self.redis.setex(f"oauth_state:{state}", ttl, verifier)
        except Exception as e:
            logger.error(f"Redis set_verifier failed: {e}")

    def get_verifier(self, state: str, consume: bool = False) -> str | None:
        """Retrieve the verifier for a state.
        
        Args:
            state: The OAuth state key
            consume: If True, delete the key after retrieval (use only on confirmed success).
                     If False, leave it for potential retries — TTL handles cleanup.
        """
        if not self.redis:
            return None
        try:
            val = self.redis.get(f"oauth_state:{state}")
            if val and consume:
                self.redis.delete(f"oauth_state:{state}")
            return val
        except Exception as e:
            logger.error(f"Redis get_verifier failed: {e}")
            return None

session_store = SessionStore()
