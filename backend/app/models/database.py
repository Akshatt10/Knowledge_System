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
