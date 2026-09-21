import { useMemo } from 'react';
import katex from 'katex';

/**
 * $...$ 로 감싼 부분만 수식으로 렌더한다.
 * 모델이 수식을 깨뜨렸을 때 앱이 죽으면 안 되므로, 실패하면 원문을 그대로 보여준다.
 */
export function Latex({ children, className }: { children: string; className?: string }) {
  const html = useMemo(() => render(children ?? ''), [children]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function render(input: string): string {
  const parts = input.split(/(\$[^$]*\$)/g);
  return parts
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        const tex = part.slice(1, -1);
        try {
          return katex.renderToString(tex, { throwOnError: false, displayMode: false });
        } catch {
          return escapeHtml(part);
        }
      }
      return escapeHtml(part).replace(/\n/g, '<br />');
    })
    .join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
