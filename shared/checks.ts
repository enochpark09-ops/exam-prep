/**
 * 생성 결과를 학생에게 보여주기 전에 거르는 기계 검사.
 * S0 검증 하네스(src/lib/checks.mjs)와 같은 규칙이다.
 * 각 함수는 문제점 문자열 배열을 돌려준다. 빈 배열이면 통과.
 */
import { ERROR_TYPES } from './types.js';
import type { ExtractResult, DiagnoseResult, ExplainResult, GenerateResult } from './types.js';

export function checkExtract(d: Partial<ExtractResult>): string[] {
  const p: string[] = [];
  for (const k of ['subject', 'questionText', 'choices', 'hasFigure', 'confidence'] as const) {
    if (!(k in d)) p.push(`필드 누락: ${k}`);
  }
  if (typeof d.questionText !== 'string' || d.questionText.trim().length < 5) {
    p.push('문제 본문이 너무 짧음');
  }
  if (!Array.isArray(d.choices)) p.push('choices가 배열이 아님');
  else if (d.choices.length > 0 && d.choices.length !== 5) {
    p.push(`보기 개수가 5개가 아님 (${d.choices.length}개)`);
  }
  for (const [field, v] of Object.entries(d.confidence ?? {})) {
    if (typeof v !== 'number' || v < 0 || v > 1) p.push(`confidence 값 이상: ${field}=${v}`);
  }
  if (typeof d.questionText === 'string') p.push(...checkLatex(d.questionText, '문제 본문'));
  return p;
}

export function checkDiagnose(d: Partial<DiagnoseResult>, conceptIds: Set<string>): string[] {
  const p: string[] = [];
  if (!d.primaryConceptId) p.push('primaryConceptId 없음');
  else if (!conceptIds.has(d.primaryConceptId)) p.push(`사전에 없는 개념 id: ${d.primaryConceptId}`);

  if (!Array.isArray(d.conceptIds)) p.push('conceptIds가 배열이 아님');
  else {
    if (d.conceptIds.length > 3) p.push(`conceptIds가 3개를 초과 (${d.conceptIds.length}개)`);
    for (const id of d.conceptIds) {
      if (!conceptIds.has(id)) p.push(`사전에 없는 개념 id: ${id}`);
    }
    if (d.primaryConceptId && !d.conceptIds.includes(d.primaryConceptId)) {
      p.push('primaryConceptId가 conceptIds에 포함되지 않음');
    }
  }
  if (!d.errorType || !ERROR_TYPES.includes(d.errorType)) p.push(`errorType 값 이상: ${d.errorType}`);
  if (typeof d.errorExplanation !== 'string' || d.errorExplanation.length > 60) {
    p.push('errorExplanation이 없거나 60자 초과');
  }
  return p;
}

export function checkExplain(d: Partial<ExplainResult>): string[] {
  const p: string[] = [];
  if (!Array.isArray(d.summary)) p.push('summary가 배열이 아님');
  else {
    if (d.summary.length > 5) p.push(`summary가 5줄 초과 (${d.summary.length}줄)`);
    d.summary.forEach((line, i) => {
      if (stripLatex(line).length > 55) p.push(`summary[${i}] 한 줄이 너무 김`);
    });
  }
  if (!d.keyPoint) p.push('keyPoint 없음');
  if (!d.example?.question) p.push('example.question 없음');
  if (!Array.isArray(d.example?.solution)) p.push('example.solution이 배열이 아님');
  else if (d.example.solution.length > 3) p.push('example.solution이 3단계 초과');
  if (!d.commonMistake) p.push('commonMistake 없음');
  if (!d.checkQuestion) p.push('checkQuestion 없음');

  for (const [label, text] of [
    ['keyPoint', d.keyPoint],
    ['example.question', d.example?.question],
    ['commonMistake', d.commonMistake],
  ] as const) {
    if (typeof text === 'string') p.push(...checkLatex(text, label));
  }
  return p;
}

export function checkGenerate(d: Partial<GenerateResult>, originalQuestionText = ''): string[] {
  const p: string[] = [];
  if (!Array.isArray(d.questions)) return ['questions가 배열이 아님'];
  if (d.questions.length !== 3) p.push(`문제가 3개가 아님 (${d.questions.length}개)`);

  const levels = d.questions.map((q) => q.level);
  for (const want of ['easy', 'same', 'hard'] as const) {
    if (!levels.includes(want)) p.push(`난이도 ${want} 누락`);
  }

  const answerIdxs: number[] = [];
  d.questions.forEach((q, i) => {
    const tag = `문제${i + 1}`;
    if (!q.questionText) p.push(`${tag}: 본문 없음`);
    if (!Array.isArray(q.choices) || q.choices.length !== 5) p.push(`${tag}: 보기가 5개가 아님`);
    else {
      const norm = q.choices.map((c) => String(c).replace(/\s/g, ''));
      if (new Set(norm).size !== norm.length) p.push(`${tag}: 보기에 중복이 있음`);
      if (typeof q.answerIndex !== 'number' || q.answerIndex < 0 || q.answerIndex > 4) {
        p.push(`${tag}: answerIndex가 0~4 범위를 벗어남`);
      } else {
        answerIdxs.push(q.answerIndex);
      }
    }
    if (!q.hint) p.push(`${tag}: hint 없음`);
    if (!Array.isArray(q.solution) || q.solution.length < 3) p.push(`${tag}: solution이 3단계 미만`);
    else if (q.solution.length > 5) p.push(`${tag}: solution이 5단계 초과`);

    if (q.questionText) {
      p.push(...checkLatex(q.questionText, tag));
      if (originalQuestionText && similarity(q.questionText, originalQuestionText) > 0.85) {
        p.push(`${tag}: 원문제와 거의 동일 (숫자만 바꾼 복제 의심)`);
      }
    }
  });

  if (answerIdxs.length === 3 && new Set(answerIdxs).size === 1) {
    p.push('정답 번호가 세 문제 모두 같음');
  }
  return p;
}

/** $...$ 짝이 맞는지, 흔한 LaTeX 깨짐이 없는지 */
export function checkLatex(text: string, label: string): string[] {
  if (typeof text !== 'string') return [];
  const p: string[] = [];
  const dollars = (text.match(/(?<!\\)\$/g) ?? []).length;
  if (dollars % 2 !== 0) p.push(`${label}: $ 개수가 홀수 — 수식이 닫히지 않음`);

  const braces = countUnescaped(text, '{') - countUnescaped(text, '}');
  if (braces !== 0) {
    p.push(
      `${label}: 중괄호 짝이 맞지 않음 (${braces > 0 ? '여는' : '닫는'} 쪽 ${Math.abs(braces)}개 초과)`
    );
  }
  for (const cmd of ['frac', 'sqrt']) {
    if (new RegExp(`\\\\${cmd}(?!\\s*[{[])`).test(text)) p.push(`${label}: \\${cmd} 뒤에 인자가 없음`);
  }
  return p;
}

function countUnescaped(s: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ch && s[i - 1] !== '\\') n++;
  return n;
}

function stripLatex(s: string): string {
  return String(s).replace(/\$[^$]*\$/g, '□');
}

/** 자카드 유사도 — 숫자를 지운 뒤 비교하므로 "숫자만 바꾼 복제"가 잡힌다 */
export function similarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      String(s)
        .replace(/[0-9]+/g, '#')
        .replace(/[^\p{L}\p{N}#]+/gu, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
    );
  const A = tok(a);
  const B = tok(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
