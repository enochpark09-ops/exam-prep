import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ApiErrorCode, ApiResponse } from '../../shared/types.js';
import { ConfigError, UpstreamError } from './claude.js';
import { checkLimit } from './ratelimit.js';

export function fail(res: VercelResponse, status: number, code: ApiErrorCode, error: string): void {
  res.status(status).json({ ok: false, code, error } satisfies ApiResponse<never>);
}

export function ok<T>(
  res: VercelResponse,
  data: T,
  warnings: string[],
  meta: { promptVersion: number; elapsedMs: number }
): void {
  res.status(200).json({ ok: true, data, warnings, meta } satisfies ApiResponse<T>);
}

/** 정상 브라우저 요청인지 최소한만 확인한다 */
function deviceIdOf(req: VercelRequest): string | null {
  const raw = req.headers['x-device-id'];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return id;
}

export interface HandlerContext {
  deviceId: string;
  body: Record<string, unknown>;
}

/**
 * 모든 라우트가 공유하는 껍데기 — 메서드 검사, 디바이스 확인, 레이트리밋,
 * 에러를 사용자에게 보여줄 문장으로 바꾸기.
 */
export function withGuards(
  bucket: string,
  handler: (ctx: HandlerContext, res: VercelResponse) => Promise<void>
) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    if (req.method !== 'POST') {
      fail(res, 405, 'bad_request', 'POST만 받습니다');
      return;
    }
    const deviceId = deviceIdOf(req);
    if (!deviceId) {
      fail(res, 400, 'bad_request', 'x-device-id 헤더가 필요합니다');
      return;
    }
    const limit = await checkLimit(deviceId, bucket);
    if (!limit.allowed) {
      fail(res, 429, 'rate_limited', limit.message ?? '오늘 사용량을 다 썼어.');
      return;
    }

    try {
      const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
      await handler({ deviceId, body: body as Record<string, unknown> }, res);
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error('[config]', err.message);
        fail(res, 500, 'server_misconfigured', '서버 설정이 끝나지 않았습니다. 관리자에게 알려주세요.');
        return;
      }
      if (err instanceof UpstreamError) {
        console.error('[upstream]', err.message);
        fail(res, 502, 'upstream_error', '지금 연결이 잘 안 돼. 잠시 뒤에 다시 해보자.');
        return;
      }
      if (err instanceof SyntaxError) {
        console.error('[parse]', err.message);
        fail(res, 502, 'invalid_output', '응답을 읽지 못했어. 다시 한 번 해보자.');
        return;
      }
      console.error('[unhandled]', err);
      fail(res, 500, 'upstream_error', '알 수 없는 문제가 생겼어. 다시 해보자.');
    }
  };
}

export function requireString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || v.length === 0) throw new SyntaxError(`${key}가 필요합니다`);
  return v;
}

export function optionalString(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
