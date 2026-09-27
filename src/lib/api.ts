import type {
  ApiResponse,
  DiagnoseResult,
  ExplainResult,
  ExtractResult,
  GenerateResult,
} from '@shared/types';

const DEVICE_KEY = 'exam-prep:device-id';

/** 로그인이 없으므로 기기 단위 식별자를 쓴다. 레이트리밋의 기준이 된다. */
export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    /** 만든 사람용 단서 — 서버가 받은 원래 오류 설명 */
    readonly detail?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** 레이트리밋이나 설정 오류는 다시 눌러도 소용없다 */
  get retryable(): boolean {
    return this.code === 'upstream_error' || this.code === 'invalid_output';
  }
}

export interface Called<T> {
  data: T;
  warnings: string[];
  elapsedMs: number;
}

async function call<T>(route: string, body: unknown): Promise<Called<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': deviceId() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('인터넷 연결을 확인해보자.', 'offline', 0);
  }

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError('서버 응답을 읽지 못했어.', 'invalid_output', res.status);
  }

  if (!json.ok) throw new ApiError(json.error, json.code, res.status, json.detail);
  return { data: json.data, warnings: json.warnings, elapsedMs: json.meta.elapsedMs };
}

export const api = {
  extract: (image: string) => call<ExtractResult>('extract', { image }),

  diagnose: (input: {
    grade: number;
    subject?: string;
    questionText: string;
    choices?: string[];
    myAnswer?: string | null;
    correctAnswer?: string | null;
  }) => call<DiagnoseResult>('diagnose', input),

  explain: (input: {
    conceptId: string;
    questionText?: string;
    myAnswer?: string | null;
    correctAnswer?: string | null;
    errorType?: string | null;
    errorExplanation?: string | null;
  }) => call<ExplainResult>('explain', input),

  generate: (input: {
    conceptId: string;
    questionText?: string;
    choices?: string[];
    myAnswer?: string | null;
    correctAnswer?: string | null;
    errorType?: string | null;
    existingQuestions?: string[];
  }) => call<GenerateResult>('generate', input),
};
