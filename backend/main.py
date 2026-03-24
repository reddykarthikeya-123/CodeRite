"""Main entry point for the Document Scorer API.

This module sets up the FastAPI application, configures CORS, and defines
the API routes for health checks, checklists, connections, file uploads,
and AI analysis.
"""
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Optional
from pydantic import BaseModel, Field
import json
import shutil
import logging
import platform
import os
import re
from datetime import datetime, timedelta
from functools import wraps

# Setup logging
from config.logging_config import setup_logging
setup_logging()
logger = logging.getLogger(__name__)

# Import security utilities
from utils.security import mask_api_key

# Rate limiting setup
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

from database import engine, Base, get_db
from models import DocumentReview, AIConnection
from services.parser import parse_file
from services.ai_engine import AIEngine
from services.checklist_loader import loader

app = FastAPI(title="Document Scorer API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Setup - Restricted to specific origins
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]

# Validate origins - never allow wildcard with credentials
if "*" in allowed_origins:
    logger.warning("WARNING: Wildcard CORS origin detected. This is a security risk in production.")
    allowed_origins = ["http://localhost:5173", "http://localhost:3000"]  # Safe defaults

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# Startup Event
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Auto-inject paths for Windows local execution without terminal restart
    if platform.system() == "Windows":
        win_path = os.environ.get("PATH", "")
        # Configurable paths via environment variables with sensible defaults
        tesseract_path = os.getenv("TESSERACT_PATH", r"C:\Program Files\Tesseract-OCR")
        poppler_path = os.getenv("POPPLER_PATH", r"C:\poppler\poppler-24.08.0\Library\bin")
        
        if "Tesseract-OCR" not in win_path and os.path.exists(tesseract_path):
            os.environ["PATH"] += os.pathsep + tesseract_path
        if "poppler" not in win_path and os.path.exists(poppler_path):
            os.environ["PATH"] += os.pathsep + poppler_path
        
    logger.info("--- Checking System Dependencies ---")
    tesseract_path = shutil.which("tesseract")
    if tesseract_path:
        logger.info(f"✅ Tesseract OCR found at: {tesseract_path}")
    else:
        logger.warning("❌ Tesseract OCR not found! Image text extraction will fail. (Hint: sudo apt install tesseract-ocr)")

    poppler_path = shutil.which("pdftoppm")
    if poppler_path:
        logger.info(f"✅ Poppler utils found at: {poppler_path}")
    else:
        logger.warning("❌ Poppler utils not found! PDF to Image conversion will fail. (Hint: sudo apt install poppler-utils)")
    logger.info("------------------------------------")

# Pydantic Models for Requests
class ConnectionCreate(BaseModel):
    name: str
    provider: str
    model_name: str
    api_key: Optional[str] = None

class AnalysisRequest(BaseModel):
    text: str
    images: Optional[List[str]] = []
    custom_instructions: Optional[str] = ""
    document_category: str
    file_type: Optional[str] = None
    enabled_checks: Optional[List[str]] = None

class CodeFile(BaseModel):
    filename: str
    content: str

class CodeAnalysisRequest(BaseModel):
    files: List[CodeFile]

class CodeAutoFixRequest(BaseModel):
    filename: str
    content: str
    selected_suggestions: List[str]

class CodeAutoFixBatchRequest(BaseModel):
    files: List[CodeAutoFixRequest]

# Routes
@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/checklists")
async def get_checklists():
    return {"categories": loader.get_categories()}

@app.get("/api/checklists/{category}")
async def get_checklist_items(category: str):
    """Get checklist items for a specific category."""
    items = loader.get_checklist_for_category(category)
    # Filter out header row and return only items with actual checklist text
    filtered_items = []
    for idx, item in enumerate(items):
        # Support both new format (Section, ChecklistItem) and old format (QA Reviewer Name, Unnamed: 1)
        check_text = item.get('ChecklistItem') or item.get('checklist_item') or item.get('Unnamed: 1')
        section = item.get('Section') or item.get('section') or item.get('QA Reviewer Name') or 'General'
        if check_text and check_text != 'Checklist Item':
            filtered_items.append({
                'index': idx,
                'section': section,
                'checklist_item': check_text,
                'original': item
            })
    return {'category': category, 'items': filtered_items}

@app.get("/api/connections")
@limiter.limit("30/minute")
async def get_connections(request: Request, db: AsyncSession = Depends(get_db)):
    """Get all AI connections (API keys are masked for security)."""
    try:
        result = await db.execute(select(AIConnection))
        connections = result.scalars().all()
        # Never return actual API keys - only indicate if one is set
        return [{
            "id": c.id,
            "name": c.name,
            "provider": c.provider,
            "model_name": c.model_name,
            "api_key_set": c.api_key is not None,  # Only indicate if key exists
            "api_key_masked": mask_api_key(c.api_key) if c.api_key else "",
            "is_active": c.is_active
        } for c in connections]
    except SQLAlchemyError as e:
        logger.error(f"Database error in get_connections: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred")
    except Exception as e:
        logger.error(f"Error in get_connections: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

@app.post("/api/connections")
@limiter.limit("10/minute")
async def create_connection(request: Request, conn: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    """Create a new AI connection with encrypted API key storage."""
    try:
        # Validate input
        if not conn.name or not conn.provider or not conn.model_name:
            raise HTTPException(status_code=400, detail="Name, provider, and model_name are required")
        
        if conn.api_key and len(conn.api_key) < 10:
            raise HTTPException(status_code=400, detail="API key appears too short. Please check your API key.")
        
        # Store API key in plaintext as requested
        plaintext_key = None
        if conn.api_key:
            plaintext_key = conn.api_key
        
        new_conn = AIConnection(
            name=conn.name,
            provider=conn.provider,
            model_name=conn.model_name,
            api_key=plaintext_key,
            is_active=False
        )
        
        # If it's the first connection, make it active automatically
        result = await db.execute(select(AIConnection))
        existing = result.scalars().all()
        if len(existing) == 0:
            new_conn.is_active = True

        db.add(new_conn)
        await db.commit()
        await db.refresh(new_conn)
        return {"status": "created", "id": new_conn.id}
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error in create_connection: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred")
    except Exception as e:
        logger.error(f"Error in create_connection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

@app.put("/api/connections/{conn_id}")
@limiter.limit("10/minute")
async def update_connection(request: Request, conn_id: int, conn: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    """Update an AI connection with encrypted API key storage."""
    try:
        result = await db.execute(select(AIConnection).where(AIConnection.id == conn_id))
        existing_conn = result.scalar_one_or_none()
        if not existing_conn:
            raise HTTPException(status_code=404, detail="Connection not found")

        existing_conn.name = conn.name
        existing_conn.provider = conn.provider
        existing_conn.model_name = conn.model_name
        
        # Store new API key if provided and not empty
        if conn.api_key and conn.api_key.strip():
            existing_conn.api_key = conn.api_key

        await db.commit()
        return {"status": "updated"}
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error in update_connection: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred")
    except Exception as e:
        logger.error(f"Error in update_connection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

@app.post("/api/connections/test")
@limiter.limit("5/minute")
async def test_connection(request: Request, conn: ConnectionCreate):
    """Test an AI connection with proper error handling."""
    try:
        if not conn.provider or not conn.model_name:
            raise HTTPException(status_code=400, detail="Provider and model_name are required")
        
        engine = AIEngine(provider=conn.provider, model_name=conn.model_name, api_key=conn.api_key or "")
        await engine.test_connection()
        return {"status": "success", "message": "Connection test successful"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Connection test failed: {e}")
        raise HTTPException(status_code=400, detail=f"Connection test failed: {str(e)}")

@app.put("/api/connections/{conn_id}/activate")
@limiter.limit("10/minute")
async def activate_connection(request: Request, conn_id: int, db: AsyncSession = Depends(get_db)):
    """Activate a connection with atomic database operation to prevent race conditions."""
    try:
        # Use atomic UPDATE to prevent race conditions
        await db.execute(
            "UPDATE ai_connections SET is_active = (id = :active_id)",
            {"active_id": conn_id}
        )
        
        # Verify the connection exists
        result = await db.execute(select(AIConnection).where(AIConnection.id == conn_id))
        conn = result.scalar_one_or_none()
        if not conn:
            raise HTTPException(status_code=404, detail="Connection not found")

        await db.commit()
        return {"status": "activated", "id": conn_id}
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error in activate_connection: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred")
    except Exception as e:
        logger.error(f"Error in activate_connection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

@app.delete("/api/connections/{conn_id}")
@limiter.limit("10/minute")
async def delete_connection(request: Request, conn_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a connection with proper error handling."""
    try:
        result = await db.execute(select(AIConnection).where(AIConnection.id == conn_id))
        conn = result.scalar_one_or_none()
        if not conn:
            raise HTTPException(status_code=404, detail="Connection not found")

        await db.delete(conn)
        await db.commit()
        return {"status": "deleted", "id": conn_id}
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error in delete_connection: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred")
    except Exception as e:
        logger.error(f"Error in delete_connection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

@app.post("/api/upload")
@limiter.limit("20/minute")
async def upload_file(request: Request, file: UploadFile = File(...)):
    """Upload and parse a file with proper error handling and sanitization."""
    try:
        parsed_data = await parse_file(file)
        return {
            "filename": file.filename,
            "content": parsed_data["text"],
            "images": parsed_data.get("images", [])
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload Error for file '{file.filename}': {e}", exc_info=True)
        # Don't expose stack traces to users
        raise HTTPException(status_code=500, detail="File upload failed. Please check the file format and try again.")

@app.post("/api/analyze")
@limiter.limit("10/minute")
async def analyze_document(request: Request, analysis_request: AnalysisRequest, db: AsyncSession = Depends(get_db)):
    """Analyze a document with proper error handling and API key decryption."""
    try:
        # Fetch active connection
        result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
        active_conn = result.scalars().first()

        if not active_conn:
            raise HTTPException(
                status_code=400,
                detail="No active AI connection found. Please configure one in Settings."
            )

        # Use API key directly
        api_key = ""
        if active_conn.api_key:
            api_key = active_conn.api_key

        provider = active_conn.provider
        model_name = active_conn.model_name

        engine = AIEngine(provider=provider, model_name=model_name, api_key=api_key)
        review_result = await engine.analyze_document(
            analysis_request.text,
            analysis_request.images,
            analysis_request.custom_instructions,
            analysis_request.document_category,
            analysis_request.file_type,
            analysis_request.enabled_checks
        )

        return review_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Document analysis failed. Please try again.")

@app.post("/api/analyze-code")
@limiter.limit("10/minute")
async def analyze_code(request: Request, code_request: CodeAnalysisRequest, db: AsyncSession = Depends(get_db)):
    """Analyze code files with proper error handling and API key decryption."""
    try:
        # Fetch active connection
        result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
        active_conn = result.scalars().first()

        if not active_conn:
            raise HTTPException(
                status_code=400,
                detail="No active AI connection found. Please configure one in Settings."
            )

        # Validate file extensions BEFORE sending to AI model
        non_code_extensions = {'.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc', '.pptx', '.ppt',
                              '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico', '.webp',
                              '.mp3', '.mp4', '.avi', '.mov', '.zip', '.rar', '.tar', '.gz'}

        for f in code_request.files:
            filename_lower = f.filename.lower()
            for ext in non_code_extensions:
                if filename_lower.endswith(ext):
                    raise HTTPException(
                        status_code=400,
                        detail=f"This is not a code document. The file '{f.filename}' appears to be a {ext.upper()} file, which is not suitable for code review. Please upload source code files only (e.g., .py, .js, .ts, .java, etc.)."
                    )
            
            # Handle .car binary payloads sent as base64 from React
            if filename_lower.endswith('.car') and f.content.startswith('data:'):
                try:
                    import base64
                    from services.parser import _parse_car_from_bytes
                    b64_str = f.content.split('base64,')[1]
                    binary_content = base64.b64decode(b64_str)
                    car_text, _ = await _parse_car_from_bytes(binary_content)
                    f.content = car_text
                except Exception as e:
                    logger.error(f"Failed to process .car file {f.filename}: {e}")
                    raise HTTPException(status_code=400, detail=f"Failed to process archive '{f.filename}': {str(e)}")

        # Use API key directly
        api_key = ""
        if active_conn.api_key:
            api_key = active_conn.api_key

        provider = active_conn.provider
        model_name = active_conn.model_name

        engine = AIEngine(provider=provider, model_name=model_name, api_key=api_key)
        files_data = [{"filename": f.filename, "content": f.content} for f in code_request.files]
        review_result = await engine.analyze_code(files_data)
        return review_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Code analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Code analysis failed. Please try again.")

@app.post("/api/auto-fix-code")
@limiter.limit("5/minute")
async def auto_fix_code(request: Request, auto_fix_request: CodeAutoFixRequest, db: AsyncSession = Depends(get_db)):
    """Auto-fix code with proper error handling and API key decryption."""
    try:
        # Fetch active connection
        result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
        active_conn = result.scalars().first()

        if not active_conn:
            raise HTTPException(
                status_code=400,
                detail="No active AI connection found. Please configure one in Settings."
            )

        if not auto_fix_request.selected_suggestions:
            return {"fixed_code": auto_fix_request.content}

        # Use API key directly
        api_key = ""
        if active_conn.api_key:
            api_key = active_conn.api_key

        provider = active_conn.provider
        model_name = active_conn.model_name

        engine = AIEngine(provider=provider, model_name=model_name, api_key=api_key)
        fixed_result = await engine.auto_fix_code(
            auto_fix_request.filename,
            auto_fix_request.content,
            auto_fix_request.selected_suggestions
        )
        return fixed_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Code auto-fix failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Code auto-fix failed. Please try again.")

@app.post("/api/auto-fix-code-batch")
@limiter.limit("5/minute")
async def auto_fix_code_batch(request: Request, batch_request: CodeAutoFixBatchRequest, db: AsyncSession = Depends(get_db)):
    """Auto-fix code in batch with proper error handling and API key decryption."""
    try:
        # Fetch active connection
        result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
        active_conn = result.scalars().first()

        if not active_conn:
            raise HTTPException(
                status_code=400,
                detail="No active AI connection found. Please configure one in Settings."
            )

        valid_files = [f for f in batch_request.files if f.selected_suggestions]
        if not valid_files:
            return {
                "fixed_files": [
                    {"filename": f.filename, "fixed_code": f.content}
                    for f in batch_request.files
                ]
            }

        # Use API key directly
        api_key = ""
        if active_conn.api_key:
            api_key = active_conn.api_key

        provider = active_conn.provider
        model_name = active_conn.model_name

        engine = AIEngine(provider=provider, model_name=model_name, api_key=api_key)

        files_data = [
            {
                "filename": f.filename,
                "content": f.content,
                "selected_suggestions": f.selected_suggestions
            }
            for f in valid_files
        ]

        fixed_result = await engine.auto_fix_code_batch(files_data)

        # Merge untouched files back into result
        untouched_files = [f for f in batch_request.files if not f.selected_suggestions]
        if untouched_files:
            for f in untouched_files:
                fixed_result.get("fixed_files", []).append({
                    "filename": f.filename,
                    "fixed_code": f.content
                })

        return fixed_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch code auto-fix failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Batch code auto-fix failed. Please try again.")


# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses."""
    try:
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response
    except Exception as e:
        logger.error(f"Error in security headers middleware: {e}")
        return await call_next(request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
