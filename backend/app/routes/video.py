from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.livekit import livekit_service
from app.services.auth import get_current_user

router = APIRouter()

class TokenRequest(BaseModel):
    room_name: str
    participant_name: Optional[str] = None

@router.post("/video/token")
async def get_video_token(
    request: TokenRequest,
    current_user = Depends(get_current_user)
):
    """
    Endpoint to get a LiveKit join token for a specific room.
    """
    try:
        identity = current_user.email
        name = request.participant_name or identity.split('@')[0]
        
        token = livekit_service.generate_token(
            room_name=request.room_name,
            participant_identity=identity,
            participant_name=name
        )
        
        return {"token": token}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
