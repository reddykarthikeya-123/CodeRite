from langchain_openai import ChatOpenAI
from langchain_community.chat_models import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import json
import os
import logging
import asyncio
import math
import tiktoken
from config.logging_config import get_logger

logger = get_logger(__name__)
DETERMINISTIC_PROFILE_VERSION = "det_profile_v4"


def _is_truthy_env(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _safe_float_env(name: str, default: float) -> float:
    raw = os.getenv(name, str(default))
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _safe_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _safe_csv_env(name: str, default: List[str]) -> List[str]:
    raw = os.getenv(name, "")
    if not raw.strip():
        return default
    values = [value.strip().lower() for value in raw.split(",")]
    return [value for value in values if value]

class ChecklistItem(BaseModel):
    section: str = Field(description="The section this item belongs to")
    item: str = Field(description="The checklist item being reviewed")
    status: str = Field(description="Status of the item: Pass, Fail, or Warning")
    comment: str = Field(description="Comment explaining the status")
    page_references: Optional[List[int]] = Field(default=[], description="List of page, slide, or sheet numbers where evidence was found. Empty if none.")

class SuggestionItem(BaseModel):
    type: str = Field(description="Type of suggestion: Fail or Warning")
    text: str = Field(description="The actionable recommendation")

class ReviewResponse(BaseModel):
    checklist: List[ChecklistItem] = Field(description="List of checklist items reviewed")
    suggestions: List[SuggestionItem] = Field(description="List of specific suggestions for improvement")
    rewritten_content: Optional[str] = Field(description="Optional rewritten content if applicable")

class CodeFileReview(BaseModel):
    filename: str = Field(description="The name of the file being reviewed")
    score: int = Field(description="Score from 0 to 100 representing code quality")
    highlights: List[str] = Field(description="List of positive aspects of the code")
    suggestions: List[str] = Field(description="List of actionable improvements. Must include line numbers.")

class CodeAnalysisResponse_Schema(BaseModel):
    overall_score: int = Field(description="Overall percentage score out of 100")
    files: List[CodeFileReview] = Field(description="Review details for each file")

class CodeAutoFixResponse(BaseModel):
    fixed_code: str = Field(description="The rewritten source code with suggestions applied")

class FixedCodeFile(BaseModel):
    filename: str = Field(description="The name of the fixed file")
    fixed_code: str = Field(description="The rewritten source code")

class CodeAutoFixBatchResponse(BaseModel):
    fixed_files: List[FixedCodeFile] = Field(description="List of fixed code files")

# Token counting helper function
def count_tokens(text: str, model: str = "gpt-4") -> int:
    """Count tokens in text using tiktoken."""
    try:
        enc = tiktoken.encoding_for_model(model)
        return len(enc.encode(text))
    except Exception:
        # Fallback for non-OpenAI models - estimate 4 chars per token
        return len(text) // 4

# Token-based chunking function
MAX_TOKENS = 6000  # Leave room for system prompt and response
CHECKLIST_BATCH_SIZE = max(1, _safe_int_env("LLM_CHECKLIST_BATCH_SIZE", 10))

def chunk_text(text: str, max_tokens: int = MAX_TOKENS) -> List[str]:
    """Split text into chunks based on token count."""
    if max_tokens <= 0:
        max_tokens = MAX_TOKENS

    words = text.split()
    if not words:
        return []

    overlap_words = max(0, _safe_int_env("LLM_CHUNK_OVERLAP_WORDS", 120))
    chunks = []
    start = 0

    while start < len(words):
        current = []
        end = start

        while end < len(words):
            current.append(words[end])
            if count_tokens(" ".join(current)) > max_tokens:
                if len(current) == 1:
                    end += 1
                    break
                current.pop()
                break
            end += 1

        if not current:
            current = [words[start]]
            end = start + 1

        chunks.append(" ".join(current))
        if end >= len(words):
            break

        next_start = max(end - overlap_words, start + 1)
        start = next_start

    return chunks

# Retry wrapper for LLM calls
async def call_with_retry(chain, messages, retries: int = 3):
    """Call LLM with exponential backoff retry logic."""
    delay = 2
    
    for attempt in range(retries):
        try:
            return await chain.ainvoke(messages)
        except Exception as e:
            logger.warning(f"LLM call failed (attempt {attempt + 1}/{retries}): {str(e)}")
            if attempt == retries - 1:
                logger.error(f"All {retries} retry attempts failed")
                return {"error": str(e), "checklist": [], "suggestions": []}
            await asyncio.sleep(delay)
            delay *= 2  # Exponential backoff
    
    return {"error": "Unexpected retry loop exit", "checklist": [], "suggestions": []}


async def invoke_with_retry_raising(chain, messages, retries: int = 3):
    """Call LLM with retries and re-raise the final exception."""
    delay = 2

    for attempt in range(retries):
        try:
            return await chain.ainvoke(messages)
        except Exception as exc:
            logger.warning(f"LLM call failed (attempt {attempt + 1}/{retries}): {str(exc)}")
            if attempt == retries - 1:
                logger.error(f"All {retries} retry attempts failed")
                raise
            await asyncio.sleep(delay)
            delay *= 2


def _looks_like_image_payload_error(exc: Exception) -> bool:
    message = str(exc).lower()
    indicators = [
        "image",
        "vision",
        "multimodal",
        "image_url",
        "unsupported content",
        "does not support",
        "payload too large",
        "request too large",
        "413",
        "content type",
    ]
    return any(indicator in message for indicator in indicators)

class AIEngine:
    """Engine for interacting with various AI providers (OpenAI, Ollama, Gemini)."""
    _ollama_seed_warning_logged = False
    _vision_disabled_warning_logged = False

    def __init__(self, provider: str = "ollama", model_name: str = "llama3", api_key: str = None):
        """Initializes the AI Engine with the specified provider and model.

        Args:
            provider: The AI provider to use ('openai', 'ollama', or 'gemini').
            model_name: The name of the model to use.
            api_key: The API key for the provider, if required.
        """
        self.provider = provider
        self.model_name = model_name
        self.api_key = api_key
        self.deterministic_mode = _is_truthy_env(os.getenv("LLM_DETERMINISTIC_MODE", "true"))
        self.profile_version = DETERMINISTIC_PROFILE_VERSION
        self.temperature = _safe_float_env("LLM_TEMPERATURE", 0.0)
        self.top_p = _safe_float_env("LLM_TOP_P", 1.0)
        self.seed = _safe_int_env("LLM_SEED", 42)
        self.top_k = _safe_int_env("LLM_TOP_K", 1)
        self.vision_mode = os.getenv("LLM_VISION_MODE", "auto").strip().lower()
        self.vision_allowlist = _safe_csv_env(
            "LLM_VISION_MODEL_ALLOWLIST",
            [
                "gpt-4o",
                "gpt-4.1",
                "gemini-1.5",
                "gemini-2.0",
                "gemini-2.5",
                "llava",
                "vision",
            ],
        )
        self.vision_blocklist = _safe_csv_env("LLM_VISION_MODEL_BLOCKLIST", [])
        self.vision_max_images_per_request = max(
            1,
            _safe_int_env("LLM_VISION_MAX_IMAGES_PER_REQUEST", 6)
        )
        self.llm = self._get_llm()
        self.parser = JsonOutputParser(pydantic_object=ReviewResponse)

    def _supports_vision(self) -> bool:
        """Resolve vision capability using explicit env config."""
        model_name = (self.model_name or "").lower()

        if any(fragment in model_name for fragment in self.vision_blocklist):
            return False

        if self.vision_mode == "on":
            return True
        if self.vision_mode == "off":
            return False

        return any(fragment in model_name for fragment in self.vision_allowlist)

    def _build_image_batches(self, images: List[str]) -> List[List[str]]:
        if not images:
            return []
        batch_size = max(1, self.vision_max_images_per_request)
        return [
            images[index:index + batch_size]
            for index in range(0, len(images), batch_size)
        ]

    def _select_shared_images(self, images: List[str]) -> List[str]:
        if not images:
            return []
        return images[:self.vision_max_images_per_request]

    def get_deterministic_profile_metadata(self) -> Dict[str, Any]:
        """Returns deterministic profile metadata used for cache fingerprinting and logging."""
        return {
            "version": self.profile_version,
            "deterministic_mode": self.deterministic_mode,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "seed": self.seed,
            "top_k": self.top_k if self.provider == "ollama" else None,
        }

    def _get_llm(self):
        """Internal method to instantiate the correct LangChain Chat Model.

        Returns:
            An instance of ChatOpenAI, ChatOllama, or ChatGoogleGenerativeAI.

        Raises:
            ValueError: If the provider is unsupported or required configuration is missing.
        """
        if self.provider == "openai":
            if not self.api_key:
                raise ValueError("OpenAI API Key is required")
            return ChatOpenAI(
                model=self.model_name,
                api_key=self.api_key,
                temperature=self.temperature,
                top_p=self.top_p,
                seed=self.seed,
                presence_penalty=0.0,
                frequency_penalty=0.0,
                n=1
            )
        elif self.provider == "ollama":
             # Assuming default Ollama URL
            ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            if self.deterministic_mode and not AIEngine._ollama_seed_warning_logged:
                logger.warning("Ollama wrapper does not expose seed; deterministic behavior is best-effort.")
                AIEngine._ollama_seed_warning_logged = True
            return ChatOllama(
                model=self.model_name,
                base_url=ollama_url,
                temperature=self.temperature,
                top_p=self.top_p,
                top_k=self.top_k,
            )
        elif self.provider == "gemini":
            if not self.api_key:
                raise ValueError("Google Gemini API Key is required")
            return ChatGoogleGenerativeAI(
                model=self.model_name,
                google_api_key=self.api_key,
                temperature=self.temperature,
                top_p=self.top_p,
                seed=self.seed,
                n=1,
            )
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    async def test_connection(self) -> bool:
        """Tests the connection to the AI provider.

        Returns:
            True if the connection is successful.

        Raises:
            Exception: If the connection fails.
        """
        try:
            # For a basic test, we just invoke a very simple prompt
            prompt = ChatPromptTemplate.from_messages([("user", "Hello")])
            chain = prompt | self.llm
            await chain.ainvoke({})
            return True
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            raise Exception(f"{str(e)}")

    def _generate_global_symbols_map(self, files: List[Dict[str, str]]) -> str:
        """Generates a summary of files and key symbols (classes, functions, namespaces)
        to provide global context for chunked analysis.
        """
        if not files:
            return ""

        import re
        summary_parts = ["GLOBAL CONTEXT (The following files and symbols exist across the entire document/archive):"]
        for f in files:
            fname = f.get("filename", "unknown")
            content = f.get("content", "")

            # XML Elements (common in .car files)
            xml_elements = re.findall(r'<([\w:-]+)', content[:5000])
            unique_xml = sorted(list(set(xml_elements)))[:10]

            # Code Classes & Functions
            classes = re.findall(r'class\s+([\w\d_]+)', content)
            funcs = re.findall(r'def\s+([\w\d_]+)', content)

            file_summary = f"- File: {fname}"
            if unique_xml:
                file_summary += f" [XML Elements: {', '.join(unique_xml)}]"
            if classes:
                file_summary += f" [Classes: {', '.join(classes[:5])}]"
            if funcs:
                file_summary += f" [Functions: {', '.join(funcs[:5])}]"

            summary_parts.append(file_summary)

        return "\n".join(summary_parts) + "\n\n"

    async def analyze_document(
        self,
        text: str,
        images: List[str] = None,
        custom_instructions: str = "",
        document_category: str = None,
        file_type: str = None,
        enabled_checks: List[str] = None,
        pagination_metadata: Optional[Dict[str, Any]] = None
    ) -> dict:
        """Analyzes a document using the AI model and a target checklist.

        Args:
            text: The text content of the document.
            images: A list of base64-encoded images (optional).
            custom_instructions: Additional instructions for the AI (optional).
            document_category: The category of the document for checklist lookup.
            file_type: The extension of the original file.
            enabled_checks: List of enabled check IDs (format: "index-checklist_text") to filter checklist items.
            pagination_metadata: Optional pagination capabilities from parser/upload step.

        Returns:
            A dictionary containing the review results.
        """
        from services.checklist_loader import loader
        images = images or []
        text = text or ""

        target_checklist = []
        if document_category:
            all_items = loader.get_checklist_for_category(document_category)
            
            # Filter checklist based on enabled_checks if provided
            if enabled_checks and len(enabled_checks) > 0:
                # Parse enabled check IDs to get indices
                enabled_indices = set()
                for check_id in enabled_checks:
                    try:
                        idx = int(check_id.split('-')[0])
                        enabled_indices.add(idx)
                    except (ValueError, IndexError):
                        continue
                
                # Filter items to only include enabled checks
                target_checklist = [
                    item for idx, item in enumerate(all_items)
                    if idx in enabled_indices
                ]
                logger.info(f"Filtered checklist from {len(all_items)} to {len(target_checklist)} items based on enabled_checks")
            else:
                target_checklist = all_items

        def build_checklist_context(checklist_subset: List[Dict[str, Any]]) -> str:
            if not checklist_subset:
                return ""
            return (
                f"\nOnly evaluate these {len(checklist_subset)} checklist items in this call.\n"
                "Target Checklist exactly to follow:\n"
                f"{json.dumps(checklist_subset, indent=2)}"
            )

        expected_checklist_entries: List[Dict[str, str]] = []
        expected_key_order: Dict[tuple[str, str], int] = {}
        for index, checklist_item in enumerate(target_checklist):
            section = str(
                checklist_item.get("Section")
                or checklist_item.get("section")
                or "General"
            )
            item_text = str(
                checklist_item.get("ChecklistItem")
                or checklist_item.get("checklist_item")
                or checklist_item.get("Unnamed: 1")
                or ""
            )
            if not item_text:
                continue
            expected_checklist_entries.append({
                "section": section,
                "item": item_text
            })
            expected_key_order[(section, item_text)] = index

        # Determine reference format based on file type
        reference_format = "Section"  # Default
        reference_enabled = True  # Whether to include location references at all

        pagination_enabled = False
        if pagination_metadata and isinstance(pagination_metadata, dict):
            pagination_enabled = bool(pagination_metadata.get("enabled", False))

        if file_type:
            file_type = file_type.lower().strip('.')

            # Text/code files: disable location references.
            if file_type in ["txt", "md", "py", "js", "ts", "json", "html", "css"]:
                reference_format = None
                reference_enabled = False
            elif file_type in ["docx", "doc"]:
                # DOCX references are only allowed when parser verified pagination.
                if pagination_enabled:
                    reference_format = "Page"
                    reference_enabled = True
                else:
                    reference_format = None
                    reference_enabled = False
            elif file_type in ["pdf", "pptx", "ppt"]:
                reference_format = "Page" if file_type in ["pdf"] else "Slide"
            elif file_type in ["xlsx", "xls", "csv"]:
                reference_format = "Sheet"  # Will be formatted as "Sheet: SheetName" in output

        is_car_analysis = bool("[CAR_METADATA]" in text and file_type == "car")

        # Extract total page count from document text for validation
        import re
        total_pages = 0
        if file_type and file_type.lower().strip('.') in ["pdf", "docx", "doc"] and reference_format == "Page":
            # Page-based files have page markers in the format "--- Page X Text ---", "--- Page X Tables ---", "--- Page X Visual Metadata ---", or "--- Page X OCR ---"
            page_matches = re.findall(r'--- Page (\d+) (?:Text|Tables|Visual Metadata|OCR)?', text)
            if page_matches:
                total_pages = max([int(p) for p in page_matches], default=0)
        elif file_type and file_type.lower().strip('.') in ["pptx", "ppt"]:
            slide_matches = re.findall(r'--- Slide (\d+) ---', text)
            if slide_matches:
                total_pages = max([int(s) for s in slide_matches], default=0)
        elif file_type and file_type.lower().strip('.') in ["xlsx", "xls", "csv"]:
            sheet_matches = re.findall(r'--- Excel Sheet: (.+?) ---', text)
            total_pages = len(sheet_matches)  # Count of sheets

        # Safety: if references are enabled but markers are missing, disable references
        # to prevent fabricated/incorrect location numbers.
        if reference_enabled and reference_format in ["Page", "Slide"] and total_pages == 0:
            logger.warning(
                f"Disabling {reference_format.lower()} references due to missing markers in parsed text."
            )
            reference_enabled = False
            reference_format = None

        if file_type in ["docx", "doc"]:
            pagination_provider = (
                pagination_metadata.get("provider")
                if isinstance(pagination_metadata, dict)
                else None
            )
            logger.info(
                "DOCX analysis reference configuration: "
                f"pagination_enabled={pagination_enabled}, "
                f"reference_enabled={reference_enabled}, "
                f"reference_format={reference_format}, "
                f"total_pages={total_pages}, "
                f"provider={pagination_provider}"
            )

        # Build conditional reference instructions based on file type
        if reference_enabled and reference_format:
            if reference_format == "Sheet":
                reference_instructions = f"""2. **Location References - Conditional Rules**:
   - **PASS and WARNING items**: ALWAYS include the sheet number/string in the `page_references` array.
   - **FAIL items**: Do NOT include any references in the `page_references` array. Leave it empty."""
            else:
                reference_instructions = f"""2. **Location References**:
   - **How to Find Page/Slide Numbers**: Look for markers like "--- Page X Text ---", "--- Page X OCR ---", or "--- Slide X ---".
   - **IMPORTANT**: This document has exactly **{total_pages} {reference_format}s** (numbered 1 to {total_pages}). All numbers in `page_references` MUST be between 1 and {total_pages}.
   - **PASS and WARNING items**: ALWAYS include the relevant {reference_format} numbers in the `page_references` JSON array. Do not embed them in the comment.
   - **FAIL items**: Leave the `page_references` array EMPTY []."""
        else:
            reference_instructions = """2. **Location References**: Do NOT include references. Leave the `page_references` array EMPTY []."""

        # Build global context map if CAR archive
        global_context_map = ""
        if is_car_analysis:
            import re as _re
            _car_file_pattern = r'\n--- File: (.+?) ---\n'
            _car_file_parts = _re.split(_car_file_pattern, text)
            _file_infos = []
            for _i in range(1, len(_car_file_parts), 2):
                if _i + 1 < len(_car_file_parts):
                    _file_infos.append({"filename": _car_file_parts[_i], "content": _car_file_parts[_i+1]})
            global_context_map = self._generate_global_symbols_map(_file_infos)

        segmentation_instructions = (
            f"""        - This input may be one segment of a multi-file or chunked document. If the current segment contains no relevant evidence for an item, use status exactly `Not Seen` for this segment instead of `Fail`.
        - Do not use `Fail` merely because the current segment does not mention something. Use `Fail` only when the current segment contains affirmative evidence that the requirement is missing, incorrect, placeholder-only, or contradicted.
        {global_context_map}"""
            if is_car_analysis else
            """        - The full document is provided in this call. Do not use status `Not Seen`.
        - Every checklist item in this call must resolve to `Pass`, `Warning`, `Fail`, or `Not Applicable` using the full document context."""
        )

        system_prompt = f"""You are an expert document auditor and reviewer.
        Your task is to review the provided document against standard best practices, any custom instructions, and strictly against the Target Checklist provided.
        You must evaluate *every single item* in the target checklist.

        CRITICAL INSTRUCTIONS FOR COMMENTS & SUGGESTIONS:

        1. **Suggestions Array**: For EVERY item marked "Fail" or "Warning", provide a specific, actionable recommendation in the "suggestions" array on how to fix it, indicating its type ("Fail" or "Warning"). Do not group them.

        {reference_instructions}

        3. **Evidence-First Decisioning**:
        - Do not mark any checklist item as "Pass" unless you can quote concrete evidence from the parsed content or provided images.
        - For every checklist comment, include this structure: `Evidence: <quoted snippet or 'None'> | Found: <what is present> | Missing: <what is missing or 'None'>`.
        - If evidence is weak or partial, use "Warning" instead of "Pass".
        - If no evidence is present, use "Fail".
        - Treat synonym labels as equivalent signals when evaluating evidence, including: `author`, `authors`, `document author`; `approver`, `approved by`; `revision history`, `change history`, `version history`; `version`, `document version`, `rev`.
        - A heading or label alone is never enough to pass a checklist item. Example: a heading like `Workflow Diagram`, `Process Flow`, `Architecture Diagram`, or `Screenshot` does NOT count as the artifact itself.
{segmentation_instructions}

        4. **Visual Artifact Rules**:
        - For checklist items that require process flows, diagrams, screenshots, wireframes, charts, or other visuals, require evidence of an actual visual artifact.
        - Acceptable evidence can come from attached page images, OCR text showing diagram labels inside a real visual, or parsed visual metadata markers such as `--- Page X Visual Metadata ---`.
        - If the page only contains prose, bullets, or a heading that mentions a diagram but no actual visual artifact is evident, mark "Fail" or "Warning", not "Pass".
        - Do not infer that a diagram exists purely because the section title suggests one should exist.

        5. **Multiple Requirements**: If a checklist item contains multiple requirements (e.g. "Benefits AND expected outcomes"), and the document only fulfills one of them (e.g. only benefits are found), you MUST mark the status as "Warning", explaining exactly which part is missing in the comment, and providing the location reference for the partial find (if applicable per rule 2).

        6. **Referenced Requirements Interpretation**:
        - "Referenced" can mean explicit textual traceability such as section IDs, requirement IDs, BRD references, "refer to" statements, links, or explicit mappings.
        - If only generic statements are present without traceability detail, mark as "Warning".

        7. **Parsed Marker Awareness**:
        - Parsed content may include markers such as `--- Page X Text ---`, `--- Page X Tables ---`, `--- Page X Visual Metadata ---`, `--- DOCX Table N ---`, `--- DOCX Header Section N ---`, `--- DOCX Core Properties ---`, and OCR markers.
        - Use these markers for evidence and references. Never invent references outside provided markers.

        You must output a JSON object with the following structure:
        {{
            "checklist": [
                {{"section": "<Section Name>", "item": "<Checklist Item>", "status": "<Pass/Fail/Warning>", "comment": "<Explanation>"}}
            ],
            "suggestions": [
                {{"type": "<Fail/Warning>", "text": "<Suggestion 1>"}}
            ],
            "rewritten_content": "<Optional: Rewritten sections or the entire document if requested>"
        }}

        Ensure the tone is professional and constructive.
        """
        supports_vision = self._supports_vision()
        dispatch_mode = "car_file_chunking" if is_car_analysis else "checklist_batching"
        analysis_tasks: List[Dict[str, Any]] = []
        image_batches: List[List[str]] = []

        if is_car_analysis:
            image_batches = self._build_image_batches(images) if supports_vision else []

            # Extract individual files from CAR archive
            import re
            car_match = re.search(r'\[CAR_METADATA\] total_size=(\d+), file_count=(\d+) \[/CAR_METADATA\]', text)
            if car_match:
                file_count = int(car_match.group(2))
                logger.info(f"Processing .car file with {file_count} embedded files")

            file_pattern = r'\n--- File: (.+?) ---\n'
            file_parts = re.split(file_pattern, text)

            for i in range(1, len(file_parts), 2):
                if i + 1 < len(file_parts):
                    filename = file_parts[i]
                    content = file_parts[i + 1]
                    file_chunks = chunk_text(content)
                    for chunk_index, chunk in enumerate(file_chunks):
                        analysis_tasks.append({
                            "mode": "car_chunk",
                            "filename": filename,
                            "content": chunk,
                            "checklist": target_checklist,
                            "scope_label": f"File segment {chunk_index + 1}/{len(file_chunks)}",
                        })
                    logger.info(f"Chunked file: {filename} into {len(file_chunks)} parts")

            if not analysis_tasks:
                analysis_tasks = [{
                    "mode": "car_chunk",
                    "filename": "document",
                    "content": "No extractable text was found. Use the available parsed metadata and images if present.",
                    "checklist": target_checklist,
                    "scope_label": "Fallback segment",
                }]

            if image_batches and len(image_batches) > len(analysis_tasks):
                original_tasks = list(analysis_tasks)
                cursor = 0
                while len(analysis_tasks) < len(image_batches):
                    template = original_tasks[cursor % len(original_tasks)]
                    analysis_tasks.append({
                        "mode": template["mode"],
                        "filename": template["filename"],
                        "content": template["content"],
                        "checklist": template["checklist"],
                        "scope_label": template["scope_label"],
                    })
                    cursor += 1

            task_image_batches: List[List[str]] = [[] for _ in analysis_tasks]
            if image_batches:
                for index, batch in enumerate(image_batches):
                    task_image_batches[index] = batch
        else:
            document_content = text or "No extractable text was found. Use the available parsed metadata and images if present."
            checklist_batches = [
                target_checklist[index:index + CHECKLIST_BATCH_SIZE]
                for index in range(0, len(target_checklist), CHECKLIST_BATCH_SIZE)
            ] if target_checklist else [[]]

            for batch_index, checklist_batch in enumerate(checklist_batches):
                analysis_tasks.append({
                    "mode": "checklist_batch",
                    "filename": "document",
                    "content": document_content,
                    "checklist": checklist_batch,
                    "scope_label": f"Checklist batch {batch_index + 1}/{len(checklist_batches)}",
                })

            shared_image_batch = self._select_shared_images(images) if supports_vision else []
            image_batches = [shared_image_batch] if shared_image_batch else []
            task_image_batches = [list(shared_image_batch) for _ in analysis_tasks]

        if images and not supports_vision and not AIEngine._vision_disabled_warning_logged:
            logger.warning(
                "Images were extracted but not sent to model because vision is disabled for "
                f"provider/model={self.provider}/{self.model_name}. "
                "Set LLM_VISION_MODE=on or update LLM_VISION_MODEL_ALLOWLIST."
            )
            AIEngine._vision_disabled_warning_logged = True

        image_chars_total = sum(len(image) for image in images)
        images_sent_total = sum(len(batch) for batch in task_image_batches)
        image_chars_sent = sum(len(image) for batch in task_image_batches for image in batch)
        logger.info(
            "Vision routing: "
            f"provider_model={self.provider}/{self.model_name} "
            f"dispatch_mode={dispatch_mode} "
            f"vision_mode={self.vision_mode} "
            f"vision_enabled={supports_vision} "
            f"images_received={len(images)} "
            f"image_chars_total={image_chars_total} "
            f"image_batches={len(image_batches)} "
            f"max_images_per_request={self.vision_max_images_per_request} "
            f"images_sent={images_sent_total} "
            f"image_chars_sent={image_chars_sent} "
            f"tasks={len(analysis_tasks)}"
        )
        logger.info(f"Total analysis tasks to process: {len(analysis_tasks)}")
        
        # Configurable concurrency
        default_concurrency = "1" if self.deterministic_mode else "5"
        MAX_CONCURRENCY = _safe_int_env("LLM_MAX_CONCURRENCY", int(default_concurrency))
        logger.info(
            "Deterministic profile: "
            f"provider={self.provider}/{self.model_name}, "
            f"deterministic_mode={self.deterministic_mode}, "
            f"temperature={self.temperature}, top_p={self.top_p}, "
            f"seed={self.seed}, max_concurrency={MAX_CONCURRENCY}, "
            f"profile_version={self.profile_version}"
        )
        logger.info(f"Using concurrency limit: {MAX_CONCURRENCY}")

        async def process_batch(task_index, task_data, image_batch, semaphore):
            async with semaphore:
                logger.info(
                    f"Processing task {task_index + 1}/{len(analysis_tasks)}: {task_data['filename']} "
                    f"mode={task_data['mode']} "
                    f"scope={task_data['scope_label']} "
                    f"(image_batch_size={len(image_batch)})"
                )

                batch_checklist_context = build_checklist_context(task_data.get("checklist", []))
                system_msg_content = (
                    f"{system_prompt}\n{batch_checklist_context}"
                    if batch_checklist_context else system_prompt
                )

                content_heading = (
                    f"Document Content Segment {task_index + 1}:"
                    if task_data["mode"] == "car_chunk"
                    else "Full Document Content:"
                )
                user_content = f"""File: {task_data['filename']}
Scope: {task_data['scope_label']}

Custom Instructions: {custom_instructions}

{content_heading}
{task_data['content']}"""

                chain = self.llm | self.parser
                text_only_messages = [
                    SystemMessage(content=system_msg_content),
                    HumanMessage(content=user_content)
                ]

                if image_batch and supports_vision:
                    user_content_obj = [{"type": "text", "text": user_content}]
                    for img_b64 in image_batch:
                        user_content_obj.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
                        })
                    vision_messages = [
                        SystemMessage(content=system_msg_content),
                        HumanMessage(content=user_content_obj)
                    ]

                    try:
                        return await invoke_with_retry_raising(chain, vision_messages)
                    except Exception as exc:
                        if _looks_like_image_payload_error(exc):
                            logger.warning(
                                "Vision payload rejected; retrying task without images. "
                                f"provider_model={self.provider}/{self.model_name} "
                                f"task={task_index + 1} "
                                f"image_batch_size={len(image_batch)} "
                                f"error={str(exc)}"
                            )
                            return await call_with_retry(chain, text_only_messages)
                        raise

                return await call_with_retry(chain, text_only_messages)

        try:
            semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
            tasks = [
                process_batch(i, task_data, task_image_batches[i], semaphore)
                for i, task_data in enumerate(analysis_tasks)
            ]
            results = await asyncio.gather(*tasks)
            
            def normalize_review_status(raw_status: Any) -> str:
                status = str(raw_status or "").strip().lower()
                if not status:
                    return "not_seen"
                if "not applicable" in status or status in {"n/a", "na"}:
                    return "na"
                if "not seen" in status:
                    return "not_seen"
                if "warning" in status:
                    return "warning"
                if "fail" in status:
                    return "fail"
                if "pass" in status:
                    return "pass"
                return "not_seen"

            def format_review_status(normalized_status: str) -> str:
                if normalized_status == "pass":
                    return "Pass"
                if normalized_status == "warning":
                    return "Warning"
                if normalized_status == "fail":
                    return "Fail"
                if normalized_status == "na":
                    return "Not Applicable"
                return "Not Seen"

            def append_unique_comment(target: List[str], value: Any) -> None:
                comment = str(value or "").strip()
                if comment and comment not in target:
                    target.append(comment)

            def checklist_sort_key(item: Dict[str, Any]) -> tuple[int, int, str, str]:
                key = (str(item.get("section", "")), str(item.get("item", "")))
                expected_index = expected_key_order.get(key)
                if expected_index is not None:
                    return (0, expected_index, key[0], key[1])
                return (1, math.inf, key[0], key[1])

            checklist_items: List[Dict[str, Any]] = []
            if is_car_analysis:
                def finalize_document_status(statuses: List[str]) -> str:
                    meaningful_statuses = {status for status in statuses if status not in {"not_seen", "na"}}
                    if "pass" in meaningful_statuses:
                        if meaningful_statuses == {"pass"}:
                            return "pass"
                        return "warning"
                    if "warning" in meaningful_statuses:
                        return "warning"
                    if "fail" in meaningful_statuses:
                        return "fail"
                    if "na" in statuses:
                        return "na"
                    return "fail"

                def build_merged_comment(final_status: str, comments_by_status: Dict[str, List[str]]) -> str:
                    combined_comments: List[str] = []

                    if final_status == "pass":
                        status_order = ["pass", "warning", "fail"]
                    elif final_status == "warning":
                        status_order = ["warning", "fail", "pass"]
                    elif final_status == "fail":
                        status_order = ["fail", "warning", "pass"]
                    else:
                        status_order = ["na", "pass", "warning", "fail"]

                    for status_name in status_order:
                        for comment in comments_by_status.get(status_name, []):
                            append_unique_comment(combined_comments, comment)

                    if (
                        final_status == "warning"
                        and comments_by_status.get("pass")
                        and (comments_by_status.get("warning") or comments_by_status.get("fail"))
                    ):
                        combined_comments.insert(
                            0,
                            "Conflicting chunk-level findings were returned. Evidence was found in at least one chunk, but other chunks raised concerns."
                        )

                    if combined_comments:
                        return "\n".join(combined_comments)
                    if final_status == "fail":
                        return "No supporting evidence was found anywhere in the analyzed document."
                    if final_status == "warning":
                        return "Evidence is partial or conflicting across the analyzed document."
                    if final_status == "na":
                        return "This item appears not applicable to the analyzed document."
                    return "Supporting evidence was found in the analyzed document."

                merged_checklist: Dict[tuple[str, str], Dict[str, Any]] = {}
                merged_item_state: Dict[tuple[str, str], Dict[str, Any]] = {}

                def ensure_item_bucket(
                    section: str,
                    item_text: str,
                    template: Optional[Dict[str, Any]] = None,
                ) -> tuple[str, str]:
                    key = (section, item_text)
                    if key not in merged_checklist:
                        base_item = dict(template) if template else {}
                        base_item["section"] = section
                        base_item["item"] = item_text
                        merged_checklist[key] = base_item
                        merged_item_state[key] = {
                            "statuses": [],
                            "comments_by_status": {
                                "pass": [],
                                "warning": [],
                                "fail": [],
                                "na": [],
                                "not_seen": [],
                            },
                        }
                    return key

                for expected_item in expected_checklist_entries:
                    ensure_item_bucket(expected_item["section"], expected_item["item"])

                for res in results:
                    for item in res.get("checklist", []):
                        section = str(item.get("section") or "General").strip()
                        item_text = str(item.get("item") or "").strip()
                        if not item_text:
                            continue

                        key = ensure_item_bucket(section, item_text, item)
                        normalized_status = normalize_review_status(item.get("status"))
                        merged_item_state[key]["statuses"].append(normalized_status)
                        append_unique_comment(
                            merged_item_state[key]["comments_by_status"][normalized_status],
                            item.get("comment", ""),
                        )

                for key, merged_item in merged_checklist.items():
                    state = merged_item_state.get(key, {
                        "statuses": [],
                        "comments_by_status": {"pass": [], "warning": [], "fail": [], "na": [], "not_seen": []},
                    })
                    final_status = finalize_document_status(state["statuses"])
                    merged_item["status"] = format_review_status(final_status)
                    merged_item["comment"] = build_merged_comment(final_status, state["comments_by_status"])
                    checklist_items.append(merged_item)
            else:
                checklist_items_map: Dict[tuple[str, str], Dict[str, Any]] = {}

                for res in results:
                    for item in res.get("checklist", []):
                        section = str(item.get("section") or "General").strip()
                        item_text = str(item.get("item") or "").strip()
                        if not item_text:
                            continue

                        normalized_status = normalize_review_status(item.get("status"))
                        item_copy = dict(item)
                        item_copy["section"] = section
                        item_copy["item"] = item_text

                        if normalized_status == "not_seen":
                            item_copy["status"] = "Fail"
                            item_copy["comment"] = (
                                str(item_copy.get("comment") or "").strip()
                                or "No supporting evidence was found anywhere in the analyzed document."
                            )
                        else:
                            item_copy["status"] = format_review_status(normalized_status)
                        checklist_items_map[(section, item_text)] = item_copy

                for expected_item in expected_checklist_entries:
                    key = (expected_item["section"], expected_item["item"])
                    if key not in checklist_items_map:
                        checklist_items_map[key] = {
                            "section": expected_item["section"],
                            "item": expected_item["item"],
                            "status": "Fail",
                            "comment": "No result was returned for this checklist item.",
                        }

                checklist_items = list(checklist_items_map.values())

            checklist_items.sort(key=checklist_sort_key)

            merged_suggestions_map: Dict[tuple[str, str], Dict[str, str]] = {}
            for item in checklist_items:
                normalized_status = normalize_review_status(item.get("status"))
                if normalized_status not in {"warning", "fail"}:
                    continue
                suggestion_text = str(item.get("comment") or "").strip()
                item_text = str(item.get("item") or "").strip()
                if not suggestion_text:
                    suggestion_text = f"Review '{item_text}' and add explicit supporting evidence in the document."
                elif item_text and item_text.lower() not in suggestion_text.lower():
                    suggestion_text = f"{item_text}: {suggestion_text}"
                suggestion = {
                    "type": format_review_status(normalized_status),
                    "text": suggestion_text,
                }
                merged_suggestions_map[(suggestion["type"], suggestion["text"])] = suggestion

            merged_suggestions = list(merged_suggestions_map.values())
            merged_suggestions.sort(key=lambda suggestion: (suggestion["type"], suggestion["text"]))

            final_response = {
                "checklist": checklist_items,
                "suggestions": merged_suggestions,
                "rewritten_content": results[0].get("rewritten_content", "") if results else ""
            }

            # Validate and correct page numbers in AI response
            final_response = self._validate_page_numbers(final_response, total_pages, reference_format)

            # Programmatic Scoring Logic
            valid_items = 0
            score = 0

            for item in final_response.get("checklist", []):
                status = str(item.get("status", "")).lower()
                if "not applicable" in status or "n/a" in status or "not seen" in status:
                    continue # Skip these entirely from the calculation

                valid_items += 1
                if "pass" in status:
                    score += 1.0
                elif "warning" in status:
                    score += 0.5
                # fail gets 0

            if valid_items == 0:
                final_response["score"] = 0
            else:
                final_score = int((score / valid_items) * 100)
                final_response["score"] = final_score
            return final_response
        except Exception as e:
            # Fallback or error handling
            logger.error(f"AI Error: {e}")
            return {
                "score": 0,
                "checklist": [{"section": "General", "item": "AI Analysis", "status": "Fail", "comment": f"Error: {str(e)}"}],
                "suggestions": [{"type": "Fail", "text": "Check configuration and try again."}],
                "rewritten_content": ""
            }

    def _validate_page_numbers(self, response: dict, total_pages: int, reference_format: str) -> dict:
        """Validate and correct page numbers in AI response.
        
        Args:
            response: The AI response dictionary
            total_pages: Total number of pages in the document
            reference_format: The reference format (Page, Slide, etc.)
            
        Returns:
            The response with corrected page references
        """
        if not total_pages or not reference_format or reference_format == "Sheet":
            return response
            
        import re
        
        for item in response.get("checklist", []):
            page_refs = item.get("page_references", [])
            if not isinstance(page_refs, list):
                if isinstance(page_refs, (int, str)):
                    # Attempt to standardize scalar values
                    try:
                        page_refs = [int(page_refs)]
                    except Exception:
                        page_refs = []
                else:
                    page_refs = []

            valid_refs = []
            for ref in page_refs:
                try:
                    page_num = int(ref)
                    if 1 <= page_num <= total_pages:
                        valid_refs.append(page_num)
                    else:
                        logger.warning(f"Removed invalid {reference_format.lower()} reference: {page_num} (document has {total_pages} {reference_format}s)")
                except Exception:
                    pass
            
            # De-duplicate and assign back
            item["page_references"] = list(set(valid_refs))
            
        return response

    async def analyze_code(self, files: List[dict]) -> dict:
        """Performs a comprehensive code review on a list of files.

        Args:
            files: A list of dictionaries, each containing 'filename' and 'content'.

        Returns:
            A dictionary containing the overall score and individual file reviews.
        """
        system_prompt = """You are a Principal Software Engineer and an expert Code Reviewer.
        Your task is to analyze the provided source code files for formatting correctness, modularity, error handling, performance issues, and language-specific best practices.

        CRITICAL INSTRUCTIONS:
        1. Evaluate EVERY file provided in the input.
        2. Assign a score from 0 to 100 for each file based on its overall quality.
        3. Provide an array of `highlights` detailing what the code already does well (e.g., "Good use of pure functions", "Excellent error handling").
        4. Provide an array of specific, actionable `suggestions` for improvement for each file. EVERY suggestion MUST explicitly start with the relevant line number or range it applies to, using the exact line numbers provided in the input prompt (e.g., "Line 42: Extract repetitive database query..."). If a suggestion applies globally, start with "Global:".
        5. If a file is perfect, provide an empty array for `suggestions` and give it a score of 100.
        6. Calculate the `overall_score` as the strict integer average of all the individual file scores.

        You must output a JSON object with the following exact structure:
        {{
            "overall_score": 85,
            "files": [
                {{
                    "filename": "example.py",
                    "score": 80,
                    "highlights": [
                        "Clean and consistent variable naming.",
                        "Good modular separation of concerns."
                    ],
                    "suggestions": [
                        "Line 12: Use parameterized queries instead of string concatenation to prevent SQL injection.",
                        "Lines 45-50: Extract the validation logic into a separate modular function.",
                        "Global: Add file-level docstrings explaining the module's purpose."
                    ]
                }}
            ]
        }}
        """
        
        # Batching files to prevent exceeding context limits
        MAX_CHUNK_SIZE = 150000
        batches = []
        current_batch = []
        current_batch_size = 0
        
        for f in files:
            content_with_lines = "\n".join(f"{i+1} | {line}" for i, line in enumerate(f['content'].split('\n')))
            file_str = f"=== BEGIN FILE: {f['filename']} ===\n{content_with_lines}\n=== END FILE: {f['filename']} ===\n\n"
            
            if current_batch_size + len(file_str) > MAX_CHUNK_SIZE and current_batch:
                batches.append(current_batch)
                current_batch = [file_str]
                current_batch_size = len(file_str)
            else:
                current_batch.append(file_str)
                current_batch_size += len(file_str)
                
        if current_batch:
            batches.append(current_batch)
            
        async def process_batch(batch_files, semaphore):
            async with semaphore:
                user_content = "Please review the following code files. Note that each line of code is prefixed with its line number (format: 'line_number | code'):\n\n"
                user_content += "".join(batch_files)
                
                messages = [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_content)
                ]
                
                code_parser = JsonOutputParser(pydantic_object=CodeAnalysisResponse_Schema)
                chain = self.llm | code_parser
                
                try:
                    return await chain.ainvoke(messages)
                except Exception as e:
                    logger.error(f"Error processing code batch: {e}")
                    return {"files": [], "error": str(e)}

        try:
            semaphore = asyncio.Semaphore(3)
            tasks = [process_batch(b, semaphore) for b in batches]
            results = await asyncio.gather(*tasks)
            
            merged_files = []
            for res in results:
                if "files" in res:
                    merged_files.extend(res["files"])
            
            response = {"files": merged_files}
            
            # Ensure the overall score calculation is accurate even if the LLM hallucinates the math slightly
            file_scores = [f.get("score", 0) for f in response.get("files", [])]
            if len(file_scores) > 0:
                calculated_average = int(sum(file_scores) / len(file_scores))
                response["overall_score"] = calculated_average
            else:
                response["overall_score"] = 0
                
            return response
        except Exception as e:
            logger.error(f"AI Code Analysis Error: {e}")
            return {
                "overall_score": 0,
                "files": [
                    {
                        "filename": "System Error",
                        "score": 0,
                        "highlights": [],
                        "suggestions": [f"Code analysis failed due to system error: {str(e)}", "Please check your AI connection configuration."]
                    }
                ]
            }

    async def auto_fix_code(self, filename: str, content: str, selected_suggestions: List[str]) -> dict:
        """Applies selected suggestions to a code file.

        Args:
            filename: The name of the file to fix.
            content: The original source code.
            selected_suggestions: A list of strings describing the improvements to apply.

        Returns:
            A dictionary containing the fixed_code.
        """
        system_prompt = """You are an expert Principal Software Engineer. 
        Your task is to take a given piece of source code and rewrite it by applying ONLY the specific improvements requested by the user. Do not make unrelated stylistic changes or restructure code unless it is explicitly part of the selected suggestions.
        
        CRITICAL INSTRUCTIONS:
        1. Apply the user's selected suggestions accurately and completely to the source code.
        2. Verify that the updated code remains valid and runnable in its respective language.
        3. Do NOT include markdown code blocks (like ```python) surrounding the code string in your JSON response. The `fixed_code` value should strictly be raw code.
        4. PRESERVE ALL ORIGINAL FORMATTING: You must strictly maintain the original indentation, whitespace, blank lines, and empty spaces. Do not auto-format, align, or restructure any code that is outside the scope of the requested suggestions.

        You must output a JSON object with the following exact structure:
        {{
            "fixed_code": "<the complete rewritten source code>"
        }}
        """
        
        formatted_suggestions = "\n".join([f"- {s}" for s in selected_suggestions])
        
        user_content = f"""
        Filename: {filename}
        
        Selected Suggestions to Apply:
        {formatted_suggestions}
        
        Original Source Code:
        {content}
        """
        
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_content)
        ]
        
        fix_parser = JsonOutputParser(pydantic_object=CodeAutoFixResponse)
        chain = self.llm | fix_parser
        
        try:
            response = await chain.ainvoke(messages)
            return response
        except Exception as e:
            logger.error(f"AI Auto-Fix Error: {e}")
            return {
                "fixed_code": f"// Error generating fixed code: {str(e)}\n\n" + content
            }

    async def auto_fix_code_batch(self, files: List[dict]) -> dict:
        """Applies improvements to multiple code files in a single batch.

        Args:
            files: A list of dictionaries with 'filename', 'content', and 'selected_suggestions'.

        Returns:
            A dictionary containing a list of fixed files.
        """
        system_prompt = """You are an expert Principal Software Engineer.
        Your task is to take multiple source code files and rewrite them by applying ONLY the specific improvements requested per file. Do not make unrelated stylistic changes or restructure code unless it is explicitly part of the selected suggestions.
        
        CRITICAL INSTRUCTIONS:
        1. Apply the user's selected suggestions accurately and completely to the source code for each file.
        2. Verify that the updated code remains valid and runnable.
        3. Do NOT include markdown code blocks (like ```python) surrounding the code strings in your JSON response. The `fixed_code` values should strictly be raw code.
        4. PRESERVE ALL ORIGINAL FORMATTING: You must strictly maintain the original indentation, whitespace, blank lines, and empty spaces for each file. Do not auto-format, align, or restructure any code that is outside the scope of the requested suggestions.

        You must output a JSON object with the following exact structure:
        {
            "fixed_files": [
                {
                    "filename": "<original filename>",
                    "fixed_code": "<the complete rewritten source code>"
                }
            ]
        }
        """
        
        file_payloads = []
        for f in files:
            formatted_suggestions = "\n".join([f"- {s}" for s in f.get('selected_suggestions', [])])
            file_str = f"""
            Filename: {f['filename']}
            
            Selected Suggestions to Apply:
            {formatted_suggestions}
            
            Original Source Code:
            {f['content']}
            """
            file_payloads.append(file_str)
            
        user_content = "\n\n---\n\n".join(file_payloads)
        
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_content)
        ]
        
        fix_parser = JsonOutputParser(pydantic_object=CodeAutoFixBatchResponse)
        chain = self.llm | fix_parser
        
        try:
            response = await chain.ainvoke(messages)
            return response
        except Exception as e:
            logger.error(f"AI Batch Auto-Fix Error: {e}")
            return {
                "fixed_files": [
                    {
                        "filename": f["filename"],
                        "fixed_code": f"// Error generating fixed code: {str(e)}\n\n" + f["content"]
                    } for f in files
                ]
            }
