from fastapi import UploadFile, HTTPException
from pypdf import PdfReader
from docx import Document
import io

async def parse_file(file: UploadFile) -> str:
    content = ""
    filename = file.filename.lower()
    
    try:
        if filename.endswith(".pdf"):
            content = await _parse_pdf(file)
        elif filename.endswith(".docx"):
            content = await _parse_docx(file)
        elif filename.endswith((".txt", ".md", ".py", ".js", ".ts", ".json", ".html", ".css")):
            content = await _parse_text(file)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
            
        return content
    except Exception as e:
         import traceback
         err_trace = traceback.format_exc()
         raise HTTPException(status_code=500, detail=f"Error parsing file: {str(e)}\n\n{err_trace}")

async def _parse_pdf(file: UploadFile) -> str:
    content = await file.read()
    reader = PdfReader(io.BytesIO(content))
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    return text

async def _parse_docx(file: UploadFile) -> str:
    content = await file.read()
    doc = Document(io.BytesIO(content))
    text = "\n".join([para.text for para in doc.paragraphs])
    return text

async def _parse_text(file: UploadFile) -> str:
    content = await file.read()
    return content.decode("utf-8")
