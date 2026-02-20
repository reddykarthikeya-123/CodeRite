from fastapi import UploadFile, HTTPException
from pypdf import PdfReader
from docx import Document
import io
import pandas as pd
from PIL import Image
import pytesseract
from pdf2image import convert_from_bytes
import os

# Configure Tesseract path for Windows
tesseract_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
if os.path.exists(tesseract_path):
    pytesseract.pytesseract.tesseract_cmd = tesseract_path

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
        elif filename.endswith((".xlsx", ".xls", ".csv")):
            content = await _parse_excel(file)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
            
        return content
    except Exception as e:
         import traceback
         err_trace = traceback.format_exc()
         raise HTTPException(status_code=500, detail=f"Error parsing file: {str(e)}\n\n{err_trace}")

async def _parse_pdf(file: UploadFile) -> str:
    content = await file.read()
    
    # Text extraction via pypdf
    reader = PdfReader(io.BytesIO(content))
    text = ""
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted + "\n"
    
    # OCR fallback/enhancement via pdf2image and pytesseract
    try:
        # Poppler is required for pdf2image. If not in PATH, this will fail gracefully.
        images = convert_from_bytes(content)
        for i, img in enumerate(images):
            # Only run OCR if page text seems sparse (e.g., scanned doc) to save time,
            # or just run it to catch embedded images. We'll add it if pypdf barely found anything.
            if len(text.strip()) < 100 * len(images): 
                ocr_text = pytesseract.image_to_string(img)
                text += f"\n--- OCR Page {i+1} ---\n" + ocr_text + "\n"
    except Exception as e:
        print(f"OCR warning on PDF: {e}")
        
    return text

async def _parse_docx(file: UploadFile) -> str:
    content = await file.read()
    doc = Document(io.BytesIO(content))
    text = "\n".join([para.text for para in doc.paragraphs])
    
    # Basic attempt to extract inline images from Docx
    try:
        for rel in doc.part.rels.values():
            if "image" in rel.target_ref:
                img_data = rel.target_part.blob
                img = Image.open(io.BytesIO(img_data))
                ocr_text = pytesseract.image_to_string(img)
                if ocr_text.strip():
                    text += f"\n--- Embedded Image OCR ---\n{ocr_text}\n"
    except Exception as e:
        print(f"OCR warning on Docx: {e}")
        
    return text

async def _parse_text(file: UploadFile) -> str:
    content = await file.read()
    return content.decode("utf-8")

async def _parse_excel(file: UploadFile) -> str:
    content = await file.read()
    filename = file.filename.lower()
    text = ""
    
    if filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
        text += f"--- CSV Data ---\n{df.to_csv(index=False)}\n"
    else:
        # Excel multi-sheet processing
        xls = pd.ExcelFile(io.BytesIO(content))
        for sheet_name in xls.sheet_names:
            df = pd.read_excel(xls, sheet_name=sheet_name)
            # Add sheet header and convert to CSV string for readable LLM parsing
            text += f"\n--- Excel Sheet: {sheet_name} ---\n"
            text += df.to_csv(index=False) + "\n"
            
    return text
