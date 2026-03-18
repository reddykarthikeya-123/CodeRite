"""Module for parsing various file formats and extracting text and images.

Supports PDF, DOCX, PPTX, Excel, and plain text files. Uses OCR for images
embedded in documents when necessary.
"""
from fastapi import UploadFile, HTTPException
from pypdf import PdfReader
import pdfplumber
from docx import Document
from pptx import Presentation
import io
import pandas as pd
from PIL import Image
import pytesseract
from pdf2image import convert_from_bytes
import os
import base64
import logging
from typing import Tuple, List
from config.logging_config import get_logger

logger = get_logger(__name__)

# Try to import python-magic for MIME type detection
# This is optional - if not available, we'll skip MIME validation
try:
    import magic
    MAGIC_AVAILABLE = True
except ImportError:
    MAGIC_AVAILABLE = False
    logger.warning("python-magic not available. MIME type validation will be skipped. Install libmagic if needed.")

# Max file size 50MB
MAX_FILE_SIZE = 50 * 1024 * 1024

# Whitelisted extensions
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".txt", ".md", ".py", ".js", ".ts", ".json", ".html", ".css", ".xlsx", ".xls", ".csv"}

# Allowed MIME types
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/markdown",
    "text/x-python",
    "application/javascript",
    "application/json",
    "text/html",
    "text/css",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv"
}

def sanitize_filename(filename: str) -> str:
    """Sanitize the filename by taking only the base name.

    Args:
        filename: The original filename from UploadFile.

    Returns:
        The sanitized base filename.
    """
    return os.path.basename(filename)

async def parse_file(file: UploadFile) -> dict:
    """Parse uploaded file and extract text and images with security validations.

    Args:
        file: The uploaded file object.

    Returns:
        A dictionary containing extracted 'text' and 'images'.

    Raises:
        HTTPException: For invalid file types, sizes, or parsing errors.
    """
    # 1. Filename sanitization
    filename = sanitize_filename(file.filename).lower()

    # 2. Extension validation
    _, ext = os.path.splitext(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file extension: {ext}")

    # 3. Size validation
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

    # 4. MIME type validation using python-magic (optional, requires libmagic installed)
    if MAGIC_AVAILABLE:
        mime_type = magic.from_buffer(content, mime=True)
        # Be more flexible for text/plain as many code files are identified as text/plain
        if mime_type not in ALLOWED_MIME_TYPES and not (ext in [".py", ".js", ".ts", ".json", ".html", ".css", ".md", ".txt"] and mime_type.startswith("text/")):
            # Log a warning but allow the file - be flexible for development environments
            if not mime_type.startswith("text/"):
                logger.warning(f"MIME type mismatch for '{filename}': detected '{mime_type}', allowing based on extension")
    else:
        # Skip MIME validation if magic not available (e.g., Windows without libmagic)
        logger.debug(f"Skipping MIME validation for '{filename}' (libmagic not installed)")

    # Reset file pointer or use content directly for parsing
    # Since we already read it into 'content', we'll modify parsers to accept bytes or use io.BytesIO

    images = []
    text_content = ""

    try:
        if filename.endswith(".pdf"):
            text_content, images = await _parse_pdf_from_bytes(content)
        elif filename.endswith(".docx"):
            text_content, images = await _parse_docx_from_bytes(content)
        elif filename.endswith(".pptx"):
            text_content, images = await _parse_pptx_from_bytes(content)
        elif filename.endswith((".txt", ".md", ".py", ".js", ".ts", ".json", ".html", ".css")):
            text_content = content.decode("utf-8")
            images = []
        elif filename.endswith((".xlsx", ".xls", ".csv")):
            text_content = await _parse_excel_from_bytes(content, filename)
            images = []

        return {"text": text_content, "images": images}
    except Exception as e:
        logger.error(f"Error parsing file '{filename}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error parsing file. Please check the file format and try again.")

# Helper functions to handle bytes instead of UploadFile to avoid double reading
async def _parse_pdf_from_bytes(content: bytes) -> Tuple[str, List[str]]:
    """Extracts text and images from a PDF provided as bytes.

    Args:
        content: The raw PDF file content.

    Returns:
        A tuple of (extracted_text, list_of_base64_images).
    """
    text = ""
    base64_images = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for i, page in enumerate(pdf.pages):
            page_text = page.extract_text(layout=True)
            if page_text:
                text += f"\n--- Page {i+1} Text ---\n{page_text}\n"

            tables = page.extract_tables()
            if tables:
                text += f"\n--- Page {i+1} Tables ---\n"
                for table_idx, table in enumerate(tables):
                    text += f"Table {table_idx + 1}:\n"
                    for row in table:
                        cleaned_row = [str(cell).replace("\n", " ").strip() if cell is not None else "" for cell in row]
                        text += "| " + " | ".join(cleaned_row) + " |\n"
                    text += "\n"

    try:
        images = convert_from_bytes(content)
        for i, img in enumerate(images):
            buffered = io.BytesIO()
            img.save(buffered, format="JPEG")
            img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
            base64_images.append(img_b64)

            if len(text.strip()) < 100 * len(images): 
                ocr_text = pytesseract.image_to_string(img)
                text += f"\n--- OCR Page {i+1} ---\n" + ocr_text + "\n"
    except Exception as e:
        logger.warning(f"OCR/Vision warning on PDF: {e}")

    return text, base64_images
async def _parse_docx_from_bytes(content: bytes) -> Tuple[str, List[str]]:
    """Extracts text and images from a DOCX provided as bytes.

    Args:
        content: The raw DOCX file content.

    Returns:
        A tuple of (extracted_text, list_of_base64_images).
    """
    doc = Document(io.BytesIO(content))
    text = ""
    # DOCX files don't have reliable page breaks in their structure
    # (pagination is determined at render time by the viewer)
    # So we extract text without artificial page markers
    for para in doc.paragraphs:
        if para.text.strip():
            text += para.text + "\n"

    base64_images = []
    try:
        for rel in doc.part.rels.values():
            if "image" in rel.target_ref:
                img_data = rel.target_part.blob
                img = Image.open(io.BytesIO(img_data))
                buffered = io.BytesIO()
                if img.mode in ("RGBA", "P"): img = img.convert("RGB")
                img.save(buffered, format="JPEG")
                img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
                base64_images.append(img_b64)

                ocr_text = pytesseract.image_to_string(img)
                if ocr_text.strip():
                    text += f"\n--- Embedded Image OCR ---\n{ocr_text}\n"
    except Exception as e:
        logger.warning(f"OCR/Vision warning on Docx: {e}")

    return text, base64_images
async def _parse_pptx_from_bytes(content: bytes) -> Tuple[str, List[str]]:
    """Extracts text and images from a PPTX provided as bytes.

    Args:
        content: The raw PPTX file content.

    Returns:
        A tuple of (extracted_text, list_of_base64_images).
    """
    prs = Presentation(io.BytesIO(content))
    text = ""
    base64_images = []

    for i, slide in enumerate(prs.slides):
        text += f"\n--- Slide {i+1} ---\n"
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                text += shape.text + "\n"
            if getattr(shape, "shape_type", None) == 13: 
                try:
                    img_bytes = shape.image.blob
                    img = Image.open(io.BytesIO(img_bytes))
                    buffered = io.BytesIO()
                    if img.mode in ("RGBA", "P"): img = img.convert("RGB")
                    img.save(buffered, format="JPEG")
                    img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
                    base64_images.append(img_b64)
                    ocr_text = pytesseract.image_to_string(img)
                    if ocr_text.strip():
                        text += f"\n[Embedded Image OCR]: {ocr_text}\n"
                except Exception as e:
                    logger.error(f"Failed to process image on slide {i+1}: {e}")
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
            notes = slide.notes_slide.notes_text_frame.text
            if notes.strip():
                text += f"\n[Speaker Notes]:\n{notes}\n"

    return text, base64_images

async def _parse_excel_from_bytes(content: bytes, filename: str) -> str:
    """Extracts text from an Excel or CSV file provided as bytes.

    Args:
        content: The raw file content.
        filename: The filename to determine if it's CSV or Excel.

    Returns:
        The extracted text content formatted as CSV.
    """
    text = ""
    if filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
        text += f"--- CSV Data ---\n{df.to_csv(index=False)}\n"
    else:
        xls = pd.ExcelFile(io.BytesIO(content))
        for sheet_name in xls.sheet_names:
            df = pd.read_excel(xls, sheet_name=sheet_name)
            text += f"\n--- Excel Sheet: {sheet_name} ---\n"
            text += df.to_csv(index=False) + "\n"
    return text

