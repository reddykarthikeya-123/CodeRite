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
  ChecklistItem,
  ChecklistFilterItem,
  PaginationMetadata,
  AnalysisMetadata
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
  ChecklistItem,
  ChecklistFilterItem,
  PaginationMetadata,
  AnalysisMetadata
};

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

// Helper function for handling fetch errors
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = "Request failed";
    let statusCode = response.status;
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorData.message || errorData.error || errorMessage;
    } catch {
      errorMessage = `Request failed with status ${statusCode}`;
    }
    
    throw new Error(errorMessage);
  }
  
  return response.json();
}

// Helper function for fetch with timeout, retries, and dynamic backoff
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 60000,
  retries = 2, // Default 2 retries
  backoffMs = 2000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      cache: options.cache ?? "no-store",
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    // Auto-retry on 5xx server errors or 429 rate limits
    if (!response.ok && (response.status >= 500 || response.status === 429) && retries > 0) {
      console.warn(`[API] Server error ${response.status}. Retrying in ${backoffMs}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return fetchWithTimeout(url, options, timeout, retries - 1, backoffMs * 2);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (retries > 0) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      // Dynamic timeout: extend timeout by 1.5x on subsequent timeout failures
      const nextTimeout = isTimeout ? Math.floor(timeout * 1.5) : timeout;
      
      console.warn(`[API] Network/Timeout error. Retrying in ${backoffMs}ms with ${nextTimeout}ms limit...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return fetchWithTimeout(url, options, nextTimeout, retries - 1, backoffMs * 2);
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms. The server took too long to respond.`);
    }
    throw error;
  }
}

export const fetchConnections = async (): Promise<Connection[]> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/connections`);
  return handleResponse<Connection[]>(response);
};

export const createConnection = async (conn: Connection): Promise<void> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conn),
  });
  await handleResponse(response);
};

export const updateConnection = async (id: number, conn: Connection): Promise<void> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/connections/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conn),
  });
  await handleResponse(response);
};

export const deleteConnection = async (id: number): Promise<void> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/connections/${id}`, {
    method: "DELETE",
  });
  await handleResponse(response);
};

export const setActiveConnection = async (id: number): Promise<void> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/connections/${id}/activate`, {
    method: "PUT",
  });
  await handleResponse(response);
};

// Alias for backward compatibility
export const activateConnection = setActiveConnection;

export const testConnection = async (id: number): Promise<{ success: boolean; message: string }> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/connections/${id}/test`, {
    method: "POST",
  });
  return handleResponse<{ success: boolean; message: string }>(response);
};

export const testConnectionPayload = async (conn: Connection): Promise<{ success: boolean; message: string }> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/connections/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conn),
  });
  return handleResponse<{ success: boolean; message: string }>(response);
};

export const uploadFile = async (
  file: File
): Promise<{ text: string; images: string[]; filename?: string; pagination_metadata?: PaginationMetadata }> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithTimeout(`${API_BASE_URL}/upload`, {
    method: "POST",
    body: formData,
  });
  
  const data = await handleResponse<Record<string, unknown>>(response);
  // Map backend response {text, images} to expected format
  return {
    text: (data.text as string) || (data.content as string) || '',
    images: (data.images as string[]) || [],
    filename: data.filename as string | undefined,
    pagination_metadata: data.pagination_metadata as PaginationMetadata | undefined
  };
};

export const fetchChecklistCategories = async (): Promise<string[]> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/checklists`);
  const data = await handleResponse<{ categories: string[] }>(response);
  return data.categories || [];
};

export const fetchChecklistItems = async (category: string): Promise<ChecklistFilterItem[]> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/checklists/${encodeURIComponent(category)}`);
  const data = await handleResponse<{ items: ChecklistFilterItem[] }>(response);
  return data.items || [];
};

export const analyzeDocument = async (
  text: string,
  customInstructions: string,
  documentCategory?: string,
  images?: string[],
  fileType?: string,
  enabledChecks?: string[],
  paginationMetadata?: PaginationMetadata,
  forceRefresh?: boolean,
  filename?: string
): Promise<ReviewResponse> => {
  const payload: AnalyzeDocumentRequest = {
    text,
    custom_instructions: customInstructions,
    images: images || []
  };
  if (documentCategory) payload.document_category = documentCategory;
  if (fileType) payload.file_type = fileType;
  if (enabledChecks) payload.enabled_checks = enabledChecks;
  if (paginationMetadata) payload.pagination_metadata = paginationMetadata;
  if (typeof forceRefresh === "boolean") payload.force_refresh = forceRefresh;
  if (filename) payload.filename = filename;

  const response = await fetchWithTimeout(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, 300000); // 5 minute timeout for analysis

  return handleResponse<ReviewResponse>(response);
};

export const analyzeCode = async (files: { filename: string, content: string }[]): Promise<CodeAnalysisResponse> => {
  const payload: AnalyzeCodeRequest = { files };
  const response = await fetchWithTimeout(`${API_BASE_URL}/analyze-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, 300000); // 5 minute timeout for analysis
  
  return handleResponse<CodeAnalysisResponse>(response);
};

export const autoFixCode = async (filename: string, content: string, selected_suggestions: string[]): Promise<AutoFixResponse> => {
    const payload: AutoFixRequest = { filename, content, selected_suggestions };
    const response = await fetchWithTimeout(`${API_BASE_URL}/auto-fix-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    }, 120000); // 2 minute timeout
    
    return handleResponse<AutoFixResponse>(response);
};

export const autoFixCodeBatch = async (
    requests: BatchAutoFixRequest[]
): Promise<BatchAutoFixResponse> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auto-fix-code-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: requests.flatMap(r => r.files) }),
    }, 180000); // 3 minute timeout for batch
    
    return handleResponse<BatchAutoFixResponse>(response);
};

// Type alias for backward compatibility
export type CodeAutoFixBatchRequest = BatchAutoFixRequest;
