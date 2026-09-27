/**
 * 빌드 결과를 실제 브라우저로 띄워 렌더링 오류를 잡는다.
 * API 없이 도는 화면(홈, 촬영 안내, 직접 입력)만 확인한다.
 *   node scripts/smoke.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve(process.cwd(), 'dist');
const PORT = 4173;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let file = path.join(DIST, url.pathname);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // SPA 폴백
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(await readFile(path.join(DIST, 'index.html')));
  }
});

await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`console: ${m.text()}`);
});

function check(name, cond, detail = '') {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `\n      ${detail}`}`);
  if (!cond) process.exitCode = 1;
}

console.log('\n[홈]');
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
check('타이틀 렌더', (await page.locator('.topbar__title').textContent()) === '오답노트');
check('빈 상태 문구', await page.getByText('틀린 문제를 찍으면').isVisible());
check('학년 선택 3개', (await page.locator('.chip').count()) >= 3);
check('선택된 학년이 채워져 보임', (await page.locator('.chip--on').count()) === 1);
check('버전 표시', /^v\d+\.\d+\.\d+/.test((await page.locator('.screen .tiny').last().textContent()) ?? ''), (await page.locator('.screen .tiny').last().textContent()) ?? '없음');
check('주요 버튼이 하단에', await page.getByRole('button', { name: '틀린 문제 찍기' }).isVisible());

console.log('\n[촬영 안내]');
await page.getByRole('button', { name: '틀린 문제 찍기' }).click();
await page.waitForURL('**/capture');
check('촬영 가이드 표시', await page.getByText('한 장에 문제 한 개').isVisible());
  check('앨범에서 고르기 버튼', await page.getByRole('button', { name: '앨범에서 고르기' }).isVisible());
  {
    const inputs = await page.locator('input[type=file]').count();
    const withCapture = await page.locator('input[type=file][capture]').count();
    check('카메라·앨범 input 이 분리됨', inputs === 2 && withCapture === 1, `input ${inputs}개, capture ${withCapture}개`);
  }

console.log('\n[직접 입력 + 수식 렌더]');
await page.getByRole('button', { name: '직접 입력하기' }).click();
await page.waitForURL('**/manual');
check('제출 버튼이 잠겨 있음', await page.getByRole('button', { name: '정답을 골라줘' }).isDisabled());

await page.locator('.textarea').fill('$\\frac{x-1}{2} + \\sqrt{3} = 4$ 의 해는?');
await page.waitForTimeout(150);
const katexCount = await page.locator('.katex').count();
check('KaTeX 로 수식이 렌더됨', katexCount > 0, `.katex 요소 ${katexCount}개`);

await page.locator('.input').last().fill('5');
await page.waitForTimeout(100);
check('정답 입력 후 제출 열림', await page.getByRole('button', { name: '이게 맞아' }).isEnabled());

console.log('\n[다크모드]');
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(100);
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('다크에서 배경이 어두움', bg === 'rgb(22, 19, 17)', `실제: ${bg}`);

console.log('\n[가로 스크롤]');
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth
);
check('390px 에서 가로 스크롤 없음', !overflow);

console.log('\n[런타임 오류]');
check('콘솔 오류 없음', errors.length === 0, errors.join('\n      '));

await browser.close();
server.close();
console.log(process.exitCode ? '\n실패\n' : '\n모두 통과\n');
