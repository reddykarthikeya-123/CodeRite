export interface Connection {
  id?: number;
  name: string;
  provider: string;
  model_name: string;
  api_key?: string;
  is_active?: boolean;
}

export interface ChecklistItem {
  section: string;
  item: string;
  status: string;
  comment: string;
  page_references?: number[];
}

export interface SuggestionItem {
  type: string;
  text: string;
}

export interface PaginationMetadata {
  enabled: boolean;
  format: string | null;
  total_pages: number | null;
  provider: string;
  warning: string | null;
}

export interface AnalysisMetadata {
  cache_hit: boolean;
  request_fingerprint: string;
  deterministic_mode?: boolean;
  cache_mode?: string;
  provider?: string;
  model_name?: string;
}

export interface ReviewResponse {
  score: number;
  checklist: ChecklistItem[];
  suggestions: SuggestionItem[];
  rewritten_content?: string;
  filename?: string;
  pagination_warning?: string;
  analysis_metadata?: AnalysisMetadata;
}

export interface CodeFileReview {
  filename: string;
  score: number;
  highlights: string[];
  suggestions: string[];
}

export interface CodeAnalysisResponse {
  overall_score: number;
  files: CodeFileReview[];
}

export interface AnalyzeDocumentRequest {
  text: string;
  custom_instructions: string;
  document_category?: string;
  images: string[];
  file_type?: string;
  enabled_checks?: string[];
  pagination_metadata?: PaginationMetadata;
  force_refresh?: boolean;
  filename?: string;
}

export interface AnalyzeCodeRequest {
  files: { filename: string; content: string }[];
}

export interface AutoFixRequest {
    filename: string;
    content: string;
    selected_suggestions: string[];
}

export interface AutoFixResponse {
    fixed_code: string;
}

export interface BatchAutoFixRequest {
    files: {
        filename: string;
        content: string;
        selected_suggestions: string[];
    }[];
}

export interface BatchAutoFixResponse {
    fixed_files: {
        filename: string;
        fixed_code: string;
    }[];
}
