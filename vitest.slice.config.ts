/**
 * 只跑「3 分钟切片」台架的配置（G1 放行条件）。
 *
 * 为什么不并进默认 `vitest run`：四个组各跑 10800 帧，合计约 55 秒，
 * 而默认全量套件只有 15 秒 —— 混进去会让日常回归慢 4 倍，结果就是没人跑。
 * 于是单独给一份配置，`npm run test:slice` 时再跑（放行前 / 动了战斗与队伍数值时）。
 *
 * ⚠️ 两份配置的 environment / setupFiles / alias 必须一致，
 *    否则「默认跑不过、单独跑能过」这种鬼故事就会出现。
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/__tests__/**/g1-playtest-slice.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // 四组 × 8 种子 × 10800 帧，实测约 2~3 分钟；留足余量，别让超时变成假红
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
