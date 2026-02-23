from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel
import json

from database import engine, Base, get_db
from models import DocumentReview, AIConnection
from services.parser import parse_file
from services.ai_engine import AIEngine
from services.checklist_loader import loader

app = FastAPI(title="Document Scorer API")

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For prototype, allow all. Restrict in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup Event
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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
        print(f"Upload Error: {err_msg}")
        raise HTTPException(status_code=500, detail=str(err_msg))

@app.post("/api/analyze")
async def analyze_document(request: AnalysisRequest, db: AsyncSession = Depends(get_db)):
    # Fetch active connection
    result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
    active_conn = result.scalar_one_or_none()
    
    if not active_conn:
        raise HTTPException(status_code=400, detail="No active AI connection found. Please configure one in Settings.")
    
    provider = active_conn.provider
    model_name = active_conn.model_name
    api_key = active_conn.api_key or ""

    try:
        engine = AIEngine(provider=provider, model_name=model_name, api_key=api_key)
        review_result = await engine.analyze_document(request.text, request.images, request.custom_instructions, request.document_category)
        
        # Save result to DB (Optional for prototype)
        # review = DocumentReview(score=review_result.get("score", 0), full_response_json=review_result)
        # db.add(review)
        # await db.commit()

        return review_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/api/analyze-code")
async def analyze_code(request: CodeAnalysisRequest, db: AsyncSession = Depends(get_db)):
    # Fetch active connection
    result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
    active_conn = result.scalar_one_or_none()
    
    if not active_conn:
        raise HTTPException(status_code=400, detail="No active AI connection found. Please configure one in Settings.")
    
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
    # Fetch active connection
    result = await db.execute(select(AIConnection).where(AIConnection.is_active == True))
    active_conn = result.scalar_one_or_none()
    
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
    active_conn = result.scalar_one_or_none()
    
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
