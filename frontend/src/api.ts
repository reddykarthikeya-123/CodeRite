export const API_BASE_URL = "http://localhost:8000/api";

export interface Connection {
  id?: number;
  name: string;
  provider: string;
  model_name: string;
  api_key?: string;
  is_active?: boolean;
}

export interface ReviewResponse {
  score: number;
  checklist: Array<{ section: string; item: string; status: string; comment: string }>;
  suggestions: string[];
  rewritten_content?: string;
}

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

export const testConnection = async (conn: Connection): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/connections/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conn),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || "Connection test failed");
  }
};

export const activateConnection = async (id: number): Promise<void> => {
  await fetch(`${API_BASE_URL}/connections/${id}/activate`, {
    method: "PUT"
  });
};

export const deleteConnection = async (id: number): Promise<void> => {
  await fetch(`${API_BASE_URL}/connections/${id}`, {
    method: "DELETE"
  });
};

export const uploadFile = async (file: File): Promise<{ content: string; filename: string }> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) throw new Error("Upload failed");
  return response.json();
};

export const fetchChecklistCategories = async (): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/checklists`);
  const data = await response.json();
  return data.categories || [];
};

export const analyzeDocument = async (text: string, customInstructions: string, documentCategory?: string): Promise<ReviewResponse> => {
  const payload: any = { text, custom_instructions: customInstructions };
  if (documentCategory) payload.document_category = documentCategory;

  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Analysis failed");
  return response.json();
};
