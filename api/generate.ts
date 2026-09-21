import { withGuards, ok, fail, requireString, optionalString } from './_lib/http';
import { runPrompt } from './_lib/claude';
import { generatePrompt } from './_lib/prompts/generate';
import { fill } from './_lib/prompts/types';
import { getConcept } from '../shared/concepts';
import { checkGenerate } from '../shared/checks';
import type { GenerateResult, GeneratedQuestion } from '../shared/types';

/**
 * POST /api/generate
 * body: { conceptId, questionText?, choices?, myAnswer?, correctAnswer?, errorType?, existingQuestions? }
 *
 * 응답을 바로 내보내지 않고 기계 검사를 거친다. 걸리면 1회만 재생성하고,
 * 그래도 실패하면 통과한 문제만 내보낸다. 3개를 채우는 것보다 이상한 문제를
 * 학생에게 보여주지 않는 쪽이 낫다.
 */
export default withGuards('generate', async ({ body }, res) => {
  const conceptId = requireString(body, 'conceptId');
  const concept = getConcept(conceptId);
  if (!concept) {
    fail(res, 400, 'bad_request', `사전에 없는 개념 id: ${conceptId}`);
    return;
  }

  const original = optionalString(body, 'questionText') ?? '';
  const choices = Array.isArray(body.choices) ? (body.choices as string[]) : [];
  const existing = Array.isArray(body.existingQuestions) ? (body.existingQuestions as string[]) : [];

  const vars = {
    GRADE: concept.grade,
    CONCEPT_NAME: concept.name,
    CHAPTER: concept.chapter,
    UNIT: concept.unit,
    KEYWORDS: concept.keywords,
    QUESTION_TEXT: original,
    CHOICES: choices.length ? choices.join(' / ') : '(주관식)',
    MY_ANSWER: optionalString(body, 'myAnswer'),
    CORRECT_ANSWER: optionalString(body, 'correctAnswer'),
    ERROR_TYPE: optionalString(body, 'errorType'),
    EXISTING_QUESTIONS: existing.length ? existing.map((q) => `- ${q}`).join('\n') : '(없음)',
  };

  let elapsed = 0;
  let attempts = 0;
  let best: { questions: GeneratedQuestion[]; warnings: string[] } | null = null;

  for (let i = 0; i < 2; i++) {
    attempts += 1;
    const result = await runPrompt<GenerateResult>(
      generatePrompt,
      fill(generatePrompt.user, vars)
    );
    elapsed += result.elapsedMs;

    const warnings = checkGenerate(result.data, original);
    if (warnings.length === 0) {
      ok(res, result.data, [], { promptVersion: generatePrompt.version, elapsedMs: elapsed });
      return;
    }
    // 더 나은 쪽을 들고 있는다
    if (!best || warnings.length < best.warnings.length) {
      best = { questions: result.data.questions ?? [], warnings };
    }
  }

  // 두 번 다 걸렸다 — 문제별로 다시 검사해서 통과한 것만 내보낸다
  const survivors = (best?.questions ?? []).filter(
    (q) => checkGenerate({ questions: [q, q, q] }, original).filter(isPerQuestion).length === 0
  );

  if (survivors.length === 0) {
    console.error('[generate] 전량 탈락', conceptId, best?.warnings);
    fail(res, 422, 'invalid_output', '문제를 만들다 막혔어. 다시 한 번 눌러보자.');
    return;
  }

  ok(res, { questions: survivors }, best?.warnings ?? [], {
    promptVersion: generatePrompt.version,
    elapsedMs: elapsed,
  });
  console.warn(`[generate] ${attempts}회 시도 후 ${survivors.length}/3 통과`, conceptId);
});

/** 문제 단위 검사에서만 의미 있는 경고인지 — 세트 단위 규칙(난이도 구성 등)은 제외 */
function isPerQuestion(warning: string): boolean {
  return warning.startsWith('문제');
}
