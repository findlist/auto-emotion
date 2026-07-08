import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// 前端测试配置：与 vite.config.ts 共享 alias 与插件，确保 @ 路径别名与 Tailwind 类名解析一致
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // jsdom 提供 DOM API，使 React 组件可在 Node 环境渲染
    environment: 'jsdom',
    // 显式 import describe/it/expect，避免污染 tsconfig 类型
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // CSS 走空 stub，避免 Tailwind 处理开销
    css: false,
  },
});
