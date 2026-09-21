import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar, Loading, ErrorState } from '@/components/ui';
import { Latex } from '@/components/Latex';
import { useFlow } from '@/lib/flow';
import { ensureCard, ensureQuestions } from '@/lib/prefetch';
import { getConcept } from '@shared/concepts';
import { ApiError } from '@/lib/api';
import type { ConceptCard } from '@/db/schema';

export function Card() {
  const navigate = useNavigate();
  const { state, patch } = useFlow();
  const { diagnosis, extract } = state;
  const [card, setCard] = useState<ConceptCard | null>(state.card);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosis) {
      navigate('/', { replace: true });
      return;
    }
    if (card) return;
    let alive = true;
    const p = state.cardPromise ?? ensureCard(diagnosis, extract);
    p.then((c) => {
      if (!alive) return;
      setCard(c);
      patch({ card: c });
    }).catch((err) => {
      if (alive) setError(err instanceof ApiError ? err.message : '정리를 불러오지 못했어.');
    });
    return () => {
      alive = false;
    };
  }, [diagnosis, extract, card, state.cardPromise, patch, navigate]);

  // 카드를 읽는 동안 유사문제를 미리 만든다
  useEffect(() => {
    if (!card || !diagnosis || state.questionsPromise) return;
    patch({ questionsPromise: ensureQuestions(diagnosis, extract, state.wrongAnswerId) });
  }, [card, diagnosis, extract, state.questionsPromise, state.wrongAnswerId, patch]);

  if (!diagnosis) return null;

  if (error) {
    return (
      <>
        <TopBar title="개념 정리" onBack />
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            patch({ cardPromise: null });
          }}
        />
      </>
    );
  }

  if (!card) {
    return (
      <>
        <TopBar title="개념 정리" onBack />
        <Loading title="정리하는 중" note="이 개념을 다섯 줄로 줄이고 있어." />
      </>
    );
  }

  const concept = getConcept(card.conceptId);

  return (
    <>
      <TopBar title={concept?.name ?? '개념 정리'} onBack />

      <main className="screen">
        <div className="card">
          <p className="card__label">한 줄로</p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.55 }}>
            <Latex>{card.keyPoint}</Latex>
          </p>
        </div>

        <div className="card">
          <p className="card__label">정리</p>
          <ul className="summary-list">
            {card.summary.map((line, i) => (
              <li key={i}>
                <Latex>{line}</Latex>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <p className="card__label">예시</p>
          <div className="math-block" style={{ marginBottom: 12, fontWeight: 500 }}>
            <Latex>{card.exampleQuestion}</Latex>
          </div>
          <ol className="steps">
            {card.exampleSolution.map((s, i) => (
              <li key={i}>
                <Latex>{s}</Latex>
              </li>
            ))}
          </ol>
        </div>

        <div className="card" style={{ borderColor: 'var(--wrong)' }}>
          <p className="card__label" style={{ color: 'var(--wrong)' }}>
            네가 갈린 곳
          </p>
          <p style={{ margin: 0, lineHeight: 1.65 }}>
            <Latex>{card.commonMistake}</Latex>
          </p>
        </div>

        <div className="card card--flat">
          <p className="card__label">이거 답할 수 있으면 이해한 거야</p>
          <p style={{ margin: 0 }}>
            <Latex>{card.checkQuestion}</Latex>
          </p>
        </div>
      </main>

      <div className="actionbar">
        <button className="btn btn--primary" onClick={() => navigate('/quiz')}>
          비슷한 문제 풀어보기
        </button>
      </div>
    </>
  );
}
