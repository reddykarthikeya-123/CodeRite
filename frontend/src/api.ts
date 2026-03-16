import type {
  Connection,
  ReviewResponse,
  CodeAnalysisResponse,
  AnalyzeDocumentRequest,
  AnalyzeCodeRequest,
  AutoFixRequest,
  AutoFixResponse,
  BatchAutoFixRequest,
  BatchAutoFixResponse,
  ChecklistItem
} from "./api/types";

// Re-export types for convenience
export type {
  Connection,
  ReviewResponse,
  CodeAnalysisResponse,
  AnalyzeDocumentRequest,
  AnalyzeCodeRequest,
  AutoFixRequest,
  AutoFixResponse,
  BatchAutoFixRequest,
  BatchAutoFixResponse,
  ChecklistItem
};

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

export const fetchConnections = async (): Promise<Connection[]> => {
  const response = await fetch(`${API_BASE_URL}/connections`);
  return response.json();
};

export const createConnection = async (conn: Connection): Promise<void> => {
  await fetch(`${API_BASE_URL}/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conn),
  });
};

export const updateConnection = async (id: number, conn: Connection): Promise<void> => {
  await fetch(`${API_BASE_URL}/connections/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conn),
  });
};

export const deleteConnection = async (id: number): Promise<void> => {
  await fetch(`${API_BASE_URL}/connections/${id}`, {
    method: "DELETE",
  });
};

export const setActiveConnection = async (id: number): Promise<void> => {
  await fetch(`${API_BASE_URL}/connections/${id}/activate`, {
    method: "POST",
  });
};

// Alias for backward compatibility
export const activateConnection = setActiveConnection;

export const testConnection = async (id: number): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE_URL}/connections/${id}/test`, {
    method: "POST",
  });
  return response.json();
};

export const uploadFile = async (file: File): Promise<{ text: string; images: string[]; filename?: string }> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    let errorMessage = "File upload failed";
    try {
      const errorData = await response.json();
      if (errorData.detail) errorMessage = errorData.detail;
    } catch (parseError) {
      console.warn('Failed to parse error response:', parseError);
    }
    throw new Error(errorMessage);
  }
  const data = await response.json();
  // Map backend response {text, images} to expected format
  return {
    text: data.text || data.content,
    images: data.images || [],
    filename: data.filename
  };
};

export const fetchChecklistCategories = async (): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/checklists`);
  const data = await response.json();
  return data.categories || [];
};

export const analyzeDocument = async (
  text: string, 
  customInstructions: string, 
  documentCategory?: string, 
  images?: string[], 
  fileType?: string
): Promise<ReviewResponse> => {
  const payload: AnalyzeDocumentRequest = { 
    text, 
    custom_instructions: customInstructions, 
    images: images || [] 
  };
  if (documentCategory) payload.document_category = documentCategory;
  if (fileType) payload.file_type = fileType;

  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Analysis failed");
  return response.json();
};

export const analyzeCode = async (files: { filename: string, content: string }[]): Promise<CodeAnalysisResponse> => {
  const payload: AnalyzeCodeRequest = { files };
  const response = await fetch(`${API_BASE_URL}/analyze-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Code analysis failed");
  }
  return response.json();
};

export const autoFixCode = async (filename: string, content: string, suggestions: string[]): Promise<AutoFixResponse> => {
    const payload: AutoFixRequest = { filename, content, suggestions };
    const response = await fetch(`${API_BASE_URL}/auto-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Auto-fix failed");
    return response.json();
};

export const autoFixCodeBatch = async (
    requests: BatchAutoFixRequest[]
): Promise<BatchAutoFixResponse> => {
    const response = await fetch(`${API_BASE_URL}/auto-fix-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: requests.flatMap(r => r.files) }),
    });
    if (!response.ok) throw new Error("Batch auto-fix failed");
    return response.json();
};

// Type alias for backward compatibility
export type CodeAutoFixBatchRequest = BatchAutoFixRequest;
