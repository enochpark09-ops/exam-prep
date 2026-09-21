/** 클라이언트와 서버리스 함수가 함께 쓰는 계약. 여기가 단일 출처다. */

export type ErrorType =
  | '개념미파악'
  | '계산실수'
  | '문제해석오류'
  | '조건누락'
  | '판단불가';

export const ERROR_TYPES: ErrorType[] = [
  '개념미파악',
  '계산실수',
  '문제해석오류',
  '조건누락',
  '판단불가',
];

export type Level = 'easy' | 'same' | 'hard';

export interface ExtractResult {
  subject: string;
  questionNumber: string | null;
  questionText: string;
  choices: string[];
  myAnswer: string | null;
  correctAnswer: string | null;
  hasFigure: boolean;
  figureDescription: string | null;
  multipleQuestions: boolean;
  confidence: {
    questionText: number;
    choices: number;
    myAnswer: number;
    correctAnswer: number;
  };
  issues: string[];
}

export interface DiagnoseResult {
  primaryConceptId: string;
  conceptIds: string[];
  errorType: ErrorType;
  errorExplanation: string;
  confidence: number;
  proposedNew: { name: string; chapter: string; unit: string } | null;
}

export interface ExplainResult {
  summary: string[];
  keyPoint: string;
  example: { question: string; solution: string[] };
  commonMistake: string;
  checkQuestion: string;
}

export interface GeneratedQuestion {
  level: Level;
  questionText: string;
  choices: string[];
  answerIndex: number;
  hint: string;
  solution: string[];
}

export interface GenerateResult {
  questions: GeneratedQuestion[];
}

/** 모든 /api 응답의 공통 봉투 */
export type ApiResponse<T> =
  | { ok: true; data: T; warnings: string[]; meta: { promptVersion: number; elapsedMs: number } }
  | { ok: false; error: string; code: ApiErrorCode };

export type ApiErrorCode =
  | 'bad_request'
  | 'rate_limited'
  | 'upstream_error'
  | 'invalid_output'
  | 'server_misconfigured';

/** 낮은 신뢰도 필드에 밑줄을 치는 기준 */
export const CONFIDENCE_THRESHOLD = 0.7;
