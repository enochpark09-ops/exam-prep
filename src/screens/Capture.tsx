import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar, ErrorState } from '@/components/ui';
import { prepareImage } from '@/lib/image';
import { api, ApiError } from '@/lib/api';
import { useFlow } from '@/lib/flow';
import { getGrade } from '@/lib/settings';

type Phase = 'idle' | 'preparing' | 'reading' | 'error';

export function Capture() {
  const navigate = useNavigate();
  const { patch } = useFlow();
  // 카메라와 앨범은 input 을 따로 둔다 — capture 속성이 붙어 있으면
  // 모바일에서 앨범을 못 열고 바로 카메라로 넘어간다.
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const lastSource = useRef<'camera' | 'library'>('camera');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setPhase('preparing');
    try {
      const img = await prepareImage(file);
      // 판독을 기다리는 동안 원본을 바로 띄운다 — 빈 화면을 보여주지 않는다
      setPreview(img.dataUrl);
      setPhase('reading');

      const { data, warnings } = await api.extract(img.dataUrl);
      patch({
        grade: getGrade(),
        imageDataUrl: img.dataUrl,
        imageBlob: img.blob,
        extract: data,
        extractWarnings: warnings,
      });
      navigate('/verify', { replace: true });
    } catch (err) {
      setPhase('error');
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : '사진을 처리하지 못했어.'
      );
    }
  }

  function pick(source: 'camera' | 'library') {
    lastSource.current = source;
    (source === 'camera' ? cameraRef : libraryRef).current?.click();
  }

  function retry() {
    setPhase('idle');
    setError(null);
    setPreview(null);
    pick(lastSource.current);
  }

  return (
    <>
      <TopBar title="틀린 문제 넣기" onBack />

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />

      {phase === 'error' ? (
        <ErrorState message={error ?? '문제가 생겼어.'} onRetry={retry} retryLabel="다시 해보기">
          <p className="muted" style={{ maxWidth: 320 }}>
            밝은 곳에서, 문제 한 개가 화면에 꽉 차게 찍으면 잘 읽혀.
          </p>
          <button className="btn btn--quiet" onClick={() => pick('library')}>
            앨범에서 고를래
          </button>
          <button className="btn btn--quiet" onClick={() => navigate('/manual')}>
            직접 입력할래
          </button>
        </ErrorState>
      ) : phase === 'idle' ? (
        <>
          <main className="screen">
            <div className="card">
              <p className="card__label">이런 사진이 잘 읽혀</p>
              <ul className="summary-list">
                <li>한 장에 문제 한 개</li>
                <li>밝은 곳에서, 그림자 없이</li>
                <li>내가 쓴 답과 정답이 같이 보이게</li>
              </ul>
            </div>
            <p className="muted">
              이미 찍어둔 사진이나 캡처한 화면도 앨범에서 고르면 돼.
            </p>
            <p className="muted">
              사진은 이 기기에만 저장돼. 판독할 때만 서버를 거치고 따로 보관하지 않아.
            </p>
          </main>
          <div className="actionbar">
            <button className="btn btn--primary" onClick={() => pick('camera')}>
              사진 찍기
            </button>
            <button className="btn btn--ghost" onClick={() => pick('library')}>
              앨범에서 고르기
            </button>
            <button className="btn btn--quiet" onClick={() => navigate('/manual')}>
              직접 입력하기
            </button>
          </div>
        </>
      ) : (
        <main className="screen">
          {preview ? <img className="thumb" src={preview} alt="가져온 문제" /> : null}
          <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
            <div className="spinner" aria-hidden />
            <span className="h2">
              {phase === 'preparing' ? '사진 준비하는 중' : '문제 읽는 중'}
            </span>
          </div>
          <p className="muted" style={{ textAlign: 'center' }}>
            수식이 많으면 조금 더 걸려.
          </p>
        </main>
      )}
    </>
  );
}
