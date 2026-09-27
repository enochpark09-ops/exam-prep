import type { VercelRequest, VercelResponse } from '@vercel/node';
import { post, UpstreamError } from './_lib/claude.js';
import { extractPrompt } from './_lib/prompts/extract.js';
import { CONCEPTS } from '../shared/concepts.js';
import pkg from '../package.json' with { type: 'json' };

/**
 * GET /api/health — 브라우저 주소창에서 바로 열어볼 수 있는 자가진단.
 *
 * 터미널 없이 폰에서도 "키가 들어갔는지, 모델을 부를 수 있는지"를 확인하려고 둔다.
 * 키 값 자체는 절대 내보내지 않는다 — 앞 7자리와 길이만 보여준다.
 */

let lastPing = 0;
const PING_COOLDOWN_MS = 10_000;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const key = process.env.ANTHROPIC_API_KEY;

  const report: Record<string, unknown> = {
    ok: false,
    version: (pkg as { version: string }).version,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    checks: {
      key: key
        ? {
            present: true,
            looksValid: key.startsWith('sk-ant-'),
            prefix: `${key.slice(0, 7)}…`,
            length: key.length,
            hasWhitespace: key !== key.trim(),
          }
        : { present: false },
      concepts: { count: CONCEPTS.length },
      model: extractPrompt.model,
      kv: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    },
  };

  if (!key) {
    report.diagnosis = 'ANTHROPIC_API_KEY가 없습니다. Vercel 환경변수에 추가한 뒤 재배포하세요.';
    res.status(500).json(report);
    return;
  }

  // ?ping=1 일 때만 실제로 모델을 부른다. 새로고침으로 호출이 쌓이지 않게.
  if (req.query.ping !== '1') {
    report.ok = true;
    report.diagnosis = '키는 들어가 있습니다. 모델 호출까지 확인하려면 주소 끝에 ?ping=1 을 붙이세요.';
    res.status(200).json(report);
    return;
  }

  const now = Date.now();
  if (now - lastPing < PING_COOLDOWN_MS) {
    report.diagnosis = '잠깐만요. 10초에 한 번만 확인할 수 있습니다.';
    res.status(429).json(report);
    return;
  }
  lastPing = now;

  try {
    await post(
      {
        model: extractPrompt.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      },
      0
    );
    report.ok = true;
    report.checks = { ...(report.checks as object), upstream: { ok: true } };
    report.diagnosis = '정상입니다. 키와 모델 호출 모두 확인했습니다.';
    res.status(200).json(report);
  } catch (err) {
    const kind = err instanceof UpstreamError ? err.kind : 'unknown';
    report.checks = {
      ...(report.checks as object),
      upstream: {
        ok: false,
        kind,
        status: err instanceof UpstreamError ? err.status : undefined,
        detail: err instanceof Error ? err.message.slice(0, 300) : String(err),
      },
    };
    report.diagnosis = DIAGNOSIS[kind] ?? '알 수 없는 오류입니다. detail 을 확인하세요.';
    res.status(502).json(report);
  }
}

const DIAGNOSIS: Record<string, string> = {
  auth: 'API 키가 거부됐습니다. 키가 잘못됐거나, 삭제됐거나, 앞뒤에 공백·줄바꿈이 섞였습니다.',
  credit:
    'Anthropic 계정의 잔액 또는 사용 한도에 걸렸습니다. 콘솔의 Billing / Limits 를 확인하세요.',
  model: `모델 "${extractPrompt.model}" 을 이 계정에서 쓸 수 없습니다. 콘솔에서 사용 가능한 모델 이름을 확인해 api/_lib/prompts/*.ts 의 model 값을 바꾸세요.`,
  request: '요청 형식이 거부됐습니다. detail 을 확인하세요.',
  busy: 'Anthropic 쪽이 혼잡하거나 레이트리밋에 걸렸습니다. 잠시 뒤 다시 해보세요.',
  network: '서버에서 api.anthropic.com 에 연결하지 못했습니다.',
};
