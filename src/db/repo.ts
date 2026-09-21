import { db, newId, stamp } from './schema';
import type { WrongAnswer, ConceptCard, GeneratedQuestionRow, Attempt, Mastery } from './schema';
import type { DiagnoseResult, ExplainResult, ExtractResult, GeneratedQuestion } from '@shared/types';

/** 숙달 단계별 다음 복습까지의 간격(일). 설계 문서의 5단계 고정 간격. */
export const REVIEW_INTERVALS_DAYS = [0, 1, 3, 7, 16] as const;

const DAY = 24 * 60 * 60 * 1000;

// ─────────────────────────────── 오답

export async function saveWrongAnswer(
  extract: ExtractResult,
  grade: number,
  image: Blob | null,
  source: 'camera' | 'manual'
): Promise<string> {
  const row: WrongAnswer = stamp({
    subject: extract.subject,
    grade,
    questionNumber: extract.questionNumber,
    questionText: extract.questionText,
    choices: extract.choices,
    myAnswer: extract.myAnswer,
    correctAnswer: extract.correctAnswer,
    hasFigure: extract.hasFigure,
    image,
    conceptIds: [],
    primaryConceptId: null,
    errorType: null,
    errorExplanation: null,
    source,
    createdAt: Date.now(),
  });
  await db.wrongAnswers.add(row);
  return row.id;
}

export async function attachDiagnosis(id: string, d: DiagnoseResult): Promise<void> {
  await db.wrongAnswers.update(id, {
    conceptIds: d.conceptIds,
    primaryConceptId: d.primaryConceptId,
    errorType: d.errorType,
    errorExplanation: d.errorExplanation,
    updatedAt: Date.now(),
  });
}

export function getWrongAnswer(id: string): Promise<WrongAnswer | undefined> {
  return db.wrongAnswers.get(id);
}

export function recentWrongAnswers(limit = 20): Promise<WrongAnswer[]> {
  return db.wrongAnswers.orderBy('createdAt').reverse().limit(limit).toArray();
}

// ─────────────────────────────── 개념 카드

/** 카드는 개념당 하나다. 같은 개념을 또 틀려도 다시 만들지 않는다 — 비용이 선형으로 늘지 않게. */
export function getCard(conceptId: string): Promise<ConceptCard | undefined> {
  return db.conceptCards.where('conceptId').equals(conceptId).first();
}

export async function saveCard(conceptId: string, e: ExplainResult): Promise<ConceptCard> {
  const existing = await getCard(conceptId);
  if (existing) return existing;
  const row: ConceptCard = stamp({
    conceptId,
    summary: e.summary,
    keyPoint: e.keyPoint,
    exampleQuestion: e.example.question,
    exampleSolution: e.example.solution,
    commonMistake: e.commonMistake,
    checkQuestion: e.checkQuestion,
    createdAt: Date.now(),
  });
  await db.conceptCards.add(row);
  return row;
}

export function allCards(): Promise<ConceptCard[]> {
  return db.conceptCards.orderBy('createdAt').reverse().toArray();
}

// ─────────────────────────────── 문제 풀(pool)

/**
 * 아직 안 푼 문제. 2개 이상 남아 있으면 생성을 부르지 않는다.
 * 설계 문서의 "생성 비용 절약과의 균형" 절.
 */
export function unusedQuestions(conceptId: string): Promise<GeneratedQuestionRow[]> {
  return db.questions
    .where('conceptId')
    .equals(conceptId)
    .filter((q) => q.usedAt === null && q.deletedAt === null)
    .toArray();
}

export async function saveQuestions(
  conceptId: string,
  sourceWrongAnswerId: string | null,
  questions: GeneratedQuestion[]
): Promise<GeneratedQuestionRow[]> {
  const rows: GeneratedQuestionRow[] = questions.map((q) =>
    stamp({
      conceptId,
      sourceWrongAnswerId,
      level: q.level,
      questionText: q.questionText,
      choices: q.choices,
      answerIndex: q.answerIndex,
      hint: q.hint,
      solution: q.solution,
      usedAt: null,
      createdAt: Date.now(),
    })
  );
  await db.questions.bulkAdd(rows);
  return rows;
}

export async function questionTextsFor(conceptId: string): Promise<string[]> {
  const rows = await db.questions.where('conceptId').equals(conceptId).toArray();
  return rows.map((r) => r.questionText);
}

export function markUsed(questionId: string): Promise<number> {
  return db.questions.update(questionId, { usedAt: Date.now(), updatedAt: Date.now() });
}

// ─────────────────────────────── 풀이와 숙달

export async function recordAttempt(
  q: GeneratedQuestionRow,
  userAnswerIndex: number,
  elapsedMs: number,
  usedHint: boolean
): Promise<{ attempt: Attempt; mastery: Mastery }> {
  const isCorrect = userAnswerIndex === q.answerIndex;
  const attempt: Attempt = stamp({
    questionId: q.id,
    conceptId: q.conceptId,
    userAnswerIndex,
    isCorrect,
    elapsedMs,
    usedHint,
    attemptedAt: Date.now(),
  });
  await db.attempts.add(attempt);
  await markUsed(q.id);
  const mastery = await bumpMastery(q.conceptId, isCorrect);
  return { attempt, mastery };
}

/**
 * 맞히면 단계가 오르고, 틀리면 1 내려간다. 연속 두 번 틀리면 0으로 떨어진다.
 * 단계 진입 조건은 설계 문서의 표와 같다.
 */
async function bumpMastery(conceptId: string, isCorrect: boolean): Promise<Mastery> {
  const existing = await db.mastery.where('conceptId').equals(conceptId).first();
  const base: Mastery =
    existing ??
    stamp({
      conceptId,
      level: 0 as const,
      correctStreak: 0,
      wrongStreak: 0,
      totalAttempts: 0,
      totalWrong: 0,
      lastReviewedAt: null,
      nextDueAt: Date.now(),
    });

  const correctStreak = isCorrect ? base.correctStreak + 1 : 0;
  const wrongStreak = isCorrect ? 0 : base.wrongStreak + 1;

  let level = base.level;
  if (isCorrect) {
    // 0단계에서 1단계로 가려면 2문제를 맞혀야 한다 (유사문제 3개 중 2개)
    const need = level === 0 ? 2 : 1;
    if (correctStreak >= need) level = Math.min(4, level + 1) as Mastery['level'];
  } else {
    level = (wrongStreak >= 2 ? 0 : Math.max(0, level - 1)) as Mastery['level'];
  }

  const next: Mastery = {
    ...base,
    level,
    correctStreak: level > base.level ? 0 : correctStreak,
    wrongStreak,
    totalAttempts: base.totalAttempts + 1,
    totalWrong: base.totalWrong + (isCorrect ? 0 : 1),
    lastReviewedAt: Date.now(),
    nextDueAt: Date.now() + REVIEW_INTERVALS_DAYS[level] * DAY,
    updatedAt: Date.now(),
  };
  await db.mastery.put(next);
  return next;
}

export function getMastery(conceptId: string): Promise<Mastery | undefined> {
  return db.mastery.where('conceptId').equals(conceptId).first();
}

export function allMastery(): Promise<Mastery[]> {
  return db.mastery.toArray();
}

/** 홈 화면의 "오늘 복습 N개" — 큐 자체는 S4에서 만든다 */
export async function dueCount(now = Date.now()): Promise<number> {
  return db.mastery.where('nextDueAt').belowOrEqual(now).count();
}

// ─────────────────────────────── 내보내기

/**
 * 전체 데이터를 JSON으로. 2단계에서 계정을 붙일 때 이 형식을 그대로 올린다.
 * 이미지는 용량 때문에 뺀다.
 */
export async function exportAll(): Promise<string> {
  const [wrongAnswers, conceptCards, questions, attempts, mastery] = await Promise.all([
    db.wrongAnswers.toArray(),
    db.conceptCards.toArray(),
    db.questions.toArray(),
    db.attempts.toArray(),
    db.mastery.toArray(),
  ]);
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      wrongAnswers: wrongAnswers.map(({ image: _image, ...rest }) => rest),
      conceptCards,
      questions,
      attempts,
      mastery,
    },
    null,
    2
  );
}

export async function clearAll(): Promise<void> {
  await Promise.all([
    db.wrongAnswers.clear(),
    db.conceptCards.clear(),
    db.questions.clear(),
    db.attempts.clear(),
    db.mastery.clear(),
  ]);
}

export { newId };
