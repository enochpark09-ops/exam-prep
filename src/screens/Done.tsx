import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/ui';
import { useFlow } from '@/lib/flow';
import { getMastery, REVIEW_INTERVALS_DAYS } from '@/db/repo';
import { getConcept } from '@shared/concepts';
import type { Mastery } from '@/db/schema';

const LEVEL_TEXT = ['아직 낯설어', '익히는 중', '손에 잡힐 듯', '거의 다 왔어', '잡았어'];

export function Done() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, reset } = useFlow();
  const [mastery, setMastery] = useState<Mastery | null>(null);

  const result = (location.state ?? {}) as { correct?: number; total?: number };
  const correct = result.correct ?? 0;
  const total = result.total ?? 0;
  const conceptId = state.diagnosis?.primaryConceptId ?? null;
  const concept = conceptId ? getConcept(conceptId) : null;

  useEffect(() => {
    if (!conceptId) return;
    void getMastery(conceptId).then((m) => setMastery(m ?? null));
  }, [conceptId]);

  function finish(to: string) {
    reset();
    navigate(to, { replace: true });
  }

  const nextInDays = mastery ? REVIEW_INTERVALS_DAYS[mastery.level] : null;

  return (
    <>
      <TopBar title="끝" />

      <main className="screen">
        <div className="card">
          <p className="card__label">{concept?.name ?? '이 개념'}</p>
          <p className="h1">
            {total > 0 ? `${total}문제 중 ${correct}개 맞았어` : '풀이를 마쳤어'}
          </p>
          {mastery ? <p className="muted">{LEVEL_TEXT[mastery.level]}</p> : null}
        </div>

        {mastery ? (
          <div className="card card--flat">
            <p className="card__label">다음 복습</p>
            <p style={{ margin: 0, fontSize: 17 }}>
              {nextInDays === 0
                ? '오늘 안에 한 번 더 보자'
                : `${nextInDays}일 뒤에 이 개념을 다시 물어볼게`}
            </p>
            <p className="tiny" style={{ marginTop: 8 }}>
              같은 문제가 아니라 같은 개념을 묻는 새 문제로 나와.
            </p>
          </div>
        ) : null}

        {correct < total ? (
          <div className="banner banner--info">
            아직 헷갈리는 게 남았어. 정리 카드를 한 번 더 보고 가면 다음에 덜 걸려.
          </div>
        ) : null}
      </main>

      <div className="actionbar">
        <button className="btn btn--primary" onClick={() => finish('/capture')}>
          다음 문제 찍기
        </button>
        <button className="btn btn--ghost" onClick={() => navigate('/card')}>
          정리 다시 보기
        </button>
        <button className="btn btn--quiet" onClick={() => finish('/')}>
          오늘은 여기까지
        </button>
      </div>
    </>
  );
}
