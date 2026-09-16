import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    /**
     * 3 分钟切片台架**不进默认套件**：四组 × 8 种子 ≈ 136 秒，而默认全量只有 15 秒 ——
     * 混进去会让日常回归慢 9 倍，结果就是没人跑。
     * 它有自己的配置与入口：`npm run test:slice`（vitest.slice.config.ts）。
     */
    exclude: ['src/**/g1-playtest-slice.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});