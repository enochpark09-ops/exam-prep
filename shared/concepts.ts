import g1 from './concepts/math-g1.json';
import g2 from './concepts/math-g2.json';
import g3 from './concepts/math-g3.json';

export interface Concept {
  id: string;
  subject: string;
  grade: number;
  chapter: string;
  unit: string;
  name: string;
  keywords: string[];
  prereq: string[];
}

interface ConceptFile {
  subject: string;
  grade: number;
  version: string;
  concepts: Array<Omit<Concept, 'subject' | 'grade'>>;
}

const files = [g1, g2, g3] as unknown as ConceptFile[];

export const CONCEPTS: Concept[] = files.flatMap((f) =>
  f.concepts.map((c) => ({ ...c, subject: f.subject, grade: f.grade }))
);

export const CONCEPT_BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));

export function getConcept(id: string): Concept | undefined {
  return CONCEPT_BY_ID.get(id);
}

/**
 * 진단 프롬프트에 넣을 개념 목록.
 * 해당 학년과 그 아래 학년을 모두 포함한다 — 오답의 원인이 선수 개념일 수 있으므로.
 */
export function conceptListText(subject: string, grade: number): string {
  const pool = CONCEPTS.filter((c) => c.subject === subject && c.grade <= grade);
  const groups = new Map<string, Concept[]>();
  for (const c of pool) {
    const key = `중${c.grade} · ${c.chapter} > ${c.unit}`;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }
  const lines: string[] = [];
  for (const [heading, items] of groups) {
    lines.push(`### ${heading}`);
    for (const c of items) lines.push(`- ${c.id} | ${c.name} | ${c.keywords.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

export const SUBJECTS = ['수학'] as const;
