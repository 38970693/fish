/**
 * 固定随机种子的测试场景工厂（G0 / FQ-02）
 *
 * 为什么需要：`createObstacles` / 刷怪 / 心境重掷全都吃 `Math.random()`，
 * 「同一场景跑两次」本来不可复现，于是**任何断言都在赌运气** ——
 * 加一条鱼、改一次概率，随机流整体平移，昨天绿的用例今天红（本仓库踩过多次）。
 *
 * 做法：把 `Math.random` 临时换成注入种子的确定性 PRNG，造完场景立刻还原。
 *   - `createSeededScenario({ seed, ... })` —— 造一份可复现的初始世界
 *   - `withSeededRandom(seed, fn)` —— 包住任意一段需要确定性的逻辑
 *
 * ⚠️ 只在**造场景/跑固定步骤**时替换全局 `Math.random`，且必须在 finally 里还原：
 *    它一旦泄漏到别的用例，整个测试文件的随机性都会变得诡异难查。
 * ⚠️ 这是测试资产，不进生产包（`src/test/` 只被 `__tests__/` 引用）。
 */

import { createInitialState, type CreateInitialStateOptions } from '../factories/initialState';
import { GameStatus } from '../types';
import type { GameState } from '../types';

/**
 * mulberry32 —— 32 位确定性 PRNG。
 * 选它是因为：状态只有 32 位（好记好传）、分布够均匀、实现 6 行不会写错。
 */
export const makeSeededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 在确定性随机流里执行 fn，结束后**必定**还原全局 Math.random */
export const withSeededRandom = <T>(seed: number, fn: () => T): T => {
  const original = Math.random;
  Math.random = makeSeededRandom(seed) as typeof Math.random;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
};

export interface SeededScenarioOptions extends CreateInitialStateOptions {
  /** 随机种子：同一个 seed 必须造出逐字段相同的世界 */
  seed: number;
  /** 造完直接进 PLAYING（默认 true）—— 大多数系统测试都需要世界在跑 */
  playing?: boolean;
}

/**
 * 造一份可复现的初始场景。
 * 相同 seed + 相同 options ⇒ 相同场景（含障碍物布局），这是回归测试的前提。
 */
export const createSeededScenario = (options: SeededScenarioOptions): GameState => {
  const { seed, playing = true, ...rest } = options;
  return withSeededRandom(seed, () => {
    const state = createInitialState(rest);
    if (playing) state.status = GameStatus.PLAYING;
    return state;
  });
};
