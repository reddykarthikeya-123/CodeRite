"""Module for parsing various file formats and extracting text and images.

Supports PDF, DOCX, PPTX, Excel, and plain text files. Uses OCR for images
embedded in documents when necessary.
"""
from fastapi import UploadFile, HTTPException
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
import re
import asyncio
import shutil
import tempfile
import subprocess
import platform
import time
from pathlib import Path
from typing import Tuple, List, Dict, Any
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
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".txt", ".md", ".py", ".js", ".ts", ".json", ".html", ".css", ".xlsx", ".xls", ".csv", ".car"}

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
    "text/csv",
    "application/zip",
    "application/octet-stream",
    "application/x-zip-compressed"
}


def _is_truthy_env(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _docx_pagination_required() -> bool:
    return _is_truthy_env(os.getenv("DOCX_PAGINATION_REQUIRED", "false"))


def _default_pagination_metadata() -> Dict[str, Any]:
    return {
        "enabled": False,
        "format": None,
        "total_pages": None,
        "provider": "none",
        "warning": None
    }


def _build_pagination_metadata(
    enabled: bool,
    page_format: str | None,
    total_pages: int | None,
    provider: str,
    warning: str | None = None
) -> Dict[str, Any]:
    return {
        "enabled": enabled,
        "format": page_format,
        "total_pages": total_pages,
        "provider": provider,
        "warning": warning
    }


def _extract_total_pages(text: str) -> int:
    matches = re.findall(r'--- Page (\d+) (?:Text|Tables) ---', text)
    if not matches:
        return 0
    return max(int(page) for page in matches)


def _resolve_soffice_path() -> str:
    configured_path = os.getenv("SOFFICE_PATH", "").strip()
    if configured_path:
        if os.path.exists(configured_path):
            return configured_path
        raise RuntimeError(f"SOFFICE_PATH is set but not found: {configured_path}")

    discovered_path = shutil.which("soffice")
    if discovered_path:
        return discovered_path

    if platform.system() == "Windows":
        candidate_paths = [
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        ]
        for candidate in candidate_paths:
            if os.path.exists(candidate):
                return candidate

    raise RuntimeError(
        "LibreOffice 'soffice' binary not found. Install LibreOffice and set SOFFICE_PATH if needed."
    )


async def _convert_docx_to_pdf_with_libreoffice(content: bytes) -> bytes:
    """Converts DOCX bytes to PDF bytes using headless LibreOffice."""
    soffice_path = _resolve_soffice_path()
    timeout_sec = int(os.getenv("DOCX_CONVERT_TIMEOUT_SEC", "90"))
    start_time = time.perf_counter()
    logger.info(
        f"DOCX->PDF conversion started via LibreOffice. soffice='{soffice_path}', timeout={timeout_sec}s"
    )

    with tempfile.TemporaryDirectory(prefix="docx_convert_") as tmpdir:
        input_path = os.path.join(tmpdir, "input.docx")
        output_dir = os.path.join(tmpdir, "out")
        profile_dir = os.path.join(tmpdir, "profile")

        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(profile_dir, exist_ok=True)

        with open(input_path, "wb") as f:
            f.write(content)

        # Isolate LO profile per request to avoid lock/contention issues.
        profile_uri = Path(profile_dir).resolve().as_uri()
        command = [
            soffice_path,
            "--headless",
            "--nologo",
            "--nodefault",
            "--nolockcheck",
            "--norestore",
            f"-env:UserInstallation={profile_uri}",
            "--convert-to",
            "pdf:writer_pdf_Export",
            "--outdir",
            output_dir,
            input_path,
        ]

        completed = await asyncio.to_thread(
            subprocess.run,
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout_sec,
        )

        if completed.returncode != 0:
            stderr = (completed.stderr or completed.stdout or "Unknown conversion error").strip()
            logger.error(f"DOCX->PDF conversion failed. LibreOffice stderr/stdout: {stderr}")
            raise RuntimeError(f"LibreOffice conversion failed with code {completed.returncode}: {stderr}")

        output_pdf_path = os.path.join(output_dir, "input.pdf")
        if not os.path.exists(output_pdf_path):
            stderr = (completed.stderr or completed.stdout or "No output PDF generated").strip()
            logger.error(f"DOCX->PDF conversion produced no output PDF. LibreOffice stderr/stdout: {stderr}")
            raise RuntimeError(f"LibreOffice conversion produced no PDF output: {stderr}")

        with open(output_pdf_path, "rb") as pdf_file:
            pdf_bytes = pdf_file.read()

        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        logger.info(
            f"DOCX->PDF conversion succeeded via LibreOffice in {elapsed_ms}ms. "
            f"output_size={len(pdf_bytes)} bytes"
        )
        return pdf_bytes

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

    # 4. MIME type validation using python-magic (MANDATORY for security)
    if not MAGIC_AVAILABLE:
        logger.error("python-magic is not available. This is a security requirement.")
        raise HTTPException(
            status_code=500,
            detail="Server configuration error: MIME validation unavailable. Please contact support."
        )
    
    mime_type = magic.from_buffer(content, mime=True)
    
    # Validate MIME type matches expected types
    if mime_type not in ALLOWED_MIME_TYPES:
        # Allow text/plain for code files
        if not (ext in [".py", ".js", ".ts", ".json", ".html", ".css", ".md", ".txt"] and mime_type.startswith("text/")):
            logger.warning(f"MIME type mismatch for '{filename}': detected '{mime_type}', expected one of {ALLOWED_MIME_TYPES}")
            raise HTTPException(
                status_code=400,
                detail=f"File type mismatch. The uploaded file appears to be a {mime_type}, not a valid {ext} file."
            )
    
    # 5. Additional content validation for PDFs
    if filename.endswith(".pdf"):
        if not content.startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail="Invalid PDF file signature detected.")

    # Reset file pointer or use content directly for parsing
    # Since we already read it into 'content', we'll modify parsers to accept bytes or use io.BytesIO

    images = []
    text_content = ""
    pagination_metadata = _default_pagination_metadata()

    try:
        if filename.endswith(".pdf"):
            text_content, images = await _parse_pdf_from_bytes(content)
            total_pages = _extract_total_pages(text_content)
            pagination_metadata = _build_pagination_metadata(
                enabled=total_pages > 0,
                page_format="Page" if total_pages > 0 else None,
                total_pages=total_pages if total_pages > 0 else None,
                provider="native_pdf",
                warning=None
            )
        elif filename.endswith(".docx"):
            text_content, images, pagination_metadata = await _parse_docx_from_bytes(content)
            logger.info(
                "DOCX parse completed. "
                f"pagination_enabled={pagination_metadata.get('enabled')} "
                f"provider={pagination_metadata.get('provider')} "
                f"total_pages={pagination_metadata.get('total_pages')} "
                f"warning={pagination_metadata.get('warning')}"
            )
        elif filename.endswith(".pptx"):
            text_content, images = await _parse_pptx_from_bytes(content)
        elif filename.endswith((".txt", ".md", ".py", ".js", ".ts", ".json", ".html", ".css")):
            text_content = content.decode("utf-8")
            images = []
        elif filename.endswith((".xlsx", ".xls", ".csv")):
            text_content = await _parse_excel_from_bytes(content, filename)
            images = []
        elif filename.endswith(".car"):
            # Returns structured data for better chunking
            parsed_data = await _parse_car_from_bytes(content)
            # Convert to text format for backward compatibility
            text_parts = []
            for file_info in parsed_data["files"]:
                text_parts.append(f"\n--- File: {file_info['filename']} ---\n{file_info['content']}")
            text_content = "\n".join(text_parts)
            images = parsed_data["images"]
            # Store structured data for AI engine to use
            text_content = f"{text_content}\n\n[CAR_METADATA] total_size={parsed_data['total_size']}, file_count={parsed_data['file_count']} [/CAR_METADATA]"

        return {"text": text_content, "images": images, "pagination_metadata": pagination_metadata}
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
    import asyncio
    
    text = ""
    base64_images = []

    try:
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

        # Process images with OCR in non-blocking manner
        images = convert_from_bytes(content)
        for i, img in enumerate(images):
            buffered = io.BytesIO()
            img.save(buffered, format="JPEG")
            img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
            base64_images.append(img_b64)

            # Run blocking OCR in thread pool to avoid blocking event loop
            if len(text.strip()) < 100 * len(images):
                ocr_text = await asyncio.to_thread(pytesseract.image_to_string, img)
                text += f"\n--- OCR Page {i+1} ---\n" + ocr_text + "\n"
    except Exception as e:
        logger.warning(f"OCR/Vision warning on PDF: {e}")

    return text, base64_images


async def _parse_docx_from_bytes(content: bytes) -> Tuple[str, List[str], Dict[str, Any]]:
    """Extracts text and images from a DOCX provided as bytes.

    Args:
        content: The raw DOCX file content.

    Returns:
        A tuple of (extracted_text, list_of_base64_images, pagination_metadata).
    """
    conversion_error: str | None = None

    # Preferred path: convert DOCX to PDF and reuse PDF parser for page-accurate markers.
    logger.info("DOCX pagination: attempting LibreOffice conversion for page-accurate references.")
    try:
        converted_pdf_bytes = await _convert_docx_to_pdf_with_libreoffice(content)
        text, base64_images = await _parse_pdf_from_bytes(converted_pdf_bytes)
        total_pages = _extract_total_pages(text)
        if total_pages <= 0:
            conversion_error = "Converted PDF did not contain usable page markers."
            raise RuntimeError(conversion_error)

        pagination_metadata = _build_pagination_metadata(
            enabled=True,
            page_format="Page",
            total_pages=total_pages,
            provider="libreoffice_pdf",
            warning=None,
        )
        logger.info(
            f"DOCX pagination enabled via LibreOffice PDF conversion. total_pages={total_pages}, "
            f"images_extracted={len(base64_images)}"
        )
        return text, base64_images, pagination_metadata
    except Exception as conversion_exception:
        conversion_error = str(conversion_exception)
        logger.warning(f"DOCX pagination conversion failed. Falling back to text extraction: {conversion_error}")
        if _docx_pagination_required():
            raise RuntimeError(
                f"DOCX pagination is required but DOCX->PDF conversion failed: {conversion_error}"
            ) from conversion_exception

    # Fallback path: extract text directly without page references.
    doc = Document(io.BytesIO(content))
    text = ""
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

                ocr_text = await asyncio.to_thread(pytesseract.image_to_string, img)
                if ocr_text.strip():
                    text += f"\n--- Embedded Image OCR ---\n{ocr_text}\n"
    except Exception as e:
        logger.warning(f"OCR/Vision warning on Docx: {e}")

    warning = (
        "Page references disabled for this file because Word-to-PDF pagination failed."
        if conversion_error else
        "Page references disabled for this file."
    )
    pagination_metadata = _build_pagination_metadata(
        enabled=False,
        page_format=None,
        total_pages=None,
        provider="none",
        warning=warning
    )
    logger.info(
        "DOCX pagination disabled; using fallback text extraction without page references. "
        f"fallback_images_extracted={len(base64_images)}"
    )
    return text, base64_images, pagination_metadata


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

import zipfile
async def _parse_car_from_bytes(content: bytes) -> dict:
    """Recursively extract XML, XSL, WSDL, and properties from .car and .iar archives.
    
    Returns structured data with individual files preserved for better chunking.
    """
    files = []
    images = []
    total_size = 0

    def process_zip_content(zip_bytes, prefix=""):
        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
                for info in z.infolist():
                    if info.is_dir():
                        continue
                    filename = info.filename.lower()

                    if filename.endswith(('.xml', '.xsl', '.wsdl', '.properties', '.jpr', '.jca', '.xqy')):
                        file_data = z.read(info.filename)
                        try:
                            decoded = file_data.decode('utf-8')
                        except UnicodeDecodeError:
                            decoded = file_data.decode('latin-1', errors='ignore')

                        # Store each file separately with its path
                        files.append({
                            "filename": f"{prefix}{info.filename}",
                            "content": decoded
                        })
                        total_size += len(decoded)

                    elif filename.endswith('.iar'):
                        file_data = z.read(info.filename)
                        process_zip_content(file_data, prefix + info.filename + " -> ")

        except Exception as e:
            logger.error(f"Error extracting archive: {str(e)}")
            files.append({
                "filename": "ERROR",
                "content": f"[Error extracting archive: {str(e)}]"
            })

    process_zip_content(content)
    
    # Add metadata
    return {
        "files": files,
        "total_size": total_size,
        "file_count": len(files),
        "images": images
    }
