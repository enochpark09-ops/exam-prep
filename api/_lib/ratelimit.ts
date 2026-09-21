/**
 * 디바이스별 일일 호출 상한.
 *
 * 로그인이 없으므로 기기 UUID(x-device-id)로 센다. 완전한 방어는 아니지만
 * 자동화된 남용은 걸러진다. 진짜 목적은 비용이 조용히 새는 것을 막는 것이다.
 *
 * Vercel KV(또는 Upstash REST 호환)가 설정돼 있으면 그것을 쓰고,
 * 없으면 인스턴스 메모리로 떨어진다 — 서버리스는 인스턴스가 여러 개라
 * 메모리 폴백은 상한이 느슨해진다. 운영에서는 KV를 붙이는 것을 전제로 한다.
 */

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export const DAILY_LIMITS: Record<string, number> = {
  extract: Number(process.env.LIMIT_EXTRACT ?? 50),
  diagnose: Number(process.env.LIMIT_DIAGNOSE ?? 60),
  explain: Number(process.env.LIMIT_EXPLAIN ?? 60),
  generate: Number(process.env.LIMIT_GENERATE ?? 60),
};

const memory = new Map<string, { count: number; resetAt: number }>();

function todayKey(deviceId: string, bucket: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `rl:${day}:${bucket}:${deviceId}`;
}

function secondsUntilMidnightUtc(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.ceil((next.getTime() - now.getTime()) / 1000);
}

async function kv(path: string): Promise<number | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/${path}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: number };
    return typeof json.result === 'number' ? json.result : null;
  } catch {
    // KV가 죽었다고 학습을 막지는 않는다. 상한을 포기하고 통과시킨다.
    return null;
  }
}

export interface LimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  /** 상한에 걸렸을 때 학생에게 보여줄 문장 */
  message?: string;
}

export async function checkLimit(deviceId: string, bucket: string): Promise<LimitResult> {
  const limit = DAILY_LIMITS[bucket] ?? 50;
  const key = todayKey(deviceId, bucket);

  const viaKv = await kv(`incr/${encodeURIComponent(key)}`);
  if (viaKv !== null) {
    if (viaKv === 1) await kv(`expire/${encodeURIComponent(key)}/${secondsUntilMidnightUtc()}`);
    return {
      allowed: viaKv <= limit,
      used: viaKv,
      limit,
      message: viaKv > limit ? limitMessage(bucket, limit) : undefined,
    };
  }

  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + secondsUntilMidnightUtc() * 1000 });
    return { allowed: true, used: 1, limit };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    used: entry.count,
    limit,
    message: entry.count > limit ? limitMessage(bucket, limit) : undefined,
  };
}

function limitMessage(bucket: string, limit: number): string {
  const what = bucket === 'extract' ? '사진 판독' : '문제 생성';
  return `오늘 ${what}을 ${limit}번 했어. 내일 다시 이어서 하자.`;
}
