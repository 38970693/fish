/**
 * 排行榜测试 —— 记录 / 同局 upsert / 排序 / 前 10 截断 / 清空。
 *
 * 与 achievements.test 同一个坑：src/test/setup.ts 把 localStorage 换成了空 mock，
 * 这里同样换回内存实现。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../factories/initialState';
import {
  recordRun,
  getLeaderboard,
  getLastRunRank,
  clearLeaderboard,
} from '../systems/leaderboard';
import type { GameState } from '../types';

const memoryStore = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => { memoryStore.set(k, v); },
    removeItem: (k: string) => { memoryStore.delete(k); },
    clear: () => memoryStore.clear(),
  },
});

/** 造一个指定分数的"已结束"局（score 靠金币堆出来最真实，这里直接写） */
const makeRun = (score: number): GameState => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = 'GAME_OVER' as GameState['status'];
  state.score = score;
  return state;
};

beforeEach(() => {
  clearLeaderboard();
  memoryStore.clear();
});

describe('排行榜 · 记录与排序', () => {
  it('记录后按分数降序排列', () => {
    recordRun(makeRun(100));
    recordRun(makeRun(300));
    recordRun(makeRun(200));

    const list = getLeaderboard();
    expect(list.map((e) => e.score)).toEqual([300, 200, 100]);
  });

  it('同一局（同一个 state 对象）重复记录只刷新不新增', () => {
    const run = makeRun(50);
    recordRun(run);
    recordRun(run); // 复活后再死：同一 state 又走了一遍结算
    run.score = 80;
    recordRun(run);

    const list = getLeaderboard();
    expect(list).toHaveLength(1);
    expect(list[0].score).toBe(80);
  });

  it('新开一局（新 state 对象）是新的记录', () => {
    recordRun(makeRun(50));
    recordRun(makeRun(70));
    expect(getLeaderboard()).toHaveLength(2);
  });

  it('只保留前 10 名，超出被挤出', () => {
    for (let i = 1; i <= 12; i += 1) recordRun(makeRun(i * 10));
    expect(getLeaderboard()).toHaveLength(10);
    expect(getLeaderboard()[0].score).toBe(120);
    expect(getLeaderboard()[9].score).toBe(30);
  });

  it('名次计算：垫底还在榜上返回名次，被挤出返回 0，高分插队', () => {
    for (let i = 12; i >= 3; i -= 1) recordRun(makeRun(i * 10)); // 先放 120..30 共 10 条，榜上最低 30
    expect(recordRun(makeRun(32))).toBe(10); // 比最低分高 → 垫底但在榜上
    expect(recordRun(makeRun(25))).toBe(0);  // 低于榜上最低 → 直接被挤出
    expect(recordRun(makeRun(115))).toBe(2); // 高分插队到第二
  });

  it('记录带上下文字段（体重/等级/存活时长/收编数）', () => {
    const state = makeRun(500);
    state.player.weight = 321;
    state.player.level = 15;
    state.time = 600; // 10 秒
    state.squad.recruitedTotal = 4;
    recordRun(state);

    const [e] = getLeaderboard();
    expect(e.weight).toBe(321);
    expect(e.level).toBe(15);
    expect(e.survivedSec).toBe(10);
    expect(e.recruits).toBe(4);
    expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('落盘到 localStorage，可清空', () => {
    recordRun(makeRun(42));
    expect(JSON.parse(memoryStore.get('fish.leaderboard.v1')!)).toHaveLength(1);

    clearLeaderboard();
    expect(getLeaderboard()).toHaveLength(0);
    expect(JSON.parse(memoryStore.get('fish.leaderboard.v1')!)).toHaveLength(0);
    expect(getLastRunRank()).toBe(0);
  });

  it('最新名次暴露给结算界面（getLastRunRank）', () => {
    recordRun(makeRun(10));
    expect(getLastRunRank()).toBe(1);
    recordRun(makeRun(20));
    expect(getLastRunRank()).toBe(1);
    recordRun(makeRun(30));
    expect(getLastRunRank()).toBe(1);
    const low = makeRun(5);
    recordRun(low);
    expect(getLastRunRank()).toBe(4);
  });
});
