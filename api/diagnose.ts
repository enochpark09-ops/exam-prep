import { withGuards, ok, fail, requireString, optionalString } from './_lib/http';
import { runPrompt } from './_lib/claude';
import { diagnosePrompt } from './_lib/prompts/diagnose';
import { fill } from './_lib/prompts/types';
import { conceptListText, CONCEPT_BY_ID } from '../shared/concepts';
import { checkDiagnose } from '../shared/checks';
import type { DiagnoseResult } from '../shared/types';

const CONCEPT_IDS = new Set(CONCEPT_BY_ID.keys());

/**
 * POST /api/diagnose
 * body: { grade, subject?, questionText, choices?, myAnswer?, correctAnswer? }
 */
export default withGuards('diagnose', async ({ body }, res) => {
  const questionText = requireString(body, 'questionText');
  const grade = Number(body.grade);
  if (!Number.isInteger(grade) || grade < 1 || grade > 3) {
    fail(res, 400, 'bad_request', 'grade는 1~3이어야 합니다');
    return;
  }
  const subject = optionalString(body, 'subject') ?? '수학';
  const choices = Array.isArray(body.choices) ? (body.choices as string[]) : [];

  const result = await runPrompt<DiagnoseResult>(
    diagnosePrompt,
    fill(diagnosePrompt.user, {
      CONCEPT_LIST: conceptListText(subject, grade),
      GRADE: grade,
      QUESTION_TEXT: questionText,
      CHOICES: choices.length ? choices.join(' / ') : '(주관식)',
      MY_ANSWER: optionalString(body, 'myAnswer'),
      CORRECT_ANSWER: optionalString(body, 'correctAnswer'),
    })
  );

  const warnings = checkDiagnose(result.data, CONCEPT_IDS);

  // 개념을 못 찾으면 이후 단계가 전부 무의미하다. 여기서 끊는다.
  if (!CONCEPT_BY_ID.has(result.data.primaryConceptId)) {
    console.error('[diagnose] 사전에 없는 개념', result.data.primaryConceptId, result.data.proposedNew);
    fail(res, 422, 'invalid_output', '이 문제의 개념을 특정하지 못했어. 문제 내용을 확인해보자.');
    return;
  }

  ok(res, result.data, warnings, {
    promptVersion: diagnosePrompt.version,
    elapsedMs: result.elapsedMs,
  });
});
