import { withGuards, ok, fail, requireString } from './_lib/http.js';
import { runPrompt, imageBlock } from './_lib/claude.js';
import { extractPrompt } from './_lib/prompts/extract.js';
import { checkExtract } from '../shared/checks.js';
import type { ExtractResult } from '../shared/types.js';

/**
 * POST /api/extract
 * body: { image: "data:image/jpeg;base64,..." }
 */
export default withGuards('extract', async ({ body }, res) => {
  const image = requireString(body, 'image');
  if (image.length > 8_000_000) {
    fail(res, 400, 'bad_request', '이미지가 너무 큽니다. 다시 찍어주세요.');
    return;
  }

  const result = await runPrompt<ExtractResult>(extractPrompt, extractPrompt.user, [
    imageBlock(image),
  ]);

  const warnings = checkExtract(result.data);

  // 본문을 못 읽은 수준이면 학생에게 재촬영을 권한다.
  if (!result.data.questionText || result.data.questionText.trim().length < 5) {
    fail(res, 422, 'invalid_output', '글자를 거의 못 읽었어. 밝은 곳에서 더 가까이 찍어보자.');
    return;
  }

  ok(res, result.data, warnings, {
    promptVersion: extractPrompt.version,
    elapsedMs: result.elapsedMs,
  });
});
