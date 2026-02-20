from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Float, Boolean
from sqlalchemy.sql import func
from database import Base

class DocumentReview(Base):
    __tablename__ = "document_reviews"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    content_hash = Column(String, index=True) 
    score = Column(Float)
    full_response_json = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AIConnection(Base):
    __tablename__ = "ai_connections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    provider = Column(String)
    model_name = Column(String)
    api_key = Column(String, nullable=True)
    is_active = Column(Boolean, default=False)
