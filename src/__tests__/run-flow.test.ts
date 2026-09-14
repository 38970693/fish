/**
 * 「鱼群争霸」规则入口回归（G0 / FQ-02）
 *
 * 这个文件钉的不是玩法，而是**入口本身**：
 *   ① 旧模式（LEGACY）零改动 —— `state.run` 缺省、runFlowSystem 整段空转
 *   ② 新模式（RIVALS）初始化正确 —— 单塘、阶段从起步开始、时钟归零
 *   ③ 模式解析优先级：显式入参 > URL `?mode=` > localStorage > 默认 LEGACY
 *   ④ 阶段边界由 `sec()` 从秒换算（阈值改了这里必红，不允许文档与实现脱节）
 *   ⑤ 阶段时钟只在 PLAYING 推进（面板期间世界冻结，节奏不能偷跑）
 *   ⑥ 练习局（无敌 / 手动续命）不进正式排行，且旧模式不受影响
 *   ⑦ 固定种子场景可复现 —— 这是后续所有阶段测试的前提
 *
 * ⚠️ 别把「旧模式零改动」写成 `expect(state.run).toBeUndefined()` 就完事：
 *    那只能证明字段缺省，证明不了消费点真的不跑。所以这里额外钉了
 *    「跑 600 帧后 run 仍缺省、labels 一条没多」。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { createSeededScenario } from '../test/scenario';
import { markRunPractice, runFlowSystem } from '../systems/runFlow';
import { runSystems } from '../systems';
import { recordRun, getLeaderboard, clearLeaderboard } from '../systems/leaderboard';
import {
  RUN_MODE,
  RUN_MODE_STORAGE_KEY,
  RUN_PHASE,
  RUN_PHASE_DATA,
  RUN_PHASE_ORDER,
  RIVALS_RULES,
  framesUntilNextPhase,
  getRunPhase,
  normalizeRunMode,
  resolveRunMode,
  sec,
} from '../data/runRules';
import { EventBus } from '../core/EventBus';
import { GameStatus } from '../types';
import type { FrameContext, GameEvents, GameState } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

/* ── localStorage 换成内存实现：要测「URL 命中会写进 localStorage」的一半 ── */

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

/** 改 URL 查询串（jsdom 下 location.search 只读，得走 history） */
const setSearch = (search: string): void => {
  window.history.replaceState({}, '', search ? `/?${search}` : '/');
};

beforeEach(() => {
  memoryStore.clear();
  setSearch('');
  clearLeaderboard();
});

afterEach(() => {
  setSearch('');
});

/* ══════════════ ① 旧模式零改动 ══════════════ */

describe('旧模式（LEGACY）保持零改动', () => {
  it('默认入口不产生 run，且跑满 600 帧都不动它', () => {
    const state = createInitialState({ skipWorldGen: true });
    expect(state.run).toBeUndefined();

    const ctx = makeCtx();
    for (let i = 0; i < 600; i += 1) runFlowSystem(state, ctx);

    expect(state.run).toBeUndefined();
    // 空转的实证：runFlow 会推飘字（阶段提示 / 练习标记），旧模式一条都不该多
    expect(state.labels).toHaveLength(0);
    expect(state.status).toBe(GameStatus.MENU);
  });

  it('markRunPractice 在旧模式是空操作（手动续命旧规则保留）', () => {
    const state = createInitialState({ skipWorldGen: true });
    markRunPractice(state, '无敌模式');
    expect(state.run).toBeUndefined();
    expect(state.labels).toHaveLength(0);
  });

  it('旧模式仍开塘际传送门（多鱼塘内容不因新入口而消失）', () => {
    const state = createInitialState();
    expect(state.portals.length).toBeGreaterThan(0);
  });
});

/* ══════════════ ② 新模式初始化 ══════════════ */

describe('新模式（RIVALS）初始化', () => {
  it('run 与规则版本来自 RIVALS_RULES，阶段从起步开始、时钟归零', () => {
    const state = createInitialState({ skipWorldGen: true, mode: RUN_MODE.RIVALS });
    const run = state.run;
    expect(run).toBeDefined();
    expect(run!.mode).toBe(RUN_MODE.RIVALS);
    expect(run!.ruleVersion).toBe(RIVALS_RULES.ruleVersion);
    expect(run!.phase).toBe(RUN_PHASE.EARLY);
    expect(run!.clock).toBe(0);
    expect(run!.practice).toBe(false);
    expect(run!.practiceReason).toBeNull();
    expect(run!.bossId).toBeNull();
  });

  it('单塘模式：不开塘际传送门', () => {
    const state = createInitialState({ mode: RUN_MODE.RIVALS });
    expect(state.portals).toHaveLength(0);
    expect(RIVALS_RULES.allowPondTravel).toBe(false);
  });

  it('登记进系统注册表且跑通一帧（顺序在最前，阶段先于其它系统更新）', () => {
    const state = createSeededScenario({ seed: 7, mode: RUN_MODE.RIVALS });
    state.player.invulnerableTimer = 9999; // 免得被 AI 咬死导致时钟停在 GAME_OVER

    runSystems(state, makeCtx());

    expect(state.run!.clock).toBe(1);
  });
});

/* ══════════════ ③ 模式解析优先级 ══════════════ */

describe('模式解析：显式入参 > URL > localStorage > 默认', () => {
  it('默认（无入参/无 URL/无存档）= LEGACY', () => {
    expect(resolveRunMode()).toBe(RUN_MODE.LEGACY);
  });

  it('显式入参优先，且大小写不敏感', () => {
    expect(resolveRunMode('RIVALS')).toBe(RUN_MODE.RIVALS);
    expect(resolveRunMode('rivals')).toBe(RUN_MODE.RIVALS);
    expect(resolveRunMode('Legacy')).toBe(RUN_MODE.LEGACY);
  });

  it('URL ?mode=rivals 生效并写入 localStorage（刷新/重开保持同模式）', () => {
    setSearch('mode=rivals');
    expect(resolveRunMode()).toBe(RUN_MODE.RIVALS);
    expect(memoryStore.get(RUN_MODE_STORAGE_KEY)).toBe(RUN_MODE.RIVALS);

    // 参数摘掉后，靠存档继续留在新模式
    setSearch('');
    expect(resolveRunMode()).toBe(RUN_MODE.RIVALS);
  });

  it('无法识别的值一律回退默认，不抛错', () => {
    expect(normalizeRunMode('nope')).toBeNull();
    expect(normalizeRunMode('')).toBeNull();
    expect(normalizeRunMode(null)).toBeNull();
    expect(normalizeRunMode(undefined)).toBeNull();
    setSearch('mode=nope');
    expect(resolveRunMode()).toBe(RUN_MODE.LEGACY);
  });
});

/* ══════════════ ④ 阶段边界 ══════════════ */

describe('阶段表与边界', () => {
  it('阶段顺序与阈值由秒换算（0 / 2 / 6 / 10 分钟）', () => {
    expect(RUN_PHASE_ORDER).toEqual([
      RUN_PHASE.EARLY,
      RUN_PHASE.CONTEST,
      RUN_PHASE.BUILDUP,
      RUN_PHASE.DECISIVE,
    ]);
    expect(RUN_PHASE_DATA.EARLY.startFrame).toBe(0);
    expect(RUN_PHASE_DATA.CONTEST.startFrame).toBe(sec(120));
    expect(RUN_PHASE_DATA.BUILDUP.startFrame).toBe(sec(360));
    expect(RUN_PHASE_DATA.DECISIVE.startFrame).toBe(sec(600));
  });

  it('边界含左不含右：临界帧归下一阶段', () => {
    expect(getRunPhase(0)).toBe(RUN_PHASE.EARLY);
    expect(getRunPhase(sec(120) - 1)).toBe(RUN_PHASE.EARLY);
    expect(getRunPhase(sec(120))).toBe(RUN_PHASE.CONTEST);
    expect(getRunPhase(sec(360) - 1)).toBe(RUN_PHASE.CONTEST);
    expect(getRunPhase(sec(360))).toBe(RUN_PHASE.BUILDUP);
    expect(getRunPhase(sec(600))).toBe(RUN_PHASE.DECISIVE);
    expect(getRunPhase(sec(60 * 60))).toBe(RUN_PHASE.DECISIVE);
  });

  it('负数与极端值不越界', () => {
    expect(getRunPhase(-100)).toBe(RUN_PHASE.EARLY);
    expect(getRunPhase(Number.MAX_SAFE_INTEGER)).toBe(RUN_PHASE.DECISIVE);
  });

  it('目标局长区间晚于决战起点，且不早于 15 分钟压力线', () => {
    expect(RIVALS_RULES.targetRunFrames.min).toBe(sec(12 * 60));
    expect(RIVALS_RULES.targetRunFrames.max).toBe(sec(15 * 60));
    expect(RIVALS_RULES.targetRunFrames.max).toBeLessThanOrEqual(RIVALS_RULES.pressureAfterFrame);
    expect(RUN_PHASE_DATA.DECISIVE.startFrame).toBeLessThan(RIVALS_RULES.targetRunFrames.min);
  });

  it('阶段剩余帧数：末阶段为 0，其余为正', () => {
    expect(framesUntilNextPhase(0)).toBe(sec(120));
    expect(framesUntilNextPhase(sec(600))).toBe(0);
    expect(framesUntilNextPhase(sec(600) + 999)).toBe(0);
  });
});

/* ══════════════ ⑤ 时钟推进 ══════════════ */

describe('阶段时钟只在正常游玩中推进', () => {
  const makeRun = (): GameState =>
    createInitialState({ skipWorldGen: true, mode: RUN_MODE.RIVALS });

  it('PLAYING 每帧 +1', () => {
    const state = makeRun();
    state.status = GameStatus.PLAYING;
    const ctx = makeCtx();
    for (let i = 0; i < 120; i += 1) runFlowSystem(state, ctx);
    expect(state.run!.clock).toBe(120);
  });

  it('进化 / 商店 / 结算 / 菜单期间时钟冻结', () => {
    const ctx = makeCtx();
    for (const status of [
      GameStatus.EVOLVING,
      GameStatus.SHOP,
      GameStatus.GAME_OVER,
      GameStatus.VICTORY,
      GameStatus.MENU,
    ]) {
      const state = makeRun();
      state.status = status;
      for (let i = 0; i < 30; i += 1) runFlowSystem(state, ctx);
      expect(state.run!.clock).toBe(0);
    }
  });
});

/* ══════════════ ⑥ 阶段切换事件与练习标记 ══════════════ */

describe('阶段切换与练习标记', () => {
  it('跨阶段发一次 runPhase 事件并更新 phase', () => {
    const state = createInitialState({ skipWorldGen: true, mode: RUN_MODE.RIVALS });
    state.status = GameStatus.PLAYING;
    state.run!.clock = sec(120) - 1; // 下一帧就进「争夺」
    const ctx = makeCtx();
    const seen: Array<{ phase: string; name: string }> = [];
    ctx.events.on('runPhase', (p) => seen.push({ phase: p.phase, name: p.name }));

    runFlowSystem(state, ctx);

    expect(seen).toHaveLength(1);
    expect(seen[0].phase).toBe(RUN_PHASE.CONTEST);
    expect(seen[0].name).toBe(RUN_PHASE_DATA.CONTEST.name);
    expect(state.run!.phase).toBe(RUN_PHASE.CONTEST);

    // 阶段内的后续帧不再发事件（否则每秒 60 条）
    for (let i = 0; i < 60; i += 1) runFlowSystem(state, ctx);
    expect(seen).toHaveLength(1);
  });

  it('开过无敌 → 整局标为练习，关掉也不洗白，且不重复推飘字', () => {
    const state = createInitialState({ skipWorldGen: true, mode: RUN_MODE.RIVALS });
    state.status = GameStatus.PLAYING;
    const ctx = makeCtx();

    state.player.isGodMode = true;
    runFlowSystem(state, ctx);
    expect(state.run!.practice).toBe(true);
    expect(state.run!.practiceReason).toBe('无敌模式');
    const labelsAfterFirst = state.labels.length;
    expect(labelsAfterFirst).toBeGreaterThan(0);

    // 无敌开着连续 60 帧：标记幂等，飘字不再增加
    for (let i = 0; i < 60; i += 1) runFlowSystem(state, ctx);
    expect(state.labels).toHaveLength(labelsAfterFirst);

    // 关掉无敌：仍然是练习局
    state.player.isGodMode = false;
    runFlowSystem(state, ctx);
    expect(state.run!.practice).toBe(true);
  });
});

/* ══════════════ ⑦ 排行与种子场景 ══════════════ */

describe('练习局与排行榜', () => {
  const makeEnded = (mode?: 'LEGACY' | 'RIVALS'): GameState => {
    const state = mode
      ? createInitialState({ skipWorldGen: true, mode })
      : createInitialState({ skipWorldGen: true });
    state.status = GameStatus.GAME_OVER;
    state.score = 500;
    return state;
  };

  it('练习局不入正式排行（返回未上榜，榜上无记录）', () => {
    const state = makeEnded(RUN_MODE.RIVALS);
    state.run!.practice = true;

    expect(recordRun(state)).toBe(0);
    expect(getLeaderboard()).toHaveLength(0);
  });

  it('非练习局照常记录，并带上模式与规则版本', () => {
    const state = makeEnded(RUN_MODE.RIVALS);
    recordRun(state);

    const [entry] = getLeaderboard();
    expect(entry.score).toBe(500);
    expect(entry.mode).toBe(RUN_MODE.RIVALS);
    expect(entry.ruleVersion).toBe(RIVALS_RULES.ruleVersion);
  });

  it('旧模式记录按 LEGACY / 版本 0 兜底（旧数据缺字段也能读）', () => {
    recordRun(makeEnded());
    const [entry] = getLeaderboard();
    expect(entry.mode).toBe('LEGACY');
    expect(entry.ruleVersion).toBe(0);
    expect(entry.pond).toBeTruthy();
  });
});

describe('固定种子场景可复现（后续阶段测试的前提）', () => {
  it('同一个 seed 造出逐字段相同的世界', () => {
    const a = createSeededScenario({ seed: 20260914 });
    const b = createSeededScenario({ seed: 20260914 });

    expect(a.obstacles.length).toBe(b.obstacles.length);
    expect(JSON.stringify(a.obstacles)).toBe(JSON.stringify(b.obstacles));
    expect(a.player.x).toBe(b.player.x);
    expect(a.buildings.length).toBe(b.buildings.length);
  });

  it('seed 真的在用（不同种子不会造出一模一样的世界）', () => {
    const layouts = new Set(
      [1, 2, 3, 4, 5].map((seed) =>
        JSON.stringify(createSeededScenario({ seed }).obstacles.slice(0, 8))
      )
    );
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('造完场景后全局 Math.random 已还原（不污染其它用例）', () => {
    const before = Math.random;
    createSeededScenario({ seed: 42 });
    expect(Math.random).toBe(before);
  });
});
