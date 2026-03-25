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
import tiktoken
from config.logging_config import get_logger

logger = get_logger(__name__)

class ChecklistItem(BaseModel):
    section: str = Field(description="The section this item belongs to")
    item: str = Field(description="The checklist item being reviewed")
    status: str = Field(description="Status of the item: Pass, Fail, or Warning")
    comment: str = Field(description="Comment explaining the status")

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

def chunk_text(text: str) -> List[str]:
    """Split text into chunks based on token count."""
    words = text.split()
    chunks = []
    current = []
    
    for word in words:
        current.append(word)
        if count_tokens(" ".join(current)) > MAX_TOKENS:
            chunks.append(" ".join(current[:-1]))
            current = [word]
    
    if current:
        chunks.append(" ".join(current))
    
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

class AIEngine:
    """Engine for interacting with various AI providers (OpenAI, Ollama, Gemini)."""

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
        self.llm = self._get_llm()
        self.parser = JsonOutputParser(pydantic_object=ReviewResponse)

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
            return ChatOpenAI(model=self.model_name, api_key=self.api_key, temperature=0.0)
        elif self.provider == "ollama":
             # Assuming default Ollama URL
            ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            return ChatOllama(model=self.model_name, base_url=ollama_url, temperature=0.0)
        elif self.provider == "gemini":
            if not self.api_key:
                raise ValueError("Google Gemini API Key is required")
            return ChatGoogleGenerativeAI(model=self.model_name, google_api_key=self.api_key, temperature=0.0)
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

        target_checklist = []
        checklist_context = ""
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
            
            checklist_context = "\nTarget Checklist exactly to follow:\n" + json.dumps(target_checklist, indent=2)

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

        # Extract total page count from document text for validation
        import re
        total_pages = 0
        if file_type and file_type.lower().strip('.') in ["pdf", "docx", "doc"] and reference_format == "Page":
            # Page-based files have page markers in the format "--- Page X Text ---" or "--- Page X Tables ---"
            page_matches = re.findall(r'--- Page (\d+) (?:Text|Tables) ---', text)
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

        # Build conditional reference instructions based on file type
        if reference_enabled and reference_format:
            if reference_format == "Sheet":
                reference_instructions = f"""2. **Location References - Conditional Rules**:
   - **PASS items (status="Pass")**: ALWAYS include the sheet reference with specific evidence. Use format "[Sheet: SheetName]" (e.g., "[Sheet: Data]", "[Sheet: Summary]"). Example: "[Sheet: Data] Found title 'Project X' authored by John Doe" - you must prove you read the specific detail.
   - **WARNING items (status="Warning")**: Include the sheet reference ONLY if partial content was found. Example: "[Sheet: Summary] Input defined but output missing..." If nothing exists to reference, omit the location.
   - **FAIL items (status="Fail")**: Do NOT include any sheet reference when nothing was found. Simply explain what is missing. Example: "No process flows found" - NO sheet prefix needed since there's nothing to reference."""
            else:
                reference_instructions = f"""2. **Location References - Conditional Rules**:
   - **How to Find Page/Slide Numbers**: The document text contains page markers in the format "--- Page X Text ---", "--- Page X Tables ---", or "--- Slide X ---". To find the correct page number for any content:
     1. Search for the content in the document text
     2. Look backwards from that content to find the nearest "--- Page X Text ---", "--- Page X Tables ---", or "--- Slide X ---" marker
     3. Use that X value as the page/slide number in your response (e.g., [Page X] or [Slide X])
     4. **IMPORTANT**: This document has exactly **{total_pages} {reference_format}s** (numbered 1 to {total_pages}). All your page references MUST be between 1 and {total_pages}. If you can't find content within these pages, mark it as "Fail" without a page reference.
   - **PASS items (status="Pass")**: ALWAYS include the {reference_format} reference with specific evidence extracted from the document. Example: "[{reference_format} 5] Found title 'Project X' authored by John Doe" - you must prove you read the specific detail.
   - **WARNING items (status="Warning")**: Include the {reference_format} reference ONLY if partial content was found. Example: "[{reference_format} 13] Input defined but output missing..." If nothing exists to reference, omit the location.
   - **FAIL items (status="Fail")**: Do NOT include any {reference_format} reference when nothing was found. Simply explain what is missing. Example: "No process flows found" - NO page prefix needed since there's nothing to reference."""
        else:
            reference_instructions = """2. **Location References**: Do NOT include page/sheet/slide references for this file type. Provide comments based on content evidence without location prefixes."""

        system_prompt = f"""You are an expert document auditor and reviewer.
        Your task is to review the provided document against standard best practices, any custom instructions, and strictly against the Target Checklist provided.
        You must evaluate *every single item* in the target checklist.

        CRITICAL INSTRUCTIONS FOR COMMENTS & SUGGESTIONS:

        1. **Suggestions Array**: For EVERY item marked "Fail" or "Warning", provide a specific, actionable recommendation in the "suggestions" array on how to fix it, indicating its type ("Fail" or "Warning"). Do not group them.

        {reference_instructions}

        3. **Multiple Requirements**: If a checklist item contains multiple requirements (e.g. "Benefits AND expected outcomes"), and the document only fulfills one of them (e.g. only benefits are found), you MUST mark the status as "Warning", explaining exactly which part is missing in the comment, and providing the location reference for the partial find (if applicable per rule 2).

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
        {checklist_context}
        """
        system_msg_content = system_prompt
        
        # Check if the selected model supports vision (heuristic)
        supports_vision = any(v in self.model_name.lower() for v in ["gpt-4o", "gemini-1.5", "llava", "vision"])

        # File-aware chunking for .car files
        chunks = []
        
        # Check if text contains CAR metadata (indicates structured .car file)
        if "[CAR_METADATA]" in text and file_type and file_type.lower().strip('.') == "car":
            # Extract individual files from CAR archive
            import re
            car_match = re.search(r'\[CAR_METADATA\] total_size=(\d+), file_count=(\d+) \[/CAR_METADATA\]', text)
            if car_match:
                file_count = int(car_match.group(2))
                logger.info(f"Processing .car file with {file_count} embedded files")
            
            # Split by file markers
            file_pattern = r'\n--- File: (.+?) ---\n'
            file_parts = re.split(file_pattern, text)
            
            # file_parts[0] is empty, then alternating filename/content
            for i in range(1, len(file_parts), 2):
                if i + 1 < len(file_parts):
                    filename = file_parts[i]
                    content = file_parts[i + 1]
                    # Chunk each file by tokens
                    file_chunks = chunk_text(content)
                    for chunk in file_chunks:
                        chunks.append({
                            "filename": filename,
                            "content": chunk
                        })
                logger.info(f"Chunked file: {filename} into {len(file_chunks)} parts")
        else:
            # Fallback for non-.car files - use token-based chunking
            if text:
                text_chunks = chunk_text(text)
                chunks = [{"filename": "document", "content": chunk} for chunk in text_chunks]
        
        logger.info(f"Total chunks to process: {len(chunks)}")
        
        # Configurable concurrency
        MAX_CONCURRENCY = int(os.getenv("LLM_MAX_CONCURRENCY", "5"))
        logger.info(f"Using concurrency limit: {MAX_CONCURRENCY}")

        async def process_chunk(chunk_index, chunk_data, semaphore):
            async with semaphore:
                logger.info(f"Processing chunk {chunk_index + 1}/{len(chunks)}: {chunk_data['filename']}")
                
                # Build user message with file context
                user_content = f"""File: {chunk_data['filename']}

Custom Instructions: {custom_instructions}

Document Content (Part {chunk_index+1}):
{chunk_data['content']}"""

                # Add images only for first chunk if supported
                if chunk_index == 0 and images and len(images) > 0 and supports_vision:
                    user_content_obj = [{"type": "text", "text": user_content}]
                    for img_b64 in images:
                        user_content_obj.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
                        })
                    messages = [
                        SystemMessage(content=system_msg_content),
                        HumanMessage(content=user_content_obj)
                    ]
                else:
                    messages = [
                        SystemMessage(content=system_msg_content),
                        HumanMessage(content=user_content)
                    ]

                chain = self.llm | self.parser
                # Use retry wrapper
                return await call_with_retry(chain, messages)

        try:
            semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
            tasks = [process_chunk(i, chunk, semaphore) for i, chunk in enumerate(chunks)]
            results = await asyncio.gather(*tasks)
            
            # Merge results
            merged_checklist = {}
            merged_suggestions = []
            
            for res in results:
                # Merge suggestions
                if "suggestions" in res:
                    merged_suggestions.extend(res["suggestions"])
                
                # Merge checklist with pessimistic conflict resolution (Fail > Warning > Pass)
                for item in res.get("checklist", []):
                    key = (item.get("section", ""), item.get("item", ""))
                    current_status = item.get("status", "").lower()
                    
                    if key not in merged_checklist:
                        merged_checklist[key] = item
                    else:
                        existing_status = merged_checklist[key].get("status", "").lower()
                        # Upgrade severity if needed
                        if "fail" in current_status:
                            merged_checklist[key]["status"] = "Fail"
                            if "fail" not in existing_status:
                                merged_checklist[key]["comment"] = item.get("comment", "")
                            else:
                                merged_checklist[key]["comment"] += "\n" + item.get("comment", "")
                        elif "warning" in current_status and "fail" not in existing_status:
                            merged_checklist[key]["status"] = "Warning"
                            if "warning" not in existing_status:
                                merged_checklist[key]["comment"] = item.get("comment", "")
                            else:
                                merged_checklist[key]["comment"] += "\n" + item.get("comment", "")
                        else:
                            # Both Pass or N/A, just append comment if unique
                            if item.get("comment") and item.get("comment") not in merged_checklist[key].get("comment", ""):
                                merged_checklist[key]["comment"] += "\n" + item.get('comment', "")

            final_response = {
                "checklist": list(merged_checklist.values()),
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
                if "not applicable" in status or "n/a" in status:
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
            comment = item.get("comment", "")
            if not comment:
                continue
                
            # Find all [Page X] or [Slide X] references
            pattern = rf'\[{reference_format} (\d+)\]'
            matches = re.findall(pattern, comment)
            
            for match in matches:
                page_num = int(match)
                if page_num > total_pages or page_num < 1:
                    # Remove invalid reference
                    comment = comment.replace(f'[{reference_format} {page_num}]', f'[{reference_format} reference removed - invalid]')
                    logger.warning(f"Corrected invalid {reference_format.lower()} reference: {page_num} (document has {total_pages} {reference_format}s)")
            
            item["comment"] = comment
            
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
