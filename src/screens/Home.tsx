import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { dueCount, recentWrongAnswers, exportAll } from '@/db/repo';
import { getConcept } from '@shared/concepts';
import { getGrade, setGrade } from '@/lib/settings';
import { useFlow } from '@/lib/flow';
import { useState } from 'react';

export function Home() {
  const navigate = useNavigate();
  const { reset } = useFlow();
  const [grade, setGradeState] = useState(getGrade);

  const due = useLiveQuery(() => dueCount(), [], 0);
  const recent = useLiveQuery(() => recentWrongAnswers(5), [], []);
  const conceptsHeld = useLiveQuery(
    () => db.mastery.where('level').aboveOrEqual(3).count(),
    [],
    0
  );
  const totalConcepts = useLiveQuery(() => db.mastery.count(), [], 0);

  function changeGrade(g: number) {
    setGrade(g);
    setGradeState(g);
  }

  function startCapture() {
    reset();
    navigate('/capture');
  }

  async function handleExport() {
    const json = await exportAll();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam-prep-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">오답노트</h1>
        <button className="topbar__btn" onClick={handleExport} aria-label="내보내기">
          내보내기
        </button>
      </header>

      <main className="screen">
        <div className="card">
          <p className="card__label">지금까지</p>
          <p className="h1">개념 {conceptsHeld}개 잡음</p>
          <p className="muted">
            {totalConcepts === 0
              ? '틀린 문제를 찍으면 여기에 쌓여.'
              : `건드린 개념 ${totalConcepts}개 중에서.`}
          </p>
        </div>

        {due > 0 ? (
          // 복습 큐 자체는 S4에서 붙인다. 지금은 몇 개가 밀렸는지만 보여준다.
          <div className="banner banner--info">
            복습할 개념이 {due}개 쌓였어. 복습 큐는 다음 단계에서 붙어.
          </div>
        ) : (
          <div className="banner banner--info">
            {totalConcepts === 0
              ? '아직 복습할 게 없어. 틀린 문제부터 넣어보자.'
              : '오늘 복습할 건 없어. 새 오답을 넣거나 쉬어도 돼.'}
          </div>
        )}

        <div className="field">
          <span className="field__label">학년</span>
          <div className="row">
            {[1, 2, 3].map((g) => (
              <button
                key={g}
                className={`chip ${grade === g ? 'chip--on' : 'chip--muted'}`}
                onClick={() => changeGrade(g)}
                aria-pressed={grade === g}
                style={{ flex: 1, justifyContent: 'center', minHeight: 44, cursor: 'pointer' }}
              >
                중{g}
              </button>
            ))}
          </div>
        </div>

        {recent.length > 0 ? (
          <section className="stack">
            <h2 className="h2">최근에 넣은 문제</h2>
            {recent.map((w) => {
              const c = w.primaryConceptId ? getConcept(w.primaryConceptId) : null;
              return (
                <div key={w.id} className="card card--flat">
                  <div className="row row--between">
                    <span className="chip">{c ? c.name : '진단 전'}</span>
                    <span className="tiny">{formatDay(w.createdAt)}</span>
                  </div>
                  <p className="muted" style={{ marginTop: 8 }}>
                    {truncate(w.questionText, 60)}
                  </p>
                </div>
              );
            })}
          </section>
        ) : null}

        <p className="tiny" style={{ textAlign: 'center', marginTop: 'auto', paddingTop: 24 }}>
          v{__APP_VERSION__}
          {__APP_COMMIT__ ? ` · ${__APP_COMMIT__}` : ''}
        </p>
      </main>

      <div className="actionbar">
        <button className="btn btn--primary" onClick={startCapture}>
          틀린 문제 찍기
        </button>
      </div>
    </>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const days = Math.floor((today.setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
