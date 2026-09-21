const GRADE_KEY = 'exam-prep:grade';

export function getGrade(): number {
  const raw = Number(localStorage.getItem(GRADE_KEY));
  return raw === 1 || raw === 2 || raw === 3 ? raw : 2;
}

export function setGrade(g: number): void {
  localStorage.setItem(GRADE_KEY, String(g));
}
