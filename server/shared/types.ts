export type CommentType = '书评' | '章评' | '段评';

export type TaskStatus = 'created' | 'running' | 'paused' | 'completed' | 'completed_with_errors' | 'failed';
export type RowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'invalid';

export interface MappingRule {
  label: string;
  min: number;
  max: number;
  includeMax: boolean;
}

export interface PromptConfig {
  bookReview: string;
  chapterComment: string;
  paragraphComment: string;
}

export interface AppConfig {
  prompts: PromptConfig;
  qualityRules: MappingRule[];
  emotionRules: MappingRule[];
  updatedAt: string;
}

export interface ScoreResult {
  comment_type: CommentType | string;
  quality_score: number;
  quality_level: string;
  quality_reason: string;
  emotion_score: number;
  emotion_type: string;
}

export interface TaskRow {
  id: string;
  rowNumber: number;
  comment_type: CommentType | string;
  comment_content: string;
  status: RowStatus;
  error?: string;
  result?: ScoreResult;
  rawResponse?: unknown;
}

export interface ScoreTask {
  id: string;
  name: string;
  fileName: string;
  status: TaskStatus;
  totalRows: number;
  validRows: number;
  successRows: number;
  failedRows: number;
  createdAt: string;
  updatedAt: string;
  rows: TaskRow[];
}
