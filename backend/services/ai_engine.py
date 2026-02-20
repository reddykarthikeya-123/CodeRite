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
            return ChatOllama(model=self.model_name, base_url="http://localhost:11434", temperature=0.0)
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
        
        CRITICAL INSTRUCTION FOR SUGGESTIONS:
        For EVERY single checklist item that you mark as "Fail" or "Warning", you MUST provide a specific, actionable recommendation in the "suggestions" array on how to fix it. Do not group them. If 5 items fail, there must be at least 5 specific suggestions.
        
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
