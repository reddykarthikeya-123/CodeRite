from langchain_openai import ChatOpenAI
from langchain_community.chat_models import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from typing import List, Optional
import json
import os

class ChecklistItem(BaseModel):
    section: str = Field(description="The section this item belongs to")
    item: str = Field(description="The checklist item being reviewed")
    status: str = Field(description="Status of the item: Pass, Fail, or Warning")
    comment: str = Field(description="Comment explaining the status")

class ReviewResponse(BaseModel):
    checklist: List[ChecklistItem] = Field(description="List of checklist items reviewed")
    suggestions: List[str] = Field(description="List of specific suggestions for improvement")
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

class AIEngine:
    def __init__(self, provider: str = "ollama", model_name: str = "llama3", api_key: str = None):
        self.provider = provider
        self.model_name = model_name
        self.api_key = api_key
        self.llm = self._get_llm()
        self.parser = JsonOutputParser(pydantic_object=ReviewResponse)

    def _get_llm(self):
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
        try:
            # For a basic test, we just invoke a very simple prompt
            prompt = ChatPromptTemplate.from_messages([("user", "Hello")])
            chain = prompt | self.llm
            await chain.ainvoke({})
            return True
        except Exception as e:
            print(f"Connection test failed: {e}")
            raise Exception(f"{str(e)}")

    async def analyze_document(self, text: str, images: List[str] = None, custom_instructions: str = "", document_category: str = None) -> dict:
        from services.checklist_loader import loader

        target_checklist = []
        checklist_context = ""
        if document_category:
            target_checklist = loader.get_checklist_for_category(document_category)
            checklist_context = "\nTarget Checklist exactly to follow:\n" + json.dumps(target_checklist, indent=2)

        system_prompt = """You are an expert document auditor and reviewer. 
        Your task is to review the provided document against standard best practices, any custom instructions, and strictly against the Target Checklist provided.
        You must evaluate *every single item* in the target checklist.
        
        CRITICAL INSTRUCTIONS FOR COMMENTS & SUGGESTIONS:
        1. For EVERY item marked "Fail" or "Warning", provide a specific, actionable recommendation in the "suggestions" array on how to fix it. Do not group them.
        2. For EVERY item marked "Pass", the "comment" field MUST contain actual evidence extracted from the document proving the pass (e.g., "Found title 'Project X' authored by John Doe", NOT just "The document has a title"). You must prove you read the specific detail.
        3. If a checklist item contains multiple requirements (e.g. "Benefits AND expected outcomes"), and the document only fulfills one of them (e.g. only benefits are found), you MUST mark the status as "Warning", explaining exactly which part is missing in the comment.
        
        You must output a JSON object with the following structure:
        {{
            "checklist": [
                {{"section": "<Section Name>", "item": "<Checklist Item>", "status": "<Pass/Fail/Warning>", "comment": "<Explanation>"}}
            ],
            "suggestions": ["<Suggestion 1>", "<Suggestion 2>"],
            "rewritten_content": "<Optional: Rewritten sections or the entire document if requested>"
        }}
        
        Ensure the tone is professional and constructive.
        {checklist_context}
        """
        system_msg_content = system_prompt.format(checklist_context=checklist_context)
        
        # Check if the selected model supports vision (heuristic)
        supports_vision = any(v in self.model_name.lower() for v in ["gpt-4o", "gemini-1.5", "llava", "vision"])
        
        # Build multimodal User message only if supported
        if images and len(images) > 0 and supports_vision:
            user_content = [{"type": "text", "text": f"Custom Instructions: {custom_instructions}\n\nDocument Content:\n{text}"}]
            for img_b64 in images:
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
                })
        else:
            user_content = f"Custom Instructions: {custom_instructions}\n\nDocument Content:\n{text}"
            
        messages = [
            SystemMessage(content=system_msg_content),
            HumanMessage(content=user_content)
        ]
        
        chain = self.llm | self.parser
        
        try:
            response = await chain.ainvoke(messages)
            
            # Programmatic Scoring Logic
            # Programmatic Scoring Logic
            valid_items = 0
            score = 0
            
            for item in response.get("checklist", []):
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
                response["score"] = 0
            else:
                final_score = int((score / valid_items) * 100)
                response["score"] = final_score

            return response
        except Exception as e:
            # Fallback or error handling
            print(f"AI Error: {e}")
            return {
                "score": 0,
                "checklist": [{"item": "AI Analysis", "status": "Fail", "comment": f"Error: {str(e)}"}],
                "suggestions": ["Check configuration and try again."],
                "rewritten_content": ""
            }

    async def analyze_code(self, files: List[dict]) -> dict:
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
        
        # Build the user prompt by concatenating all the files, injecting line numbers
        user_content = "Please review the following code files. Note that each line of code is prefixed with its line number (format: 'line_number | code'):\n\n"
        for f in files:
            content_with_lines = "\n".join(f"{i+1} | {line}" for i, line in enumerate(f['content'].split('\n')))
            user_content += f"=== BEGIN FILE: {f['filename']} ===\n"
            user_content += f"{content_with_lines}\n"
            user_content += f"=== END FILE: {f['filename']} ===\n\n"
            
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_content)
        ]
        
        code_parser = JsonOutputParser(pydantic_object=CodeAnalysisResponse_Schema)
        chain = self.llm | code_parser
        
        try:
            response = await chain.ainvoke(messages)
            
            # Ensure the overall score calculation is accurate even if the LLM hallucinates the math slightly
            file_scores = [f.get("score", 0) for f in response.get("files", [])]
            if len(file_scores) > 0:
                calculated_average = int(sum(file_scores) / len(file_scores))
                response["overall_score"] = calculated_average
            else:
                response["overall_score"] = 0
                
            return response
        except Exception as e:
            print(f"AI Code Analysis Error: {e}")
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
            print(f"AI Auto-Fix Error: {e}")
            return {
                "fixed_code": f"// Error generating fixed code: {str(e)}\n\n" + content
            }

    async def auto_fix_code_batch(self, files: List[dict]) -> dict:
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
            print(f"AI Batch Auto-Fix Error: {e}")
            return {
                "fixed_files": [
                    {
                        "filename": f["filename"],
                        "fixed_code": f"// Error generating fixed code: {str(e)}\n\n" + f["content"]
                    } for f in files
                ]
            }
