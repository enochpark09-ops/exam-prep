import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
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
