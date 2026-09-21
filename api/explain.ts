import { withGuards, ok, fail, requireString, optionalString } from './_lib/http';
import { runPrompt } from './_lib/claude';
import { explainPrompt } from './_lib/prompts/explain';
import { fill } from './_lib/prompts/types';
import { getConcept } from '../shared/concepts';
import { checkExplain } from '../shared/checks';
import type { ExplainResult } from '../shared/types';

/**
 * POST /api/explain
 * body: { conceptId, questionText?, myAnswer?, correctAnswer?, errorType?, errorExplanation? }
 *
 * 개념 카드는 한 번 만들면 재사용한다. 같은 개념을 또 틀려도 다시 부르지 않는다.
 * (재사용 판단은 클라이언트의 db/repo.ts 가 한다.)
 */
export default withGuards('explain', async ({ body }, res) => {
  const conceptId = requireString(body, 'conceptId');
  const concept = getConcept(conceptId);
  if (!concept) {
    fail(res, 400, 'bad_request', `사전에 없는 개념 id: ${conceptId}`);
    return;
  }

  const result = await runPrompt<ExplainResult>(
    explainPrompt,
    fill(explainPrompt.user, {
      GRADE: concept.grade,
      CONCEPT_NAME: concept.name,
      CHAPTER: concept.chapter,
      UNIT: concept.unit,
      QUESTION_TEXT: optionalString(body, 'questionText'),
      MY_ANSWER: optionalString(body, 'myAnswer'),
      CORRECT_ANSWER: optionalString(body, 'correctAnswer'),
      ERROR_TYPE: optionalString(body, 'errorType'),
      ERROR_EXPLANATION: optionalString(body, 'errorExplanation'),
    })
  );

  const warnings = checkExplain(result.data);

  if (!result.data.keyPoint || !Array.isArray(result.data.summary)) {
    fail(res, 422, 'invalid_output', '정리 카드를 만들지 못했어. 다시 해보자.');
    return;
  }

  ok(res, result.data, warnings, {
    promptVersion: explainPrompt.version,
    elapsedMs: result.elapsedMs,
  });
});
