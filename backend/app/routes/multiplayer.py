import json
import logging
import os
from typing import Optional
import uuid

# Disable tokenizers parallelism warning for forked processes
os.environ["TOKENIZERS_PARALLELISM"] = "false"

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketState
from jose import jwt

from app.models.database import Room, RoomMember, RoomDocument, ChatMessage, User, Document
from app.services.auth import get_db, get_current_user
from app.services.websocket import manager
from app.services.vectorstore import vector_store
from app.services.rag import rag_service
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Dependency override for WebSockets where we can't easily send an auth header initially
async def get_current_user_ws(token: str = Query(...), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
            
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/rooms")
def create_room(
    document_id: Optional[str] = None,
    name: str = "Collaboration Room",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new multiplayer room for a given document (or Global room if None)."""
    # Verify document exists if one is provided
    if document_id:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
    else:
        document_id = None # Normalize empty strings to Null in DB

    room_id = str(uuid.uuid4())
    room = Room(id=room_id, name=name, document_id=document_id)
    
    # Add creator as OWNER
    member = RoomMember(id=str(uuid.uuid4()), room_id=room_id, user_id=current_user.id, role="OWNER")
    
    db.add(room)
    db.add(member)
    
    # If a document was optionally provided on creation, attach it to the new mapping table
    if document_id:
        room_doc = RoomDocument(
            id=str(uuid.uuid4()),
            room_id=room_id,
            document_id=document_id,
            added_by=current_user.id
        )
        db.add(room_doc)

    db.commit()
    return {"room_id": room_id, "name": name, "document_id": document_id}

@router.get("/user/rooms")
def get_user_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch all rooms the current user is a member of for the Sidebar UI."""
    memberships = db.query(RoomMember).filter(RoomMember.user_id == current_user.id).all()
    room_ids = [m.room_id for m in memberships]
    
    rooms = db.query(Room).filter(Room.id.in_(room_ids)).order_by(Room.created_at.desc()).all()
    return {"rooms": [{"id": r.id, "name": r.name, "created_at": r.created_at} for r in rooms]}

@router.post("/rooms/{room_id}/documents")
async def add_document_to_room(
    room_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add an existing document into the shared room context."""
    # Verify room access
    member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this room")
        
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Check if already in room
    existing = db.query(RoomDocument).filter(RoomDocument.room_id == room_id, RoomDocument.document_id == document_id).first()
    if existing:
        return {"status": "already_added"}
        
    room_doc = RoomDocument(
        id=str(uuid.uuid4()),
        room_id=room_id,
        document_id=document_id,
        added_by=current_user.id
    )
    db.add(room_doc)
    db.commit()
    
    # Broadcast to room that a document was shared
    username = current_user.email.split("@")[0]
    await manager.broadcast(room_id, {
        "type": "system",
        "content": f"✨ {username} shared '{doc.filename}' to the Room's Shared Vault."
    })
    
    return {"status": "success", "room_id": room_id, "document_id": document_id, "filename": doc.filename}

@router.get("/rooms/{room_id}/documents")
def get_room_documents(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List documents currently attached to the room."""
    member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this room")
        
    room_docs = db.query(RoomDocument).filter(RoomDocument.room_id == room_id).all()
    doc_ids = [rd.document_id for rd in room_docs]
    
    docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
    
    return {"documents": [{"id": d.id, "filename": d.filename, "file_type": d.file_type} for d in docs]}

@router.delete("/rooms/{room_id}/leave")
def leave_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Leave a multiplayer room."""
    member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id).first()
    if not member:
        # If they aren't a member (already left), just succeed silently instead of crashing UI
        return {"status": "success", "message": "Already not a member."}
        
    db.delete(member)
    db.commit()
    return {"status": "success"}

@router.get("/rooms/{room_id}/history")
def get_room_history(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch the chat history for a room."""
    # Verify user is in room (or allow public access for simplicity right now, wait let's verify)
    member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id).first()
    if not member:
        # Auto-join them as a participant if they have the link
        member = RoomMember(id=str(uuid.uuid4()), room_id=room_id, user_id=current_user.id, role="MEMBER")
        db.add(member)
        db.commit()
        
    messages = db.query(ChatMessage).filter(ChatMessage.room_id == room_id).order_by(ChatMessage.created_at.asc()).all()
    
    # We need to format it to match what the frontend expects
    history = []
    for msg in messages:
        # Fetch sender info
        sender_email = "AI"
        if msg.sender_id:
            sender = db.query(User).filter(User.id == msg.sender_id).first()
            if sender:
                sender_email = sender.email.split("@")[0] # Just the username part
        
        history.append({
            "id": msg.id,
            "role": "user" if msg.sender_id else "assistant",
            "content": msg.content,
            "sender": sender_email
        })
    return {"messages": history}

@router.websocket("/ws/chat/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    # 1. Authenticate user from Token
    try:
        user = await get_current_user_ws(token, db)
    except HTTPException:
        await websocket.close(code=1008)
        return

    # Verify room exists
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        await websocket.close(code=4004) # Not found
        return

    # 2. Connect to Room
    await manager.connect(room_id, websocket)
    
    # Let others know someone joined
    username = user.email.split("@")[0]
    await manager.broadcast(room_id, {
        "type": "system",
        "content": f"{username} joined the room."
    })

    try:
        while True:
            # 3. Listen for incoming message (JSON)
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            prompt = payload.get("prompt")
            provider = payload.get("provider", "gemini")
            
            if not prompt:
                continue

            # A. Broadcast the user's prompt immediately to everyone
            user_msg_id = str(uuid.uuid4())
            user_chat = ChatMessage(id=user_msg_id, room_id=room_id, sender_id=user.id, content=prompt)
            db.add(user_chat)
            db.commit()

            await manager.broadcast(room_id, {
                "type": "user_message",
                "id": user_msg_id,
                "sender": username,
                "content": prompt
            })

            # B. Invoke LLM logic (Enterprise RAG pipeline for shared room documents)
            
            # 1: Find all documents associated with this room via the mapping table
            room_docs = db.query(RoomDocument).filter(RoomDocument.room_id == room_id).all()
            room_doc_ids = [doc.document_id for doc in room_docs]
            
            # Legacy fallback: If the room has a legacy document_id attached directly to it, include it.
            if room.document_id and room.document_id not in room_doc_ids:
                room_doc_ids.append(room.document_id)
                
            docs = []
            if room_doc_ids:
                # 2: Create a massive filter combining ALL documented attached to the room
                # Pinecone supports the $in operator for checking multiple values
                filter_dict = {"document_id": {"$in": room_doc_ids}}
                retriever = vector_store.get_retriever(
                    filter_dict=filter_dict,
                    search_type="mmr",
                    search_kwargs={"k": 7, "fetch_k": 25}
                )
                docs = retriever.invoke(prompt)
            else:
                # No documents attached to room, pure LLM chat
                docs = []
            
            context = "\n\n".join([d.page_content for d in docs])
            
            system_prompt = (
                "You are an expert AI assistant designed to extract information and answer questions "
                "based exclusively on the following provided context. Be helpful and professional.\n\n"
                f"Context from uploaded document(s):\n{context}\n\n"
            )

            # Initialize Model based on provider with automatic fallback capabilities
            primary_provider = provider
            try:
                llm = rag_service.get_llm(provider=primary_provider)
            except ValueError:
                # Absolute last-resort fallback
                primary_provider = "openai" if provider == "gemini" else "gemini"
                llm = rag_service.get_llm(provider=primary_provider)
            
            # Fetch past standard history for context (up to last 6 msgs)
            past_msgs = db.query(ChatMessage).filter(ChatMessage.room_id == room_id).order_by(ChatMessage.created_at.desc()).limit(6).all()
            past_msgs.reverse()
            
            langchain_msgs = [SystemMessage(content=system_prompt)]
            for past_m in past_msgs:
                if past_m.sender_id:
                    langchain_msgs.append(HumanMessage(content=past_m.content))
                else:
                    langchain_msgs.append(AIMessage(content=past_m.content))

            # Send a signal that AI is typing
            ai_msg_id = str(uuid.uuid4())
            await manager.broadcast(room_id, {
                "type": "ai_chunk",
                "id": ai_msg_id,
                "content": "",
                "status": "start" # Tell UI to create a new bubble
            })

            # Stream response
            full_response = ""
            try:
                # Streaming mechanism via async stream (invoke since we don't have true async pipeline set up fully yet, but we can stream it)
                # Note: langchain's astream is better for async
                async for chunk in llm.astream(langchain_msgs):
                    if chunk.content:
                        full_response += chunk.content
                        await manager.broadcast(room_id, {
                            "type": "ai_chunk",
                            "id": ai_msg_id,
                            "content": full_response,
                            "status": "streaming"
                        })
                
                # Close the stream
                await manager.broadcast(room_id, {
                    "type": "ai_chunk",
                    "id": ai_msg_id,
                    "content": full_response,
                    "status": "done"
                })

            except Exception as llm_error:
                error_str = str(llm_error)
                logger.error(f"LLM Error during websocket stream: {error_str}")
                
                # Check for rate limit or quota errors
                if ("429" in error_str or "Quota exceeded" in error_str or "Too Many Requests" in error_str):
                    fallback_provider = "openai" if primary_provider == "gemini" else "gemini"
                    logger.warning(f"Rate limit hit for {primary_provider}. Falling back to {fallback_provider}.")
                    
                    try:
                        fallback_llm = rag_service.get_llm(provider=fallback_provider)
                        notification = f"\n\n> *Rate limit reached for {primary_provider}. Switching to {fallback_provider}...*\n\n"
                        full_response += notification
                        await manager.broadcast(room_id, {
                            "type": "ai_chunk",
                            "id": ai_msg_id,
                            "content": full_response,
                            "status": "streaming"
                        })
                        
                        # Restart the stream with the fallback LLM
                        async for chunk in fallback_llm.astream(langchain_msgs):
                            if chunk.content:
                                full_response += chunk.content
                                await manager.broadcast(room_id, {
                                    "type": "ai_chunk",
                                    "id": ai_msg_id,
                                    "content": full_response,
                                    "status": "streaming"
                                })
                                
                    except Exception as fallback_err:
                        # Fallback also failed
                        error_msg = f"\n\n[Error: Both primary and fallback LLMs failed: {str(fallback_err)}]"
                        full_response += error_msg
                        await manager.broadcast(room_id, {
                            "type": "ai_chunk",
                            "id": ai_msg_id,
                            "content": full_response,
                            "status": "streaming"
                        })
                else:
                    # Non-rate limit error
                    error_msg = f"\n\n[Error from LLM Provider: {error_str}]"
                    full_response += error_msg
                    await manager.broadcast(room_id, {
                        "type": "ai_chunk",
                        "id": ai_msg_id,
                        "content": full_response,
                        "status": "streaming"
                    })
                    
                # Close the stream after error handling
                await manager.broadcast(room_id, {
                    "type": "ai_chunk",
                    "id": ai_msg_id,
                    "content": full_response,
                    "status": "done"
                })

            # Save full response to DB
            ai_chat = ChatMessage(id=ai_msg_id, room_id=room_id, sender_id=None, content=full_response)
            db.add(ai_chat)
            db.commit()

    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        await manager.broadcast(room_id, {
            "type": "system",
            "content": f"{username} left the room."
        })
    except Exception as e:
        logger.error(f"Websocket error: {e}")
        try:
           manager.disconnect(room_id, websocket)
        except Exception:
           pass
