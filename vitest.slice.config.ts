/**
 * 只跑「3 分钟切片」台架的配置（G1 放行条件）。
 *
 * 为什么不并进默认 `vitest run`：八个组各跑 10800 帧 × 8 个种子，实测约 14 分钟，
 * 而默认全量套件只有 15 秒 —— 混进去会让日常回归慢几十倍，结果就是没人跑。
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
    // ⚠️ 超时本身就是一种「假红」：组数会随实验增加（4 组 → 6 组 → 8 组），
    //    实测 8 组 × 8 种子 ≈ 14 分钟。留 30 分钟，别让「跑不完」被误读成「不通过」。
    //
    // 另一个超时（birpc 的 60 秒 RPC 应答时限）**不在这里配**，只能靠台架自己
    // 在种子之间让出事件循环解决 —— 见 g1-playtest-slice.test.ts 的 `breathe`。
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
