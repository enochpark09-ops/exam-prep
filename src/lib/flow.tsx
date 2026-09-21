import { createContext, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DiagnoseResult, ExtractResult } from '@shared/types';
import type { ConceptCard, GeneratedQuestionRow } from '@/db/schema';

/**
 * 오답 1건을 처리하는 동안만 사는 상태.
 * 확정된 것은 곧바로 IndexedDB 로 내려가고, 여기에는 화면 사이를 넘기는 것만 둔다.
 */
export interface FlowState {
  grade: number;
  imageDataUrl: string | null;
  imageBlob: Blob | null;
  extract: ExtractResult | null;
  extractWarnings: string[];
  wrongAnswerId: string | null;
  diagnosis: DiagnoseResult | null;
  card: ConceptCard | null;
  questions: GeneratedQuestionRow[];
  /**
   * 다음 화면에 필요한 것을 지금 화면을 보는 동안 미리 받아둔다.
   * 진단 결과를 읽는 동안 카드가, 카드를 읽는 동안 유사문제가 준비된다.
   */
  cardPromise: Promise<ConceptCard> | null;
  questionsPromise: Promise<GeneratedQuestionRow[]> | null;
}

const EMPTY: FlowState = {
  grade: 2,
  imageDataUrl: null,
  imageBlob: null,
  extract: null,
  extractWarnings: [],
  wrongAnswerId: null,
  diagnosis: null,
  card: null,
  questions: [],
  cardPromise: null,
  questionsPromise: null,
};

interface FlowApi {
  state: FlowState;
  patch: (p: Partial<FlowState>) => void;
  reset: () => void;
}

const Ctx = createContext<FlowApi | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(EMPTY);
  const latest = useRef(state);
  latest.current = state;

  const api = useMemo<FlowApi>(
    () => ({
      state,
      patch: (p) => setState((s) => ({ ...s, ...p })),
      reset: () => setState(EMPTY),
    }),
    [state]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useFlow(): FlowApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('FlowProvider 안에서만 쓸 수 있습니다');
  return ctx;
}
