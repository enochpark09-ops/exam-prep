import type { Prompt } from './prompts/types.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/**
 * 모델 호출이 실패한 이유. 학생에게 보여줄 문장과 재시도 여부가 여기서 갈린다.
 * - auth      키가 없거나 틀렸다. 다시 눌러도 소용없다
 * - credit    잔액·한도 문제. 역시 다시 눌러도 소용없다
 * - model     모델 이름이 이 계정에서 안 먹힌다
 * - request   보낸 요청이 잘못됐다 (이미지가 너무 크다 등)
 * - busy      과부하·레이트리밋. 잠시 뒤 다시 하면 된다
 * - network   연결 자체가 안 됐다
 */
export type UpstreamKind = 'auth' | 'credit' | 'model' | 'request' | 'busy' | 'network';

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly kind: UpstreamKind,
    readonly status?: number
  ) {
    super(message);
    this.name = 'UpstreamError';
  }

  /** 설정을 고쳐야 풀리는 것 — 학생이 다시 눌러봐야 똑같다 */
  get isConfig(): boolean {
    return this.kind === 'auth' || this.kind === 'credit' || this.kind === 'model';
  }
}

/** Anthropic 이 돌려준 에러 본문에서 종류를 읽어낸다 */
export function classify(status: number, body: string): UpstreamKind {
  let type = '';
  let message = '';
  try {
    const json = JSON.parse(body) as { error?: { type?: string; message?: string } };
    type = json.error?.type ?? '';
    message = json.error?.message ?? '';
  } catch {
    message = body;
  }
  const lower = `${type} ${message}`.toLowerCase();

  if (status === 401 || type === 'authentication_error') return 'auth';
  if (lower.includes('credit balance') || lower.includes('billing') || lower.includes('quota')) {
    return 'credit';
  }
  if (status === 403 || type === 'permission_error') return 'credit';
  if (status === 404 || type === 'not_found_error') return 'model';
  if (status === 429 || type === 'rate_limit_error') return 'busy';
  if (status >= 500 || type === 'overloaded_error' || type === 'api_error') return 'busy';
  return 'request';
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ConfigError('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다');
  return key;
}

export interface ImageBlock {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
}

export function imageBlock(dataUrl: string): ImageBlock {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('지원하지 않는 이미지 형식입니다 (jpeg, png, webp만 가능)');
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

/** 앞뒤 군더더기를 걷어내고 JSON 객체를 뽑는다 */
export function parseJson<T>(text: string): T {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('모델 응답에서 JSON을 찾지 못했습니다');
  return JSON.parse(s.slice(start, end + 1)) as T;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}

export async function post(body: unknown, retries = 2): Promise<AnthropicResponse> {
  let lastErr: UpstreamError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey(),
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastErr = new UpstreamError(
        `연결 실패: ${err instanceof Error ? err.message : String(err)}`,
        'network'
      );
      if (attempt < retries) {
        await sleep(1200 * 2 ** attempt);
        continue;
      }
      throw lastErr;
    }

    if (res.ok) return (await res.json()) as AnthropicResponse;

    const text = await res.text();
    const kind = classify(res.status, text);
    const err = new UpstreamError(`API ${res.status} (${kind}): ${text.slice(0, 300)}`, kind, res.status);

    // 설정 문제와 잘못된 요청은 재시도해도 같은 결과다
    if (err.isConfig || kind === 'request') throw err;

    lastErr = err;
    if (attempt < retries) await sleep(1200 * 2 ** attempt);
  }

  throw lastErr ?? new UpstreamError('모델 호출에 실패했습니다', 'busy');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface RunResult<T> {
  data: T;
  elapsedMs: number;
  usage: { inputTokens: number; outputTokens: number };
}

export async function runPrompt<T>(
  prompt: Prompt,
  userText: string,
  extraBlocks: ImageBlock[] = []
): Promise<RunResult<T>> {
  const started = Date.now();
  const json = await post({
    model: prompt.model,
    max_tokens: prompt.maxTokens,
    temperature: prompt.temperature,
    system: prompt.system,
    messages: [{ role: 'user', content: [...extraBlocks, { type: 'text', text: userText }] }],
  });

  const text = (json.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');

  return {
    data: parseJson<T>(text),
    elapsedMs: Date.now() - started,
    usage: {
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    },
  };
}
