"""Main entry point for the Document Scorer API.

This module sets up the FastAPI application, configures CORS, and defines
the API routes for health checks, checklists, connections, file uploads,
and AI analysis.
"""
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel
import json
import shutil
import logging
import platform
from config.logging_config import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

from database import engine, Base, get_db
from models import DocumentReview, AIConnection
from services.parser import parse_file
from services.ai_engine import AIEngine
from services.checklist_loader import loader

app = FastAPI(title="Document Scorer API")

import os

# CORS Setup
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = allowed_origins_env.split(",") if allowed_origins_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

@app.get("/api/connections")
async def get_connections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIConnection))
    connections = result.scalars().all()
    return [{
        "id": c.id, "name": c.name, "provider": c.provider, 
        "model_name": c.model_name, "api_key": c.api_key, "is_active": c.is_active
    } for c in connections]

@app.post("/api/connections")
async def create_connection(conn: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    # Create new connection
    new_conn = AIConnection(
        name=conn.name, provider=conn.provider, 
        model_name=conn.model_name, api_key=conn.api_key, is_active=False
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

@app.put("/api/connections/{conn_id}")
async def update_connection(conn_id: int, conn: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIConnection).where(AIConnection.id == conn_id))
    existing_conn = result.scalar_one_or_none()
    if not existing_conn:
        raise HTTPException(status_code=404, detail="Connection not found")
        
    existing_conn.name = conn.name
    existing_conn.provider = conn.provider
    existing_conn.model_name = conn.model_name
    if conn.api_key is not None:
        existing_conn.api_key = conn.api_key
        
    await db.commit()
    return {"status": "updated"}

@app.post("/api/connections/test")
async def test_connection(conn: ConnectionCreate):
    try:
        engine = AIEngine(provider=conn.provider, model_name=conn.model_name, api_key=conn.api_key or "")
        await engine.test_connection()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/connections/{conn_id}/activate")
async def activate_connection(conn_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIConnection))
    all_conns = result.scalars().all()
    
    found = False
    for c in all_conns:
        if c.id == conn_id:
            c.is_active = True
            found = True
        else:
            c.is_active = False
            
    if not found:
        raise HTTPException(status_code=404, detail="Connection not found")
        
    await db.commit()
    return {"status": "activated"}

@app.delete("/api/connections/{conn_id}")
async def delete_connection(conn_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIConnection).where(AIConnection.id == conn_id))
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    await db.delete(conn)
    await db.commit()
    return {"status": "deleted"}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        parsed_data = await parse_file(file)
        return {"filename": file.filename, "content": parsed_data["text"], "images": parsed_data.get("images", [])}
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        logger.error(f"Upload Error: {err_msg}")
        raise HTTPException(status_code=500, detail=str(err_msg))

@app.post("/api/analyze")
async def analyze_document(request: AnalysisRequest, db: AsyncSession = Depends(get_db)):
    # Fetch active connection safely handling multiple
    result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
    active_conn = result.scalars().first()
    
    if not active_conn:
        raise HTTPException(status_code=400, detail="No active AI connection found. Please configure one in Settings.")
    
    provider = active_conn.provider
    model_name = active_conn.model_name
    api_key = active_conn.api_key or ""

    try:
        engine = AIEngine(provider=provider, model_name=model_name, api_key=api_key)
        review_result = await engine.analyze_document(
            request.text, 
            request.images, 
            request.custom_instructions, 
            request.document_category,
            request.file_type
        )
        
        # Save result to DB (Optional for prototype)
        # review = DocumentReview(score=review_result.get("score", 0), full_response_json=review_result)
        # db.add(review)
        # await db.commit()

        return review_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/api/analyze-code")
async def analyze_code(request: CodeAnalysisRequest, db: AsyncSession = Depends(get_db)):
    # Fetch active connection safely handling multiple
    result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
    active_conn = result.scalars().first()

    if not active_conn:
        raise HTTPException(status_code=400, detail="No active AI connection found. Please configure one in Settings.")

    # Validate file extensions BEFORE sending to AI model
    code_extensions = {'.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.c', '.cpp', '.h', '.hpp', 
                      '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.r', 
                      '.m', '.mm', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.html', '.css', 
                      '.scss', '.sass', '.less', '.vue', '.svelte', '.json', '.xml', '.yaml', 
                      '.yml', '.toml', '.ini', '.cfg', '.conf', '.md', '.rst', '.txt'}
    
    non_code_extensions = {'.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc', '.pptx', '.ppt',
                          '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico', '.webp',
                          '.mp3', '.mp4', '.avi', '.mov', '.zip', '.rar', '.tar', '.gz'}
    
    for f in request.files:
        filename_lower = f.filename.lower()
        for ext in non_code_extensions:
            if filename_lower.endswith(ext):
                raise HTTPException(
                    status_code=400, 
                    detail=f"This is not a code document. The file '{f.filename}' appears to be a {ext.upper()} file, which is not suitable for code review. Please upload source code files only (e.g., .py, .js, .ts, .java, etc.)."
                )

    provider = active_conn.provider
    model_name = active_conn.model_name
    api_key = active_conn.api_key or ""

    try:
        engine = AIEngine(provider=provider, model_name=model_name, api_key=api_key)
        # Convert Pydantic objects to dicts before passing to the engine
        files_data = [{"filename": f.filename, "content": f.content} for f in request.files]
        review_result = await engine.analyze_code(files_data)
        return review_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Code Analysis failed: {str(e)}")

@app.post("/api/auto-fix-code")
async def auto_fix_code(request: CodeAutoFixRequest, db: AsyncSession = Depends(get_db)):
    # Fetch active connection safely handling multiple
    result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
    active_conn = result.scalars().first()
    
    if not active_conn:
        raise HTTPException(status_code=400, detail="No active AI connection found. Please configure one in Settings.")
    
    if not request.selected_suggestions:
        return {"fixed_code": request.content}
        
    provider = active_conn.provider
    model_name = active_conn.model_name
    api_key = active_conn.api_key or ""

    try:
        engine = AIEngine(provider=provider, model_name=model_name, api_key=api_key)
        fixed_result = await engine.auto_fix_code(request.filename, request.content, request.selected_suggestions)
        return fixed_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Code Auto-Fix failed: {str(e)}")

@app.post("/api/auto-fix-code-batch")
async def auto_fix_code_batch(request: CodeAutoFixBatchRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
    active_conn = result.scalars().first()
    
    if not active_conn:
        raise HTTPException(status_code=400, detail="No active AI connection found. Please configure one in Settings.")
        
    valid_files = [f for f in request.files if f.selected_suggestions]
    if not valid_files:
        return {"fixed_files": [{"filename": f.filename, "fixed_code": f.content} for f in request.files]}
        
    provider = active_conn.provider
    model_name = active_conn.model_name
    api_key = active_conn.api_key or ""

    try:
        engine = AIEngine(provider=provider, model_name=model_name, api_key=api_key)
        
        # Convert Pydantic objects to dicts for AI Engine
        files_data = [
            {
                "filename": f.filename,
                "content": f.content,
                "selected_suggestions": f.selected_suggestions
            }
            for f in valid_files
        ]
        
        fixed_result = await engine.auto_fix_code_batch(files_data)
        
        # Merge untouched files back into result for a complete response
        untouched_files = [f for f in request.files if not f.selected_suggestions]
        if untouched_files:
            # fixed_result["fixed_files"] will be a list of dicts: {"filename": "xxx", "fixed_code": "yyy"}
            for f in untouched_files:
                fixed_result.get("fixed_files", []).append({
                    "filename": f.filename,
                    "fixed_code": f.content
                })
        
        return fixed_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch Code Auto-Fix failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
