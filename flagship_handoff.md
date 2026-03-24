# Bug Report: Critical .car File Issues

**Date:** 24 March 2026  
**Priority:** HIGH - Critical for Oracle Fusion integration workflows  
**Status:** Open - Requires Immediate Attention  
**Affected Components:** Frontend File Upload, Backend LLM Processing

---

## Issue #1: .car Files Not Visible in File Browser

### Bug Summary

**Exact Problem:**  
When users click the "browse from your computer" button in the document upload interface, `.car` files (Oracle Fusion archive files) are **NOT shown** in the native file selection dialog. Users cannot select `.car` files through click-to-browse, though drag & drop functionality works correctly.

**Error Messages:**  
None - this is a silent failure. The file browser simply filters out `.car` files.

**Expected Behavior:**
- `.car` files should appear in the file browser dialog when clicking "browse from your computer"
- Users should be able to select `.car` files through BOTH click-to-browse AND drag & drop
- File filter should include `.car` extension with appropriate icon/description

**Actual Behavior:**
- Click-to-browse: `.car` files are hidden by the browser's file filter
- Drag & drop: Works correctly (bypasses the `accept` attribute filter)
- Inconsistent user experience between the two upload methods

**Trigger Conditions:**
- User clicks "browse from your computer" link in the document upload dropzone
- User attempts to navigate to and select a `.car` file
- Issue occurs in all modern browsers (Chrome, Edge, Firefox)

**Root Cause:**  
The `accept` attribute on the hidden file input element in `frontend/src/App.tsx` does not include the `.car` extension. The current accept list is:

```tsx
accept=".pdf,.docx,.txt,.md,.py,.js,.ts,.json,.html,.css,.xlsx,.csv,.xls,.pptx"
```

**Note:** The backend (`backend/services/parser.py`) already supports `.car` files - they're included in `ALLOWED_EXTENSIONS`. This is purely a frontend visibility issue.

---

### Failed Approaches

**No approaches attempted yet** - This bug was identified during code review but has not been addressed. The following approaches were considered:

1. **Approach: Add `.car` to accept attribute**
   - **Hypothesis:** Simply adding `.car` to the accept list will make files visible
   - **Status:** NOT YET TESTED
   - **Potential Issue:** Browser may not recognize `.car` extension without proper MIME type
   - **Recommendation:** Test with `accept=".pdf,.docx,.txt,.md,.py,.js,.ts,.json,.html,.css,.xlsx,.csv,.xls,.pptx,.car"` first

2. **Approach: Use generic accept attribute**
   - **Hypothesis:** Using `accept="application/*"` or `accept="*/*"` might allow all files
   - **Status:** NOT YET TESTED
   - **Potential Issue:** Defeats the purpose of file type filtering, poor UX
   - **Recommendation:** Use as fallback only if specific extension doesn't work

3. **Approach: Add MIME type for .car files**
   - **Hypothesis:** `.car` files may need explicit MIME type specification
   - **Status:** NOT YET TESTED
   - **Technical Detail:** `.car` files are typically `application/zip` or `application/octet-stream`
   - **Recommendation:** Try `accept=".car,application/zip,application/octet-stream"`

---

### Current Code State

### frontend/src/App.tsx

```tsx
// FileUploadDropzone Component - Lines 567-750 (relevant section)
const FileUploadDropzone: React.FC<FileUploadDropzoneProps> = ({
  onFileUpload,
  uploading,
  error,
  onErrorChange,
  selectedCategory,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDisabled = !selectedCategory;

  const handleFile = async (file: File) => {
    if (!selectedCategory) {
      onErrorChange("Please select an audit document category before uploading.");
      setTimeout(() => onErrorChange(null), 5000);
      return;
    }
    // Call parent handler to show checklist filter modal
    onFileUpload(file, selectedCategory);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDisabled) setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isDisabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full min-w-[420px] h-[580px] bg-white rounded-2xl shadow-lg border border-slate-100 p-6 flex flex-col relative overflow-hidden group">
      {/* Dashed upload zone fills entire card */}
      <motion.div
        className={`flex flex-col items-center justify-center relative overflow-hidden border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 h-full ${
          isDragging
            ? 'border-[#3B82F6] bg-gradient-to-br from-[#1E40AF]/5 via-[#3B82F6]/5 to-[#06B6D4]/5 shadow-2xl shadow-[#1E40AF]/20 scale-[1.02]'
            : isDisabled
              ? 'border-slate-200 bg-slate-50/50 cursor-not-allowed opacity-60'
              : 'border-slate-200 hover:border-[#3B82F6] hover:bg-gradient-to-br hover:from-[#1E40AF]/5 hover:via-[#3B82F6]/5 hover:to-[#06B6D4]/5 hover:shadow-lg hover:shadow-[#3B82F6]/10'
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !isDisabled && fileInputRef.current?.click()}
        whileHover={!isDisabled ? { y: -3 } : {}}
        whileTap={!isDisabled ? { scale: 0.98 } : {}}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-label={isDisabled ? "Please select a compliance framework first" : "Upload document area. Drag and drop or click to browse files."}
        aria-disabled={isDisabled}
      >
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          accept=".pdf,.docx,.txt,.md,.py,.js,.ts,.json,.html,.css,.xlsx,.csv,.xls,.pptx"  // ❌ BUG: .car extension missing!
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {uploading ? (
          <div className="flex flex-col items-center animate-pulse relative z-10">
            <FileText className="w-16 h-16 text-[#1E40AF] mb-4 drop-shadow-lg" />
            <p className="text-slate-600 font-semibold tracking-wide">Processing Document...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center relative z-10">
            {/* Icon container with brand gradient and enhanced shadow */}
            <motion.div
              className={`p-4 rounded-full shadow-lg mb-5 transition-all duration-300 ${
                isDisabled
                  ? 'bg-slate-200 shadow-none'
                  : 'bg-gradient-to-br from-[#1E3A8A] via-[#3B82F6] to-[#06B6D4] shadow-lg shadow-[#3B82F6]/30 group-hover:shadow-xl group-hover:shadow-[#3B82F6]/40'
              }`}
              animate={!isDisabled && !uploading ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              whileHover={!isDisabled ? { scale: 1.1, boxShadow: "0 25px 50px -12px rgb(59 130 246 / 0.5)" } : {}}
            >
              <Upload className={`w-14 h-14 ${isDisabled ? 'text-slate-400' : 'text-white drop-shadow-md'}`} />
            </motion.div>

            {/* Bold "Drag & drop" text */}
            <p className={`text-lg font-bold mb-2 tracking-tight ${isDisabled ? 'text-slate-700' : 'text-slate-700'}`}>
              Drag & drop your document here
            </p>

            {/* "or browse" with brand color link */}
            <p className={`text-slate-500 mb-4 ${isDisabled ? 'opacity-50' : ''}`}>
              or{' '}
              <span className={`inline-flex items-center gap-1.5 font-semibold transition-colors duration-200 relative group-link ${
                isDisabled
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-[#3B82F6] hover:text-[#1E40AF] cursor-pointer'
              }`}>
                <span className="relative">
                  browse from your computer
                  {!isDisabled && (
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-[#1E3A8A] via-[#3B82F6] to-[#06B6D4] rounded-full opacity-70 group-hover/link:opacity-100 transition-opacity duration-200" />
                  )}
                </span>
              </span>
            </p>

            {/* File format icons with labels - ❌ BUG: .car not shown in UI */}
            <div className="flex gap-3 justify-center flex-wrap max-w-xs mx-auto mb-3">
              {[
                { ext: 'PDF', color: 'text-red-600', bg: 'bg-red-50' },
                { ext: 'DOCX', color: 'text-blue-600', bg: 'bg-blue-50' },
                { ext: 'XLSX', color: 'text-green-600', bg: 'bg-green-50' },
                { ext: 'PPTX', color: 'text-orange-600', bg: 'bg-orange-50' },
              ].map((format) => (
                <motion.div
                  key={format.ext}
                  className={`px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition-all duration-300 ${
                    isDisabled
                      ? 'bg-slate-100 opacity-50'
                      : `${format.bg} ${format.color}`
                  }`}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: isDisabled ? 0.5 : 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <span className={`text-xs font-bold ${isDisabled ? 'text-slate-400' : format.color}`}>{format.ext}</span>
                </motion.div>
              ))}
            </div>

            {/* File size hint */}
            <p className={`text-xs font-medium flex items-center gap-1.5 mb-1.5 ${isDisabled ? 'text-slate-400' : 'text-slate-500'}`}>
              <FileUp className="w-3.5 h-3.5" />
              Max file size: 50MB
            </p>

            {/* Note - text-xs to be slightly smaller */}
            <p className="text-slate-400 text-[11px]">
              Embedded flowcharts and screenshots are automatically graded via AI Vision.
            </p>

            {/* Disabled overlay message */}
            {isDisabled && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px] rounded-2xl z-20"
              >
                <div className="bg-white px-6 py-3 rounded-xl shadow-lg border-2 border-slate-200 flex items-center gap-2">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm font-semibold text-slate-600">Select a framework to enable upload</span>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-0 left-0 right-0 z-50 p-4 pointer-events-none"
          >
            <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-4 shadow-lg flex items-start gap-3 pointer-events-auto">
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <p className="text-rose-800 text-sm font-medium flex-1">{error}</p>
              <button
                onClick={() => onErrorChange(null)}
                className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
```

---

## Issue #2: .car Files Need Multi-LLM Call Support (Large File Handling)

### Bug Summary

**Exact Problem:**  
`.car` files (Oracle Fusion composite archives) can be very large, often containing multiple embedded XML, XSL, WSDL, and properties files. The current implementation processes these files in a **single LLM call**, which leads to:
- Timeout errors for large files (>100KB)
- Token limit exceeded errors
- Silent failures or incomplete analysis results
- Poor user experience with no progress indication

**Error Messages:**
- Timeout errors (backend logs): `"Error processing document chunk: Request timeout"`
- Token limit errors: `"This model's maximum context length is X tokens"`
- Silent failures: Analysis returns empty or partial results without clear error message

**Expected Behavior:**
- `.car` files should be automatically processed with an intelligent chunking strategy
- Multiple LLM calls should be made in parallel/sequence for large content
- Results from multiple chunks should be properly merged before returning to user
- Proper error handling for failed chunks with retry logic
- Progress indicators should show processing status for large files
- No timeout errors for files up to 10MB

**Actual Behavior:**
- Single LLM call attempts to process entire extracted content
- Large `.car` files (>100KB extracted text) frequently timeout or fail
- No chunking strategy specific to `.car` file structure
- No progress indication during long processing
- Failed chunks result in complete analysis failure (no partial results)

**Trigger Conditions:**
- User uploads a `.car` file with multiple embedded files
- Total extracted text content exceeds ~100KB
- LLM provider has strict timeout limits (e.g., Ollama default: 120s)
- Token count exceeds model's context window

**Root Cause:**  
The `analyze_document` method in `backend/services/ai_engine.py` uses a generic chunking strategy based on character count (150,000 chars per chunk), but:
1. Does not account for `.car` file structure (multiple independent files within archive)
2. Does not use token-based chunking (character count ≠ token count)
3. Does not implement retry logic for failed chunks
4. Does not provide progress feedback for multi-chunk processing
5. Semaphore concurrency (3 parallel calls) may be insufficient for very large files

---

### Failed Approaches

**No approaches attempted yet** - This is a known architectural limitation that has not been addressed. The following approaches are proposed:

1. **Approach: Implement token-based chunking**
   - **Hypothesis:** Using actual token count (via tiktoken) will prevent context limit errors
   - **Status:** NOT YET TESTED
   - **Technical Detail:** Need to integrate `tiktoken` library for accurate token counting
   - **Recommendation:** Implement `count_tokens(text)` helper and chunk at ~80% of model's context window

2. **Approach: Chunk by embedded file boundaries**
   - **Hypothesis:** Processing each embedded file within `.car` as separate unit will improve results
   - **Status:** NOT YET TESTED
   - **Technical Detail:** Modify `_parse_car_from_bytes` to return list of `{filename, content}` instead of concatenated text
   - **Recommendation:** Preserve file structure for better AI analysis context

3. **Approach: Increase semaphore concurrency**
   - **Hypothesis:** More parallel calls will reduce total processing time
   - **Status:** NOT YET TESTED
   - **Potential Issue:** May overwhelm LLM provider or hit rate limits
   - **Recommendation:** Make concurrency configurable (env var: `LLM_MAX_CONCURRENCY`), default to 5

4. **Approach: Implement retry logic for failed chunks**
   - **Hypothesis:** Retrying failed chunks with exponential backoff will improve success rate
   - **Status:** NOT YET TESTED
   - **Technical Detail:** Add `retry` decorator or manual retry loop with backoff
   - **Recommendation:** Retry up to 3 times with 2s, 4s, 8s delays

5. **Approach: Add progress tracking for multi-chunk processing**
   - **Hypothesis:** WebSocket or Server-Sent Events can provide real-time progress updates
   - **Status:** NOT YET TESTED
   - **Technical Detail:** Requires backend-to-frontend progress communication
   - **Recommendation:** Implement SSE endpoint `/api/progress/{job_id}` for polling-free updates

---

### Current Code State

### backend/services/parser.py

```python
import zipfile
async def _parse_car_from_bytes(content: bytes) -> Tuple[str, List[str]]:
    """Recursively extract XML, XSL, WSDL, and properties from .car and .iar archives."""
    text_parts = []
    images = []

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

                        file_header = f"\n--- {prefix}{info.filename} ---\n"
                        text_parts.append(file_header + decoded + "\n")

                    elif filename.endswith('.iar'):
                        file_data = z.read(info.filename)
                        text_parts.append(f"\n--- Entering nested archive: {prefix}{info.filename} ---\n")
                        process_zip_content(file_data, prefix + info.filename + " -> ")

        except Exception as e:
            text_parts.append(f"\n[Error extracting archive: {str(e)}]\n")

    process_zip_content(content)
    text = "".join(text_parts)

    return text, images
```

**Issues with Current Implementation:**
1. Concatenates all embedded files into single string - loses file structure
2. No file size tracking - caller doesn't know how large the extracted content is
3. No metadata about number of files extracted
4. Returns empty `images` list (correct for `.car` files, but could include metadata)

---

### backend/services/ai_engine.py

```python
async def analyze_document(self, text: str, images: List[str] = None, custom_instructions: str = "", document_category: str = None, file_type: str = None, enabled_checks: List[str] = None) -> dict:
    """Analyzes a document using the AI model and a target checklist.

    Args:
        text: The text content of the document.
        images: A list of base64-encoded images (optional).
        custom_instructions: Additional instructions for the AI (optional).
        document_category: The category of the document for checklist lookup.
        file_type: The extension of the original file.
        enabled_checks: List of enabled check IDs (format: "index-checklist_text") to filter checklist items.

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

    # ... [reference format logic omitted for brevity] ...

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

    # ❌ BUG: Generic chunking strategy - does not account for .car file structure
    MAX_CHUNK_SIZE = 150000  # Character-based, NOT token-based!
    text_chunks = [text[i:i + MAX_CHUNK_SIZE] for i in range(0, len(text), MAX_CHUNK_SIZE)] if text else [""]

    async def process_chunk(chunk_index, chunk_text, semaphore):
        async with semaphore:
            # Build multimodal User message only if supported AND only for the first chunk to save tokens
            if chunk_index == 0 and images and len(images) > 0 and supports_vision:
                user_content = [{"type": "text", "text": f"Custom Instructions: {custom_instructions}\n\nDocument Content (Part {chunk_index+1}):\n{chunk_text}"}]
                for img_b64 in images:
                    user_content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
                    })
            else:
                user_content = f"Custom Instructions: {custom_instructions}\n\nDocument Content (Part {chunk_index+1}):\n{chunk_text}"

            messages = [
                SystemMessage(content=system_msg_content),
                HumanMessage(content=user_content)
            ]

            chain = self.llm | self.parser
            try:
                return await chain.ainvoke(messages)
            except Exception as e:
                logger.error(f"Error processing document chunk {chunk_index}: {e}")
                return {"checklist": [], "suggestions": [], "error": str(e)}

    try:
        semaphore = asyncio.Semaphore(3)  # ❌ BUG: Fixed concurrency, not configurable
        tasks = [process_chunk(i, chunk, semaphore) for i, chunk in enumerate(text_chunks)]
        results = await asyncio.gather(*tasks)

        # Merge results
        merged_checklist = {}
        merged_suggestions = []

        for res in results:
            # Merge suggestion
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
```

**Issues with Current Implementation:**
1. `MAX_CHUNK_SIZE = 150000` is character-based, not token-based (models have token limits, not character limits)
2. No special handling for `.car` files - treats them same as PDFs/DOCX
3. No retry logic for failed chunks - single failure can corrupt results
4. Fixed semaphore concurrency (3) - not configurable based on provider capabilities
5. No progress tracking - frontend has no visibility into multi-chunk processing
6. Merge logic assumes all chunks succeed - doesn't handle partial failures gracefully

---

### backend/main.py

```python
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
```

**Issues with Current Implementation:**
1. No file size metadata returned to frontend
2. No content length tracking - doesn't warn about large files before sending to LLM
3. No special handling for `.car` files (could add metadata about embedded file count)

---

## Acceptance Criteria

### Issue #1: File Browser Visibility

- [ ] `.car` files appear in file browser dialog when clicking "browse from your computer"
- [ ] `accept` attribute includes `.car` extension (and optionally MIME types)
- [ ] File browser shows `.car` files with proper icon/description (if browser supports it)
- [ ] Both click-to-browse and drag & drop work consistently for `.car` files
- [ ] UI file format indicators updated to include `.car` (optional but recommended)

### Issue #2: Multi-LLM Call Support

- [ ] Large `.car` files (>100KB extracted content) are automatically chunked using token-based strategy
- [ ] Multiple LLM calls are made in parallel with configurable concurrency (env var: `LLM_MAX_CONCURRENCY`)
- [ ] Results from multiple chunks are properly merged without data loss
- [ ] No timeout errors for files up to 10MB (with appropriate retry logic)
- [ ] Progress indicator shows processing status (e.g., "Processing chunk 3 of 7...")
- [ ] Error handling for failed chunks with automatic retry (up to 3 attempts with exponential backoff)
- [ ] Partial results returned even if some chunks fail (graceful degradation)
- [ ] Backend logs include chunk processing metrics (time per chunk, success/failure rate)

---

## Recommended Fix Priority

**Issue #1 (File Browser Visibility):** 
- **Effort:** Low (1-2 lines of code)
- **Impact:** High (immediate user-facing improvement)
- **Priority:** **FIX FIRST** - Quick win, unblocks `.car` file uploads

**Issue #2 (Multi-LLM Call Support):**
- **Effort:** Medium-High (requires architectural changes)
- **Impact:** High (enables reliable processing of large Oracle Fusion archives)
- **Priority:** **FIX SECOND** - Requires careful testing, should be done in separate PR

---

## Related Files Summary

| File | Issue | Current State |
|------|-------|---------------|
| `frontend/src/App.tsx` | Issue #1 | `accept` attribute missing `.car` extension (line ~648) |
| `backend/services/parser.py` | Issue #2 | `.car` parsing works but doesn't preserve file structure for chunking |
| `backend/services/ai_engine.py` | Issue #2 | Generic character-based chunking, no `.car`-specific logic |
| `backend/main.py` | Issue #2 | Upload endpoint doesn't track file size for LLM routing |

---

## Additional Notes

**Testing Recommendations:**
1. Test Issue #1 fix across multiple browsers (Chrome, Edge, Firefox, Safari)
2. For Issue #2, create test suite with `.car` files of varying sizes:
   - Small: <50KB (should work with current implementation)
   - Medium: 50KB-500KB (should trigger chunking)
   - Large: 500KB-5MB (should trigger parallel chunking with progress)
   - Very Large: 5MB-10MB (should test retry logic and timeout handling)

**Security Considerations:**
- `.car` files are ZIP archives - ensure zip bomb protection is in place
- Validate extracted file count and total uncompressed size
- Consider adding `MAX_EXTRACTED_SIZE` limit in `_parse_car_from_bytes`

**Performance Optimization Opportunities:**
- Cache parsed `.car` file structure to avoid re-extraction on retry
- Use streaming LLM responses for real-time progress updates
- Implement request queuing for very large files to prevent server overload

---

**Handoff Notes for Senior Developer:**

This bug report covers two distinct but related issues affecting `.car` file handling. Issue #1 is a straightforward frontend fix that should be deployed immediately. Issue #2 requires more extensive backend changes and should be approached methodically with proper testing at each stage.

The root cause of both issues is that `.car` file support was added as an afterthought - the backend parsing exists, but the frontend UX and large-file processing strategies were not fully implemented.

Please prioritize Issue #1 for immediate deployment, then schedule Issue #2 for the next sprint with adequate time for testing and performance tuning.
