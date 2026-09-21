import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { ErrorType, Level } from '@shared/types';

/**
 * 1단계는 전부 이 기기 안에서만 산다. 로그인도 서버 DB도 없다.
 *
 * 다만 처음부터 서버로 옮길 수 있게 둔다 — 모든 레코드에 UUID와 updatedAt,
 * 지울 때는 실제 삭제 대신 deletedAt. 2단계에서 계정을 붙일 때 그대로 올리면 된다.
 */

export interface Base {
  id: string;
  updatedAt: number;
  deletedAt: number | null;
}

export interface WrongAnswer extends Base {
  subject: string;
  grade: number;
  questionNumber: string | null;
  questionText: string;
  choices: string[];
  myAnswer: string | null;
  correctAnswer: string | null;
  hasFigure: boolean;
  /** 원본 사진. 판독이 틀렸을 때 학생이 돌아가 볼 수 있어야 한다. */
  image: Blob | null;
  conceptIds: string[];
  primaryConceptId: string | null;
  errorType: ErrorType | null;
  errorExplanation: string | null;
  source: 'camera' | 'manual';
  createdAt: number;
}

/** 개념 사전은 정적 JSON이고, 이 테이블은 그 개념에 붙은 '카드 본문'만 들고 있다 */
export interface ConceptCard extends Base {
  conceptId: string;
  summary: string[];
  keyPoint: string;
  exampleQuestion: string;
  exampleSolution: string[];
  commonMistake: string;
  checkQuestion: string;
  createdAt: number;
}

export interface GeneratedQuestionRow extends Base {
  conceptId: string;
  sourceWrongAnswerId: string | null;
  level: Level;
  questionText: string;
  choices: string[];
  answerIndex: number;
  hint: string;
  solution: string[];
  /** 이미 풀린 문제는 풀에서 빠진다 */
  usedAt: number | null;
  createdAt: number;
}

export interface Attempt extends Base {
  questionId: string;
  conceptId: string;
  userAnswerIndex: number;
  isCorrect: boolean;
  elapsedMs: number;
  /** 정답 보기 전에 힌트를 봤는지 — 나중에 숙달 판정을 다듬을 때 쓴다 */
  usedHint: boolean;
  attemptedAt: number;
}

/**
 * 숙달 상태. 복습 큐(S4)가 이 테이블을 읽는다.
 * S3 범위에서는 쓰기만 하고, 홈 화면이 개수를 세는 데만 쓴다.
 */
export interface Mastery extends Base {
  conceptId: string;
  level: 0 | 1 | 2 | 3 | 4;
  correctStreak: number;
  wrongStreak: number;
  totalAttempts: number;
  totalWrong: number;
  lastReviewedAt: number | null;
  nextDueAt: number;
}

export class ExamPrepDb extends Dexie {
  wrongAnswers!: Table<WrongAnswer, string>;
  conceptCards!: Table<ConceptCard, string>;
  questions!: Table<GeneratedQuestionRow, string>;
  attempts!: Table<Attempt, string>;
  mastery!: Table<Mastery, string>;

  constructor() {
    super('exam-prep');
    this.version(1).stores({
      wrongAnswers: 'id, createdAt, primaryConceptId, subject, deletedAt',
      conceptCards: 'id, &conceptId, createdAt, deletedAt',
      questions: 'id, conceptId, usedAt, sourceWrongAnswerId, deletedAt',
      attempts: 'id, questionId, conceptId, attemptedAt',
      mastery: 'id, &conceptId, nextDueAt, level',
    });
  }
}

export const db = new ExamPrepDb();

export function newId(): string {
  return crypto.randomUUID();
}

export function stamp<T extends object>(o: T): T & Base {
  return { id: newId(), updatedAt: Date.now(), deletedAt: null, ...o } as T & Base;
}
