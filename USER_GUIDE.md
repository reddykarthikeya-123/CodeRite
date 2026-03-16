# Inspectra AI - User Guide

## Overview
Inspectra AI is an intelligent, dual-purpose platform designed to automate and enhance two critical engineering workflows:
1. **Document Review & Scoring**: Automatically analyzes technical documents, functional deliverables, MS Word specs, Excel trackers, and PDFs against predefined compliance checklists (e.g., readability, security, architecture). It even uses Vision AI to "see" and score embedded flowcharts and diagrams!
2. **Code Analysis & Auto-Fixing**: Acts as a Principal Software Engineer to review raw source code, highlight best practices, point out security flaws, and optionally auto-generate the fixed code for the issues you select.

Built with a fast Python/FastAPI backend and a sleek React/TypeScript frontend, the app routes your data to powerful Large Language Models (LLMs) like OpenAI, Gemini, or local Ollama instances to generate detailed, actionable feedback in seconds.

---

## 🚀 How to Use the Application

### 1. Initial Setup (Settings Tab)
Before doing any analysis, you must connect the app to an "AI Brain".
1. Click the **Settings** gear icon (⚙️) in the top-right corner.
2. In the "**AI Connections**" section, click "**+ Add Connection**" or edit an existing one.
3. Choose your preferred Provider (e.g., OpenAI, Google Gemini, or Local Ollama).
4. Enter the required API Key and the specific Model Name (e.g., `gemini-1.5-flash` or `gpt-4o`).
5. **CRITICAL**: Ensure at least one connection is toggled as **Active**. The app will always use the currently active connection for all analysis!

### 2. Document Review Flow
*Use this when you have written specs, PDFs, or Excel sheets.*

1. Navigate to the **Document Review** tab (the default home page).
2. **Select Category**: Tell the AI what kind of document this is (e.g., Architecture Spec, DB Schema, Security Audit). This helps it decide which internal checklist to grade against.
3. **Custom Instructions (Optional)**: If you want the AI to look for something specific (e.g., "Make sure they mentioned PostgreSQL"), type it here.
4. **Upload File**: Drag and drop your `.pdf`, `.docx`, `.xlsx`, `.csv`, or `.pptx` file into the upload zone.
5. **Review Results**:
   - The AI will read the text (and look at any extracted images/flowcharts).
   - You will see a giant **Score out of 100**.
   - Below the score, you will see a detailed checklist with Pass/Fail/Warning statuses and the AI's reasoning for each grade.
   - You will also see a list of Actionable Suggestions on how to improve the document.

### 3. Code Analysis & Auto-Fix Flow
*Use this when you have actual source code files you want reviewed.*

1. Navigate to the **Code Analysis** tab.
2. **Upload Code File**: Drag and drop your source code file (e.g., `.py`, `.js`, `.tsx`, `.java`, etc.).
3. **Review Results**:
   - The AI will assign a quality score.
   - It will list **Highlights** (what you did well).
   - It will list **Suggestions**, referencing exact line numbers where you made a mistake or where performance can be improved.
4. **Auto-Fixing**:
   - Next to each Suggestion, you will see a checkbox.
   - Check the boxes for the suggestions you actually agree with.
   - Click the **"Auto-Fix Selected"** button.
   - The AI will rewrite your code, applying *only* the suggestions you requested, and present you with a beautiful Diff View (Before vs. After).
   - You can then accept the changes and copy the fixed code back into your IDE!

---

## Troubleshooting
- **File Upload Fails**: Ensure your file is under the server's limit (usually 50MB) and is a supported format.
- **500 Server Error on Analysis**: This usually means either your API Key is invalid/expired, or your AI Connection in the Settings tab is not set up correctly. Double-check your active connection!
