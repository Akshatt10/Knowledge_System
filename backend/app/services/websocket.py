"""WebSocket ConnectionManager with Redis pub/sub for multi-worker deployments.

Local WebSocket connections are tracked per-instance. Messages are published to
Redis so all instances broadcast to their connected clients. Falls back to
local-only mode if Redis is unavailable.
"""

import asyncio
import json
import logging
from typing import Dict, List

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # Local WebSocket connections for this worker instance
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self._redis = None
        self._pubsub = None
        self._listener_task = None

    async def _get_redis(self):
        """Lazily initialize async Redis connection."""
        if self._redis is None:
            try:
                import redis.asyncio as aioredis
                from app.config import settings
                self._redis = aioredis.from_url(
                    settings.REDIS_URL, decode_responses=True
                )
                await self._redis.ping()
                logger.info("WebSocket Redis pub/sub connected successfully.")
            except Exception as e:
                logger.warning(
                    "Redis unavailable for WebSocket pub/sub, falling back to local-only: %s", e
                )
                self._redis = None
        return self._redis

    async def _start_listener(self, room_id: str):
        """Subscribe to a Redis channel and forward messages to local clients."""
        redis = await self._get_redis()
        if not redis:
            return

        try:
            if self._pubsub is None:
                self._pubsub = redis.pubsub()

            channel = f"ws:room:{room_id}"
            await self._pubsub.subscribe(channel)

            async for raw_message in self._pubsub.listen():
                if raw_message["type"] != "message":
                    continue
                try:
                    message = json.loads(raw_message["data"])
                    # Broadcast to local connections only (avoid re-publish loop)
                    await self._local_broadcast(room_id, message)
                except Exception as e:
                    logger.warning("Failed to process pub/sub message: %s", e)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Redis listener error for room %s: %s", room_id, e)

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
            # Start Redis listener for this room (first connection on this instance)
            redis = await self._get_redis()
            if redis:
                task = asyncio.create_task(self._start_listener(room_id))
                # Store reference to prevent garbage collection
                if not hasattr(self, '_listener_tasks'):
                    self._listener_tasks: Dict[str, asyncio.Task] = {}
                self._listener_tasks[room_id] = task

        self.active_connections[room_id].append(websocket)
        logger.info(
            "Client connected to room %s. Total local: %d",
            room_id, len(self.active_connections[room_id])
        )

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_connections:
            try:
                self.active_connections[room_id].remove(websocket)
                logger.info(
                    "Client disconnected from room %s. Remaining local: %d",
                    room_id, len(self.active_connections[room_id])
                )
                if len(self.active_connections[room_id]) == 0:
                    del self.active_connections[room_id]
                    # Cancel Redis listener if no local connections
                    if hasattr(self, '_listener_tasks') and room_id in self._listener_tasks:
                        self._listener_tasks[room_id].cancel()
                        del self._listener_tasks[room_id]
            except ValueError:
                pass

    async def _local_broadcast(self, room_id: str, message: dict):
        """Send message to all LOCAL WebSocket connections in the room."""
        if room_id in self.active_connections:
            for connection in list(self.active_connections[room_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.warning(
                        "Failed to send to client in room %s: %s", room_id, e
                    )
                    self.disconnect(room_id, connection)

    async def broadcast(self, room_id: str, message: dict):
        """Broadcast a message to ALL instances via Redis pub/sub.

        Falls back to local-only broadcast if Redis is unavailable.
        """
        redis = await self._get_redis()
        if redis:
            try:
                channel = f"ws:room:{room_id}"
                await redis.publish(channel, json.dumps(message))
                return  # Redis listener handles local delivery
            except Exception as e:
                logger.warning(
                    "Redis publish failed, falling back to local broadcast: %s", e
                )

        # Fallback: local-only broadcast
        await self._local_broadcast(room_id, message)


manager = ConnectionManager()
