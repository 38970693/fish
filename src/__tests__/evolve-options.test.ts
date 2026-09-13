/**
 * 进化方向候选：「一次进化只抽一次」。
 *
 * 背景（2026-09-13 用户反馈「选择进化方向，后面两个选项一直在变化」）：
 * 候选抽取原本写在 UIOverlay 的**渲染期**里，而 UIOverlay 每 100ms 随 uiState 同步重渲染一次
 * → 内部洗牌被反复重掷 → 后两个候选每秒变脸 10 次。
 * 修法：抽取挪到「进化触发那一刻」（systems/progression.ts），结果存进 GameState.evolveOptions，
 * UI 只渲染这份快照。本文件钉两件事：
 *   ① 抽取本身是纯函数：给定 rng 结果确定、可复现；
 *   ② 触发后快照被冻结：系统被重复调用也不重掷（幂等门闸），'evolve' 事件也不重复发。
 *
 * ⚠️ 随机性纪律：全部注入固定 rng，不掷真骰子做断言（否则 flaky）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { progressionSystem } from '../systems/progression';
import { pickEvolveOptions, CreatureType, CREATURES, EVOLVE_OPTION_COUNT } from '../data/creatures';
import { EventBus } from '../core/EventBus';
import { GameStatus, type FrameContext, type GameEvents } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

/** 固定随机源：按序列依次吐出，用尽后循环（一次洗牌点数是有限的） */
const seq = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pickEvolveOptions（纯函数）', () => {
  it('目标 tier 的生物不足 3 条时全给，顺序 = 注册表顺序，且根本不掷骰子', () => {
    const rng = vi.fn(seq([0.5]));
    const options = pickEvolveOptions({ nextTier: 0, rng });

    expect(options).toEqual(
      Object.values(CREATURES).filter((c) => c.tier === 0).map((c) => c.type)
    );
    expect(options.length).toBeLessThanOrEqual(EVOLVE_OPTION_COUNT);
    expect(rng).not.toHaveBeenCalled();
  });

  it('候选 > 3 时：最常吃生态区 + 当前生态区各占一席，其余随机补满 3，且不重复', () => {
    const options = pickEvolveOptions({
      nextTier: 2,
      eatenHistory: { [CreatureType.CLOWN_FISH]: 5 }, // 小丑鱼 → SHALLOWS
      currentBiome: 'REEF',
      fallbackBiome: 'SWAMP',
      rng: seq([0.1, 0.9, 0.4]),
    });

    expect(options).toHaveLength(EVOLVE_OPTION_COUNT);
    expect(new Set(options).size).toBe(EVOLVE_OPTION_COUNT);
    expect(options[0]).toBe(CreatureType.KOI); // tier2 里唯一的 SHALLOWS
    expect(options[1]).toBe(CreatureType.SEAHORSE); // tier2 里第一个 REEF（注册表顺序）
  });

  it('同一组随机数 → 结果完全一致（纯函数、可复现）', () => {
    const base = { nextTier: 2, eatenHistory: {}, fallbackBiome: 'ABYSS' } as const;
    const a = pickEvolveOptions({ ...base, rng: seq([0.2, 0.7, 0.33]) });
    const b = pickEvolveOptions({ ...base, rng: seq([0.2, 0.7, 0.33]) });
    expect(a).toEqual(b);
  });

  it('当前生态区在该 tier 没有对应生物 → 只 1 席被推荐，其余随机补位', () => {
    const options = pickEvolveOptions({
      nextTier: 2,
      eatenHistory: { [CreatureType.CLOWN_FISH]: 3 }, // SHALLOWS → KOI
      currentBiome: 'NOT_A_BIOME',
      rng: seq([0.5, 0.5, 0.5]),
    });

    expect(options[0]).toBe(CreatureType.KOI);
    expect(options).toHaveLength(EVOLVE_OPTION_COUNT);
    expect(new Set(options).size).toBe(EVOLVE_OPTION_COUNT);
  });

  it('吃历史为空 → 用兜底生态区；连兜底都没有 → 不崩，照样给满 3 条', () => {
    const withFallback = pickEvolveOptions({
      nextTier: 2,
      eatenHistory: {},
      fallbackBiome: 'REEF',
      rng: seq([0.5, 0.5, 0.5]),
    });
    expect(withFallback[0]).toBe(CreatureType.SEAHORSE);

    const noHint = pickEvolveOptions({ nextTier: 2, rng: seq([0.5, 0.5, 0.5]) });
    expect(noHint).toHaveLength(EVOLVE_OPTION_COUNT);
    expect(new Set(noHint).size).toBe(EVOLVE_OPTION_COUNT);
  });

  it('吃历史里有未知鱼种不会崩（该条被忽略）', () => {
    const options = pickEvolveOptions({
      nextTier: 2,
      eatenHistory: { NOT_A_FISH: 99 },
      rng: seq([0.5, 0.5, 0.5]),
    });
    expect(options).toHaveLength(EVOLVE_OPTION_COUNT);
  });

  it('目标 tier 没有任何生物 → 返回空数组（不是 undefined）', () => {
    expect(pickEvolveOptions({ nextTier: 99 })).toEqual([]);
  });
});

describe('progression：候选快照「一局只抽一次」', () => {
  /** 造一个「刚好触发 tier 1 → 2 进化」的状态 */
  const setupAtEvolution = () => {
    const state = createInitialState({ skipWorldGen: true });
    state.status = GameStatus.PLAYING;
    state.player.eatenHistory = { [CreatureType.CLOWN_FISH]: 9 }; // SHALLOWS 吃得最多
    state.player.currentBiome = 'REEF';
    state.player.evolutionPoints = 999999; // 远超阈值
    return state;
  };

  it('触发进化时写入 3 条候选，并切到 EVOLVING', () => {
    const state = setupAtEvolution();
    progressionSystem(state, makeCtx());

    expect(state.status).toBe(GameStatus.EVOLVING);
    expect(state.evolveOptions).toHaveLength(EVOLVE_OPTION_COUNT);
    expect(new Set(state.evolveOptions).size).toBe(EVOLVE_OPTION_COUNT);
  });

  it('重复调用不会重掷候选、也不重复发 evolve 事件 —— 这就是「选项不再变」的根保障', () => {
    const state = setupAtEvolution();
    const ctx = makeCtx();
    let evolveEvents = 0;
    ctx.events.on('evolve', () => {
      evolveEvents += 1;
    });

    progressionSystem(state, ctx);
    const frozen = [...(state.evolveOptions ?? [])];
    expect(frozen).toHaveLength(EVOLVE_OPTION_COUNT);

    // 换成「永远吐同一个极值」的随机源：若还被重掷，结果必然改变（会走到另一个洗牌结果）
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    progressionSystem(state, ctx);
    progressionSystem(state, ctx);

    expect(state.evolveOptions).toEqual(frozen);
    expect(spy).not.toHaveBeenCalled(); // 门闸挡住后连骰子都不掷
    expect(evolveEvents).toBe(1); // 'evolve' 只发一次 → 成就不会重复计数
  });
});
