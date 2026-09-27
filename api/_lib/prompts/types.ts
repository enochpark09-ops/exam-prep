export interface Prompt {
  id: string;
  /** 프롬프트를 고칠 때는 이 파일을 수정하지 말고 v2 파일을 새로 만든다. */
  version: number;
  model: string;
  maxTokens: number;
  system: string;
  /** {{VAR}} 자리는 fill() 로 채운다 */
  user: string;
}

/** {{KEY}} 를 채운다. 남은 자리가 있으면 던진다 — 조용히 빈 프롬프트가 나가는 것을 막는다. */
export function fill(template: string, vars: Record<string, unknown>): string {
  const out = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`프롬프트 변수 누락: ${key}`);
    const v = vars[key];
    if (v === null || v === undefined || v === '') return '(없음)';
    return Array.isArray(v) ? v.join(', ') : String(v);
  });
  const leftover = out.match(/\{\{(\w+)\}\}/);
  if (leftover) throw new Error(`채워지지 않은 변수: ${leftover[1]}`);
  return out;
}
