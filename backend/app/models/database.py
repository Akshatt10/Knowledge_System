from datetime import datetime
from typing import Optional

from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="USER", nullable=False)  # "ADMIN" or "USER"
    created_at = Column(DateTime, default=datetime.utcnow)

class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), index=True, nullable=False)
    filename = Column(String(255), nullable=False)
    file_type = Column(String(50))
    chunk_count = Column(String(10), default="0")
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    
    # Encryption & Backup Metadata
    is_encrypted = Column(String(20), default="FALSE") # Store as string for flexibility or Boolean
    encrypted_dek = Column(String, nullable=True) # The per-file key encrypted by master key
    s3_uri = Column(String(512), nullable=True) # Storage backup location

class Room(Base):
    __tablename__ = "rooms"

    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    document_id = Column(String(36), index=True, nullable=True)  # The shared document
    created_at = Column(DateTime, default=datetime.utcnow)

class RoomMember(Base):
    __tablename__ = "room_members"

    id = Column(String(36), primary_key=True, index=True)
    room_id = Column(String(36), index=True, nullable=False)
    user_id = Column(String(36), index=True, nullable=False)
    role = Column(String(20), default="MEMBER", nullable=False) # "OWNER" or "MEMBER"
    joined_at = Column(DateTime, default=datetime.utcnow)

class RoomDocument(Base):
    __tablename__ = "room_documents"

    id = Column(String(36), primary_key=True, index=True)
    room_id = Column(String(36), index=True, nullable=False)
    document_id = Column(String(36), index=True, nullable=False)
    added_by = Column(String(36), index=True, nullable=False) # user_id of whoever shared it
    added_at = Column(DateTime, default=datetime.utcnow)

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String(36), primary_key=True, index=True)
    room_id = Column(String(36), index=True, nullable=False)
    sender_id = Column(String(36), index=True, nullable=True)  # NULL = AI response
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ConnectedAccount(Base):
    __tablename__ = "connected_accounts"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), index=True, nullable=False)
    provider = Column(String(50), nullable=False)
    access_token = Column(String, nullable=False)
    refresh_token = Column(String, nullable=False)
    token_expiry = Column(DateTime, nullable=True)
    connected_at = Column(DateTime, default=datetime.utcnow)
    last_synced_at = Column(DateTime, nullable=True)
