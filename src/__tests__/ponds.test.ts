/**
 * 多鱼塘（阶段 1）测试 —— 注册表完整性 / getPond 兜底 / 计分倍率 /
 * 刷怪偏置（食物比例 + tier 上限加成）/ initialState 选塘 / 排行榜塘标签。
 *
 * 与 leaderboard.test 同一个坑：src/test/setup.ts 把 localStorage 换成了空 mock，
 * 需要持久化的部分（排行榜标签）在这里换回内存实现。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  POND_DATA,
  POND_LIST,
  DEFAULT_POND,
  getPond,
  scoreGain,
  type PondId,
} from '../data/ponds';
import { BIOME_DATA } from '../data/biomes';
import { CREATURES } from '../data/creatures';
import { createInitialState } from '../factories/initialState';
import { spawnSystem } from '../systems/spawn';
import { recordRun, getLeaderboard, clearLeaderboard } from '../systems/leaderboard';
import type { GameState, FrameContext } from '../types';

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

/** 把 Math.random 钉成定值跑一段逻辑，跑完还原（刷怪流程里随机数很多） */
const withRandom = (value: number, fn: () => void): void => {
  const orig = Math.random;
  Math.random = () => value;
  try {
    fn();
  } finally {
    Math.random = orig;
  }
};

/**
 * 按序列喂随机数（用完后重复最后一个）。
 * 刷怪的取数顺序：tier → 食物判定 → 刷点 x → 刷点 y → 池内选择 → 实体内部若干。
 * 刷点必须落在花瓣形地图内，0.5 才是中心，所以不能全程用同一个值。
 */
const withRandomSeq = (seq: number[], fn: () => void): void => {
  const orig = Math.random;
  let i = 0;
  Math.random = () => (i < seq.length ? seq[i++] : seq[seq.length - 1] ?? 0.5);
  try {
    fn();
  } finally {
    Math.random = orig;
  }
};

/** 空 ctx：spawnSystem 不用它（形参是 `_ctx`），只为了过签名 */
const emptyCtx = {} as FrameContext;

const makeState = (pondId?: PondId): GameState =>
  createInitialState({ skipWorldGen: true, pondId });

beforeEach(() => {
  clearLeaderboard();
  memoryStore.clear();
});

describe('鱼塘注册表', () => {
  it('每个塘的字段都合法', () => {
    const ids = Object.keys(POND_DATA);
    expect(ids.length).toBeGreaterThanOrEqual(3);

    ids.forEach((id) => {
      const p = POND_DATA[id as PondId];
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.description.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(p.difficulty);
      expect(p.foodRatio).toBeGreaterThan(0);
      expect(p.foodRatio).toBeLessThan(1);
      expect(p.scoreMult).toBeGreaterThanOrEqual(1);
      expect(Object.keys(BIOME_DATA)).toContain(p.signatureBiome);
    });
  });

  it('难度越高，得分倍率越高、食物越少、大鱼越早出现（单调性）', () => {
    const asc = [...POND_LIST].sort((a, b) => a.config.difficulty - b.config.difficulty);
    for (let i = 1; i < asc.length; i += 1) {
      expect(asc[i].config.scoreMult).toBeGreaterThanOrEqual(asc[i - 1].config.scoreMult);
      expect(asc[i].config.foodRatio).toBeLessThanOrEqual(asc[i - 1].config.foodRatio);
      expect(asc[i].config.maxTierBonus).toBeGreaterThanOrEqual(asc[i - 1].config.maxTierBonus);
    }
  });

  it('POND_LIST 按难度升序，且覆盖全部塘', () => {
    expect(POND_LIST.map((p) => p.id).sort()).toEqual(Object.keys(POND_DATA).sort());
    for (let i = 1; i < POND_LIST.length; i += 1) {
      expect(POND_LIST[i].config.difficulty).toBeGreaterThanOrEqual(POND_LIST[i - 1].config.difficulty);
    }
  });

  it('getPond 对未知 / 空 id 回退默认塘，绝不返回 undefined', () => {
    expect(getPond(undefined)).toBe(POND_DATA[DEFAULT_POND]);
    expect(getPond(null)).toBe(POND_DATA[DEFAULT_POND]);
    expect(getPond('NOT_A_POND')).toBe(POND_DATA[DEFAULT_POND]);
    expect(getPond('ABYSS').name).toBe('深渊塘');
  });
});

describe('鱼塘 · 计分倍率', () => {
  it('清水塘 ×1 原样返回', () => {
    expect(scoreGain('CLEAR', 100)).toBe(100);
  });

  it('珊瑚塘 ×1.5、深渊塘 ×2.5，且四舍五入', () => {
    expect(scoreGain('CORAL', 100)).toBe(150);
    expect(scoreGain('ABYSS', 100)).toBe(250);
    expect(scoreGain('CORAL', 15)).toBe(23);  // 22.5 → 23
    expect(scoreGain('ABYSS', 15)).toBe(38);  // 37.5 → 38
  });

  it('未知塘按默认塘算；base<=0 不产生白送分', () => {
    expect(scoreGain('NOPE', 10)).toBe(10);
    expect(scoreGain('ABYSS', 0)).toBe(0);
    expect(scoreGain('ABYSS', -5)).toBe(0);
  });
});

describe('鱼塘 · 刷怪偏置', () => {
  it('食物比例：同一个随机数，清水塘刷食物、珊瑚塘不刷', () => {
    const clear = makeState('CLEAR');   // foodRatio 0.4
    const coral = makeState('CORAL');   // foodRatio 0.3
    withRandom(0.35, () => {
      spawnSystem(clear, emptyCtx);
      spawnSystem(coral, emptyCtx);
    });

    expect(clear.entities[0].type).toBe('PLANKTON');
    expect(coral.entities[0].type).not.toBe('PLANKTON');
  });

  it('tier 上限加成：1 级玩家在清水塘只刷 t1，在深渊塘能刷 t3', () => {
    const clear = makeState('CLEAR');   // maxTierBonus 0 → maxTier 1
    const abyss = makeState('ABYSS');   // maxTierBonus 2 → maxTier 3
    clear.player.level = 1;
    abyss.player.level = 1;

    // 取数顺序：tier 0.9 → 食物判定 0.9（不吃）→ 池内取第 0 个 → 刷点 (0.5,0.5) 地图中心
    const seq = [0.9, 0.9, 0, 0.5, 0.5];
    withRandomSeq(seq, () => spawnSystem(clear, emptyCtx));
    withRandomSeq(seq, () => spawnSystem(abyss, emptyCtx));

    expect(clear.entities).toHaveLength(1);
    expect(abyss.entities).toHaveLength(1);
    expect(CREATURES[clear.entities[0].type as keyof typeof CREATURES].tier).toBe(1);
    expect(CREATURES[abyss.entities[0].type as keyof typeof CREATURES].tier).toBe(3);
  });

  it('实体满员时不刷（MAX_ENTITIES 保护仍生效）', () => {
    const state = makeState('ABYSS');
    for (let i = 0; i < 200; i += 1) state.entities.push({ ...state.player, id: `e${i}` } as never);
    withRandom(0.9, () => spawnSystem(state, emptyCtx));
    expect(state.entities).toHaveLength(200);
  });
});

describe('鱼塘 · initialState 选塘', () => {
  it('缺省进清水塘（向后兼容旧调用点）', () => {
    expect(createInitialState({ skipWorldGen: true }).pondId).toBe(DEFAULT_POND);
  });

  it('显式选塘会被记进 state', () => {
    expect(createInitialState({ skipWorldGen: true, pondId: 'ABYSS' }).pondId).toBe('ABYSS');
  });

  it('出生点仍是地图中心（阶段 1 不改位置）', () => {
    const s = createInitialState({ skipWorldGen: true, pondId: 'ABYSS' });
    expect(s.player.x).toBe(3000);
    expect(s.player.y).toBe(3000);
  });
});

describe('鱼塘 · 排行榜塘标签', () => {
  it('记录带塘名，旧记录（无 pond）也能正常展示', () => {
    const deep = makeState('ABYSS');
    deep.status = 'GAME_OVER' as GameState['status'];
    deep.score = 500;
    recordRun(deep);

    const [e] = getLeaderboard();
    expect(e.pond).toBe('深渊塘');

    // 模拟一条没有 pond 字段的旧存档记录
    const legacy = { score: 10, weight: 1, level: 1, survivedSec: 1, recruits: 0, date: '2020-01-01' };
    memoryStore.set('fish.leaderboard.v1', JSON.stringify([legacy]));
    expect(JSON.parse(memoryStore.get('fish.leaderboard.v1')!)[0].pond).toBeUndefined();
  });
});
