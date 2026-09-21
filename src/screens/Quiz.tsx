import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar, Loading, ErrorState, Progress, choiceNumber } from '@/components/ui';
import { Latex } from '@/components/Latex';
import { useFlow } from '@/lib/flow';
import { ensureQuestions } from '@/lib/prefetch';
import { recordAttempt } from '@/db/repo';
import { getConcept } from '@shared/concepts';
import { ApiError } from '@/lib/api';
import type { GeneratedQuestionRow } from '@/db/schema';

const LEVEL_LABEL: Record<string, string> = { easy: '몸풀기', same: '같은 난이도', hard: '한 단계 위' };

export function Quiz() {
  const navigate = useNavigate();
  const { state, patch } = useFlow();
  const { diagnosis, extract } = state;

  const [questions, setQuestions] = useState<GeneratedQuestionRow[]>(state.questions);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    if (!diagnosis) {
      navigate('/', { replace: true });
      return;
    }
    if (questions.length > 0) return;
    let alive = true;
    const p = state.questionsPromise ?? ensureQuestions(diagnosis, extract, state.wrongAnswerId);
    p.then((qs) => {
      if (!alive) return;
      setQuestions(qs);
      patch({ questions: qs });
    }).catch((err) => {
      if (alive) setError(err instanceof ApiError ? err.message : '문제를 만들지 못했어.');
    });
    return () => {
      alive = false;
    };
  }, [diagnosis, extract, questions.length, state.questionsPromise, state.wrongAnswerId, patch, navigate]);

  if (!diagnosis) return null;

  if (error) {
    return (
      <>
        <TopBar title="비슷한 문제" onBack />
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            patch({ questionsPromise: null });
          }}
        />
      </>
    );
  }

  if (questions.length === 0) {
    return (
      <>
        <TopBar title="비슷한 문제" onBack />
        <Loading title="문제 만드는 중" note="같은 개념을 다른 방식으로 묻는 문제를 만들고 있어." />
      </>
    );
  }

  const question = questions[index];
  const concept = getConcept(question.conceptId);

  function next(wasCorrect: boolean) {
    const nextCorrect = correctCount + (wasCorrect ? 1 : 0);
    setCorrectCount(nextCorrect);
    if (index + 1 < questions.length) {
      setIndex(index + 1);
    } else {
      navigate('/done', {
        replace: true,
        state: { correct: nextCorrect, total: questions.length },
      });
    }
  }

  return (
    <>
      <TopBar title={concept?.name ?? '비슷한 문제'} onBack />
      <div style={{ padding: '0 var(--gutter)' }}>
        <Progress total={questions.length} done={index} />
      </div>
      <QuestionView key={question.id} question={question} onNext={next} />
    </>
  );
}

type Phase = 'answering' | 'wrong' | 'solution' | 'correct';

function QuestionView({
  question,
  onNext,
}: {
  question: GeneratedQuestionRow;
  onNext: (wasCorrect: boolean) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('answering');
  const [steps, setSteps] = useState(0);
  const [usedHint, setUsedHint] = useState(false);
  const [retried, setRetried] = useState(false);
  const startedAt = useRef(Date.now());

  const locked = phase !== 'answering';

  async function submit() {
    if (selected === null) return;
    const isCorrect = selected === question.answerIndex;
    // 다시 풀기로 맞힌 것은 첫 시도의 결과로 기록한다 — 숙달도를 부풀리지 않는다
    if (!retried) {
      await recordAttempt(question, selected, Date.now() - startedAt.current, usedHint);
    }
    setPhase(isCorrect ? 'correct' : 'wrong');
  }

  function retry() {
    setRetried(true);
    setSelected(null);
    setPhase('answering');
  }

  return (
    <>
      <main className="screen">
        <span className="chip chip--muted" style={{ alignSelf: 'flex-start' }}>
          {LEVEL_LABEL[question.level] ?? question.level}
        </span>

        <div className="math-block" style={{ fontSize: 17, lineHeight: 1.7 }}>
          <Latex>{question.questionText}</Latex>
        </div>

        <div className="choices">
          {question.choices.map((c, i) => (
            <button
              key={i}
              className={`choice${choiceClass(i, selected, phase, question.answerIndex)}`}
              disabled={locked}
              onClick={() => setSelected(i)}
            >
              <span className="choice__num">{choiceNumber(i)}</span>
              <span className="grow">
                <Latex>{c}</Latex>
              </span>
            </button>
          ))}
        </div>

        {phase === 'answering' && usedHint ? (
          <div className="banner banner--info">
            <Latex>{question.hint}</Latex>
          </div>
        ) : null}

        {phase === 'wrong' ? (
          <div className="stack">
            <p className="verdict verdict--wrong">여기서 갈렸어</p>
            <div className="card card--flat">
              <p className="card__label">먼저 이것만</p>
              <p style={{ margin: 0 }}>
                <Latex>{question.hint}</Latex>
              </p>
            </div>
          </div>
        ) : null}

        {phase === 'correct' ? <p className="verdict verdict--correct">맞았어</p> : null}

        {(phase === 'solution' || phase === 'correct') && steps > 0 ? (
          <div className="card">
            <p className="card__label">풀이</p>
            <ol className="steps">
              {question.solution.slice(0, steps).map((s, i) => (
                <li key={i}>
                  <Latex>{s}</Latex>
                </li>
              ))}
            </ol>
            {steps < question.solution.length ? (
              <button
                className="btn btn--ghost"
                style={{ marginTop: 12 }}
                onClick={() => setSteps(steps + 1)}
              >
                다음 단계
              </button>
            ) : (
              <p className="muted" style={{ marginTop: 12 }}>
                정답: {choiceNumber(question.answerIndex)}{' '}
                <Latex>{question.choices[question.answerIndex]}</Latex>
              </p>
            )}
          </div>
        ) : null}
      </main>

      <div className="actionbar">
        {phase === 'answering' ? (
          <>
            <button className="btn btn--primary" disabled={selected === null} onClick={submit}>
              {selected === null ? '답을 골라줘' : '제출'}
            </button>
            {!usedHint ? (
              <button className="btn btn--quiet" onClick={() => setUsedHint(true)}>
                힌트 보기
              </button>
            ) : null}
          </>
        ) : phase === 'wrong' ? (
          <>
            {!retried ? (
              <button className="btn btn--primary" onClick={retry}>
                다시 풀어볼래
              </button>
            ) : null}
            <button
              className={retried ? 'btn btn--primary' : 'btn btn--ghost'}
              onClick={() => {
                setPhase('solution');
                setSteps(1);
              }}
            >
              풀이 보기
            </button>
          </>
        ) : (
          <>
            <button className="btn btn--primary" onClick={() => onNext(phase === 'correct')}>
              다음
            </button>
            {steps === 0 ? (
              <button className="btn btn--quiet" onClick={() => setSteps(1)}>
                풀이도 볼래
              </button>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function choiceClass(i: number, selected: number | null, phase: Phase, answer: number): string {
  if (phase === 'answering') return selected === i ? ' choice--selected' : '';
  if (i === answer && phase !== 'wrong') return ' choice--correct';
  if (i === selected && i !== answer) return ' choice--wrong';
  if (i === answer && phase === 'solution') return ' choice--correct';
  return '';
}
