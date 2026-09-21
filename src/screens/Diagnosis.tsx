import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/ui';
import { Latex } from '@/components/Latex';
import { useFlow } from '@/lib/flow';
import { ensureCard } from '@/lib/prefetch';
import { getConcept } from '@shared/concepts';

export function Diagnosis() {
  const navigate = useNavigate();
  const { state, patch } = useFlow();
  const { diagnosis, extract } = state;

  // 학생이 이 화면을 읽는 동안 카드를 미리 받아둔다 — 대기 시간이 학습 시간 밑에 숨는다
  useEffect(() => {
    if (!diagnosis || state.cardPromise) return;
    patch({ cardPromise: ensureCard(diagnosis, extract) });
  }, [diagnosis, extract, state.cardPromise, patch]);

  useEffect(() => {
    if (!diagnosis) navigate('/', { replace: true });
  }, [diagnosis, navigate]);

  if (!diagnosis) return null;

  const primary = getConcept(diagnosis.primaryConceptId);
  const others = diagnosis.conceptIds
    .filter((id) => id !== diagnosis.primaryConceptId)
    .map(getConcept)
    .filter(Boolean);

  return (
    <>
      <TopBar title="진단" />

      <main className="screen">
        <div className="card">
          <p className="card__label">이 문제가 묻는 건</p>
          <p className="h1">{primary?.name ?? diagnosis.primaryConceptId}</p>
          <p className="muted">
            중{primary?.grade} · {primary?.chapter} &gt; {primary?.unit}
          </p>
        </div>

        <div className="card card--flat">
          <p className="card__label">{diagnosis.errorType}</p>
          <p style={{ margin: 0, fontSize: 17 }}>{diagnosis.errorExplanation}</p>
        </div>

        {others.length > 0 ? (
          <div className="stack">
            <span className="field__label">같이 쓰이는 개념</span>
            <div className="chips">
              {others.map((c) => (
                <span key={c!.id} className="chip chip--muted">
                  {c!.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {extract ? (
          <div className="card card--flat">
            <p className="card__label">틀린 문제</p>
            <div className="math-block">
              <Latex>{extract.questionText}</Latex>
            </div>
            <div className="row" style={{ marginTop: 12, gap: 16 }}>
              <span className="tiny">내 답: {extract.myAnswer ?? '—'}</span>
              <span className="tiny">정답: {extract.correctAnswer ?? '—'}</span>
            </div>
          </div>
        ) : null}
      </main>

      <div className="actionbar">
        <button className="btn btn--primary" onClick={() => navigate('/card')}>
          이 개념 정리 보기
        </button>
        <button className="btn btn--quiet" onClick={() => navigate('/')}>
          나중에 할래
        </button>
      </div>
    </>
  );
}
