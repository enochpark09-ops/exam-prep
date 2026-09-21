import { api } from './api';
import { getCard, saveCard, unusedQuestions, saveQuestions, questionTextsFor } from '@/db/repo';
import type { ConceptCard, GeneratedQuestionRow } from '@/db/schema';
import type { DiagnoseResult, ExtractResult } from '@shared/types';

/**
 * 개념 카드는 개념당 하나만 만든다. 같은 개념을 또 틀려도 다시 부르지 않는다 —
 * 비용이 오답 수에 비례해 늘지 않게 하는 가장 큰 장치.
 */
export async function ensureCard(
  diagnosis: DiagnoseResult,
  extract: ExtractResult | null
): Promise<ConceptCard> {
  const existing = await getCard(diagnosis.primaryConceptId);
  if (existing) return existing;

  const { data } = await api.explain({
    conceptId: diagnosis.primaryConceptId,
    questionText: extract?.questionText,
    myAnswer: extract?.myAnswer ?? null,
    correctAnswer: extract?.correctAnswer ?? null,
    errorType: diagnosis.errorType,
    errorExplanation: diagnosis.errorExplanation,
  });
  return saveCard(diagnosis.primaryConceptId, data);
}

/**
 * 안 푼 문제가 2개 이상 남아 있으면 생성하지 않는다.
 * 풀이 마를 때만 3개를 충전한다.
 */
export async function ensureQuestions(
  diagnosis: DiagnoseResult,
  extract: ExtractResult | null,
  wrongAnswerId: string | null
): Promise<GeneratedQuestionRow[]> {
  const conceptId = diagnosis.primaryConceptId;
  const pool = await unusedQuestions(conceptId);
  if (pool.length >= 2) return pickThree(pool);

  const { data } = await api.generate({
    conceptId,
    questionText: extract?.questionText,
    choices: extract?.choices,
    myAnswer: extract?.myAnswer ?? null,
    correctAnswer: extract?.correctAnswer ?? null,
    errorType: diagnosis.errorType,
    existingQuestions: await questionTextsFor(conceptId),
  });
  const saved = await saveQuestions(conceptId, wrongAnswerId, data.questions);
  return pickThree([...pool, ...saved]);
}

/** easy → same → hard 순으로, 있는 것만 */
function pickThree(pool: GeneratedQuestionRow[]): GeneratedQuestionRow[] {
  const order = { easy: 0, same: 1, hard: 2 } as const;
  return [...pool].sort((a, b) => order[a.level] - order[b.level]).slice(0, 3);
}
