import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

// GitHub 에 파일을 올리는 방식으로 배포하면 "지금 올라간 게 몇 버전인지"를
// 눈으로 확인할 길이 없다. 화면 구석에 박아둔다.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  build: {
    // 개념 사전 JSON이 커서 기본 경고선(500KB)에 걸린다. 의도된 크기다.
    chunkSizeWarningLimit: 900,
  },
  server: {
    // vercel dev 대신 vite만 띄울 때 /api 를 로컬 함수 서버로 넘기고 싶으면 여기에 proxy 추가.
    port: 5173,
  },
});
