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
}

export interface SuggestionItem {
  type: string;
  text: string;
}

export interface ReviewResponse {
  score: number;
  checklist: ChecklistItem[];
  suggestions: SuggestionItem[];
  rewritten_content?: string;
  filename?: string;
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
}

export interface AnalyzeCodeRequest {
  files: { filename: string; content: string }[];
}

export interface AutoFixRequest {
    filename: string;
    content: string;
    suggestions: string[];
}

export interface AutoFixResponse {
    fixed_code: string;
}

export interface BatchAutoFixRequest {
    files: {
        filename: string;
        content: string;
        suggestions: string[];
    }[];
}

export interface BatchAutoFixResponse {
    fixed_files: {
        filename: string;
        fixed_code: string;
    }[];
}
