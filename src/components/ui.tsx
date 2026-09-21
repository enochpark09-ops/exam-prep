import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export function TopBar({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: boolean | (() => void);
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  const handleBack = typeof onBack === 'function' ? onBack : () => navigate(-1);
  return (
    <header className="topbar">
      {onBack ? (
        <button className="topbar__btn" onClick={handleBack} aria-label="뒤로">
          ←
        </button>
      ) : null}
      <h1 className="topbar__title">{title}</h1>
      {action}
    </header>
  );
}

export function Loading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="center">
      <div className="spinner" aria-hidden />
      <p className="h2">{title}</p>
      {note ? <p className="muted">{note}</p> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = '다시 해보기',
  children,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="center">
      <p className="h2">{message}</p>
      {children}
      {onRetry ? (
        <button className="btn btn--primary" onClick={onRetry} style={{ maxWidth: 240 }}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function Progress({ total, done }: { total: number; done: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`progress__seg${i < done ? ' progress__seg--done' : ''}`} />
      ))}
    </div>
  );
}

const CIRCLED = ['①', '②', '③', '④', '⑤'];

export function choiceNumber(i: number): string {
  return CIRCLED[i] ?? String(i + 1);
}
