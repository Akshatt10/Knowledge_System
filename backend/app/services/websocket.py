import logging
from typing import Dict, List
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Maps room_id -> list of active WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        logger.info(f"Client connected to room {room_id}. Total: {len(self.active_connections[room_id])}")

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_connections:
            try:
                self.active_connections[room_id].remove(websocket)
                logger.info(f"Client disconnected from room {room_id}. Remaining: {len(self.active_connections[room_id])}")
                if len(self.active_connections[room_id]) == 0:
                    del self.active_connections[room_id]
            except ValueError:
                pass

    async def broadcast(self, room_id: str, message: dict):
        """Broadcasts a JSON message to all clients in a specific room."""
        if room_id in self.active_connections:
            # We iterate over a copy of the list in case of unexpected disconnections
            for connection in list(self.active_connections[room_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.warning(f"Failed to send message to a client in room {room_id}: {e}")
                    self.disconnect(room_id, connection)

manager = ConnectionManager()
