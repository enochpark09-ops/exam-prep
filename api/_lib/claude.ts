import type { Prompt } from './prompts/types.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export class UpstreamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'UpstreamError';
  }
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

async function post(body: unknown, retries = 2): Promise<AnthropicResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey(),
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new UpstreamError(`재시도 가능 오류 ${res.status}`, res.status);
      }
      if (!res.ok) {
        const text = await res.text();
        // 4xx는 재시도해도 같은 결과다. 즉시 던진다.
        throw Object.assign(new UpstreamError(`API ${res.status}: ${text.slice(0, 200)}`, res.status), {
          fatal: true,
        });
      }
      return (await res.json()) as AnthropicResponse;
    } catch (err) {
      if ((err as { fatal?: boolean }).fatal) throw err;
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1200 * 2 ** attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new UpstreamError('모델 호출에 실패했습니다');
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
