import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar, Loading, choiceNumber } from '@/components/ui';
import { Latex } from '@/components/Latex';
import { api, ApiError } from '@/lib/api';
import { useFlow } from '@/lib/flow';
import { getGrade } from '@/lib/settings';
import { saveWrongAnswer, attachDiagnosis } from '@/db/repo';
import { CONFIDENCE_THRESHOLD } from '@shared/types';
import type { ExtractResult } from '@shared/types';

const BLANK: ExtractResult = {
  subject: '수학',
  questionNumber: null,
  questionText: '',
  choices: [],
  myAnswer: null,
  correctAnswer: null,
  hasFigure: false,
  figureDescription: null,
  multipleQuestions: false,
  confidence: { questionText: 1, choices: 1, myAnswer: 1, correctAnswer: 1 },
  issues: [],
};

/**
 * 판독 검수 화면. 직접 입력(/manual)도 같은 화면을 빈 상태로 쓴다.
 *
 * 학생이 반드시 확정해야 하는 것은 두 가지 — 내 답과 정답.
 * 문제 본문은 사소한 오탈자가 있어도 넘어갈 수 있게 둔다. 흐름을 막지 않는다.
 */
export function Verify({ manual = false }: { manual?: boolean }) {
  const navigate = useNavigate();
  const { state, patch } = useFlow();
  const source = manual ? BLANK : state.extract ?? BLANK;

  const [questionText, setQuestionText] = useState(source.questionText);
  const [choices, setChoices] = useState<string[]>(source.choices);
  const [myAnswer, setMyAnswer] = useState<number | null>(indexOf(source.myAnswer, source.choices));
  const [correctAnswer, setCorrect] = useState<number | null>(
    indexOf(source.correctAnswer, source.choices)
  );
  const [myAnswerText, setMyAnswerText] = useState(source.choices.length ? '' : source.myAnswer ?? '');
  const [correctText, setCorrectText] = useState(
    source.choices.length ? '' : source.correctAnswer ?? ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const objective = choices.length === 5;
  const lowConfidence = useMemo(
    () =>
      new Set(
        Object.entries(source.confidence)
          .filter(([, v]) => v < CONFIDENCE_THRESHOLD)
          .map(([k]) => k)
      ),
    [source.confidence]
  );

  const answersReady = objective
    ? correctAnswer !== null
    : correctText.trim().length > 0;
  const ready = questionText.trim().length >= 5 && answersReady && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    const grade = getGrade();

    const finalExtract: ExtractResult = {
      ...source,
      questionText: questionText.trim(),
      choices,
      myAnswer: objective
        ? myAnswer !== null
          ? choices[myAnswer]
          : null
        : myAnswerText.trim() || null,
      correctAnswer: objective
        ? correctAnswer !== null
          ? choices[correctAnswer]
          : null
        : correctText.trim() || null,
    };

    try {
      const wrongAnswerId = await saveWrongAnswer(
        finalExtract,
        grade,
        state.imageBlob,
        manual ? 'manual' : 'camera'
      );

      const { data: diagnosis } = await api.diagnose({
        grade,
        subject: finalExtract.subject,
        questionText: finalExtract.questionText,
        choices: finalExtract.choices,
        myAnswer: finalExtract.myAnswer,
        correctAnswer: finalExtract.correctAnswer,
      });
      await attachDiagnosis(wrongAnswerId, diagnosis);

      patch({ grade, extract: finalExtract, wrongAnswerId, diagnosis });
      navigate('/diagnosis', { replace: true });
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : '저장하다 막혔어. 다시 해보자.');
    }
  }

  if (busy) {
    return (
      <>
        <TopBar title="확인" />
        <Loading title="어떤 개념인지 보는 중" note="이 문제가 요구하는 개념을 찾고 있어." />
      </>
    );
  }

  return (
    <>
      <TopBar title={manual ? '직접 입력' : '맞게 읽었는지 확인'} onBack />

      <main className="screen">
        {state.imageDataUrl && !manual ? (
          <img className="thumb" src={state.imageDataUrl} alt="가져온 문제" />
        ) : null}

        {source.multipleQuestions ? (
          <div className="banner banner--warn">
            한 장에 문제가 여러 개인 것 같아. 첫 번째 문제만 가져왔어.
          </div>
        ) : null}

        {source.hasFigure ? (
          <div className="banner banner--info">
            그림이 있는 문제야. 그림은 사진으로 보관하고, 유사문제는 그림 없이 풀리는 형태로 나와.
          </div>
        ) : null}

        <div className="field">
          <span className="field__label">문제</span>
          <textarea
            className={`textarea${lowConfidence.has('questionText') ? ' textarea--low' : ''}`}
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="문제 본문을 입력해줘"
          />
          {questionText ? (
            <div className="card card--flat math-block">
              <Latex>{questionText}</Latex>
            </div>
          ) : null}
        </div>

        {objective ? (
          <>
            <div className="field">
              <span className="field__label">내가 쓴 답</span>
              <div className="choices">
                {choices.map((c, i) => (
                  <button
                    key={i}
                    className={`choice${myAnswer === i ? ' choice--selected' : ''}`}
                    onClick={() => setMyAnswer(myAnswer === i ? null : i)}
                  >
                    <span className="choice__num">{choiceNumber(i)}</span>
                    <span className="grow">
                      <Latex>{c}</Latex>
                    </span>
                  </button>
                ))}
              </div>
              {myAnswer === null ? (
                <span className="tiny">안 썼으면 비워둬도 돼.</span>
              ) : null}
            </div>

            <div className="field">
              <span className="field__label">정답</span>
              {lowConfidence.has('correctAnswer') ? (
                <span className="field__hint">정답을 확실히 못 읽었어. 직접 골라줘.</span>
              ) : null}
              <div className="choices">
                {choices.map((c, i) => (
                  <button
                    key={i}
                    className={`choice${correctAnswer === i ? ' choice--correct' : ''}`}
                    onClick={() => setCorrect(i)}
                  >
                    <span className="choice__num">{choiceNumber(i)}</span>
                    <span className="grow">
                      <Latex>{c}</Latex>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {choices.length > 0 && choices.length !== 5 ? (
              <div className="banner banner--warn">
                보기를 {choices.length}개만 읽었어. 주관식으로 처리할게.
                <button
                  className="btn btn--quiet"
                  style={{ marginTop: 4 }}
                  onClick={() => setChoices([])}
                >
                  보기 지우기
                </button>
              </div>
            ) : null}
            <div className="field">
              <span className="field__label">내가 쓴 답</span>
              <input
                className="input"
                value={myAnswerText}
                onChange={(e) => setMyAnswerText(e.target.value)}
                placeholder="비워둬도 돼"
              />
            </div>
            <div className="field">
              <span className="field__label">정답</span>
              <input
                className={`input${lowConfidence.has('correctAnswer') ? ' input--low' : ''}`}
                value={correctText}
                onChange={(e) => setCorrectText(e.target.value)}
                placeholder="정답을 입력해줘"
              />
            </div>
          </>
        )}

        {source.issues.length > 0 ? (
          <p className="tiny">읽기 어려웠던 곳: {source.issues.join(', ')}</p>
        ) : null}

        {error ? <div className="banner banner--warn">{error}</div> : null}
      </main>

      <div className="actionbar">
        <button className="btn btn--primary" disabled={!ready} onClick={submit}>
          {ready ? '이게 맞아' : '정답을 골라줘'}
        </button>
      </div>
    </>
  );
}

function indexOf(answer: string | null, choices: string[]): number | null {
  if (!answer || choices.length === 0) return null;
  const norm = (s: string) => s.replace(/\s/g, '');
  const byText = choices.findIndex((c) => norm(c) === norm(answer));
  if (byText !== -1) return byText;
  // "3", "③" 처럼 번호로 적힌 경우
  const circled = '①②③④⑤'.indexOf(answer.trim());
  if (circled !== -1) return circled;
  const n = Number(answer.trim());
  if (Number.isInteger(n) && n >= 1 && n <= choices.length) return n - 1;
  return null;
}
