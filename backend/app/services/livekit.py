import os
from livekit import api
from app.config import settings

class LiveKitService:
    """Service to handle LiveKit room management and token generation."""

    def __init__(self):
        self.api_key = settings.LIVEKIT_API_KEY
        self.api_secret = settings.LIVEKIT_API_SECRET
        self.url = settings.LIVEKIT_URL

    def generate_token(self, room_name: str, participant_identity: str, participant_name: str = ""):
        """
        Generates a join token for a participant to join a room.
        """
        if not self.api_key or not self.api_secret:
            # Fallback for development if keys aren't set yet
            return "DEVELOPMENT_TOKEN"

        token = api.AccessToken(self.api_key, self.api_secret) \
            .with_identity(participant_identity) \
            .with_name(participant_name) \
            .with_grants(api.VideoGrants(
                room_join=True,
                room=room_name,
            ))
        
        return token.to_jwt()

livekit_service = LiveKitService()
