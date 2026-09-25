/**
 * 成就系统测试 —— 事件统计 / 差分统计 / 解锁 / 持久化 / 进度封顶。
 *
 * 用自己的 EventBus 喂事件（subscribeAchievements 支持传总线），
 * 不碰全局 gameEvents，用例之间用 __resetAchievementsForTest 隔离。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { itemsSystem } from '../systems/items';
import { CreatureType } from '../data/creatures';
import {
  subscribeAchievements,
  achievementsSystem,
  getAchievementView,
  getUnlockedCount,
  __resetAchievementsForTest,
} from '../systems/achievements';
import type { GameEvents, FrameContext, GameState } from '../types';

// src/test/setup.ts 把 window.localStorage 换成了空 mock（getItem 恒 undefined），
// 这里换回真正能读写的内存实现，专门验证持久化逻辑（只影响本文件，jsdom 每个测试文件独立 window）
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

const makeCtx = (): { ctx: FrameContext; bus: EventBus<GameEvents> } => {
  const bus = new EventBus<GameEvents>();
  return {
    bus,
    ctx: {
      mouse: { x: 0, y: 0 },
      input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
      screen: { width: 1280, height: 720 },
      events: bus,
      dt: 1,
    },
  };
};

const makeState = (): GameState => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = 'PLAYING' as GameState['status'];
  return state;
};

const view = (id: string) => getAchievementView().find((a) => a.id === id)!;

beforeEach(() => {
  __resetAchievementsForTest();
});

describe('成就 · 事件统计', () => {
  it('玩家吃鱼计入，第一条就解锁「初次开饭」', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    const prey = createEntity(CreatureType.CLOWN_FISH, 100, 100);
    bus.emit('eat', { attacker: state.player, victim: prey, isBackAttack: false, x: 0, y: 0 });
    achievementsSystem(state, ctx);

    expect(view('first-blood').unlocked).toBe(true);
    expect(view('first-blood').progress).toBe(1);
    expect(view('glutton').progress).toBe(1); // 不到 25，但进度在攒
    expect(getUnlockedCount()).toBe(1);
  });

  it('背刺只算对真鱼（tier>=1）绕后，且要玩家亲自吃的', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    const fish = createEntity(CreatureType.SWORD_FISH, 100, 100);
    const plankton = createEntity(CreatureType.PLANKTON, 0, 0);

    // 玩家背刺真鱼 → 计
    bus.emit('eat', { attacker: state.player, victim: fish, isBackAttack: true, x: 0, y: 0 });
    // 玩家背刺浮游生物 → 不计背刺（只计吃）
    bus.emit('eat', { attacker: state.player, victim: plankton, isBackAttack: true, x: 0, y: 0 });
    // AI 吃鱼 → 全不计
    bus.emit('eat', { attacker: fish, victim: plankton, isBackAttack: true, x: 0, y: 0 });
    achievementsSystem(state, ctx);

    expect(view('backstab').progress).toBe(1);
    // first-blood 的 goal 是 1，进度按设计封顶在 goal（展示不超上限）；
    // 看真实累计数要用上限更高的成就（老饕 goal=25）
    expect(view('glutton').progress).toBe(2);
  });

  it('等级只升不降，升级事件后取最大值', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    bus.emit('levelup', { entity: state.player, level: 5 });
    bus.emit('levelup', { entity: state.player, level: 3 }); // 掉级不存在，但防御一下
    achievementsSystem(state, ctx);

    expect(view('lv10').progress).toBe(5);
    expect(view('lv10').unlocked).toBe(false);
  });

  it('生态区去重：反复进出只算一次', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    bus.emit('biome', { from: 'SHALLOWS', to: 'REEF' });
    bus.emit('biome', { from: 'REEF', to: 'SHALLOWS' });
    bus.emit('biome', { from: 'SHALLOWS', to: 'SWAMP' });
    achievementsSystem(state, ctx);

    expect(view('biomes4').progress).toBe(3);
  });
});

describe('成就 · 差分统计（收编 / 夺舍没有事件，从 state.squad 差分）', () => {
  it('一局收编 3 只 → recruits +3', () => {
    const { bus: _bus, ctx } = makeCtx();
    subscribeAchievements(_bus);
    const state = makeState();

    state.squad.recruitedTotal = 3;
    achievementsSystem(state, ctx);
    expect(view('recruit10').progress).toBe(3);
  });

  it('重开一局计数归零：差分为负时不能倒扣', () => {
    const { bus: _bus, ctx } = makeCtx();
    subscribeAchievements(_bus);
    const state = makeState();

    state.squad.recruitedTotal = 5;
    achievementsSystem(state, ctx);
    expect(view('recruit10').progress).toBe(5);

    // 重开：新局 recruitedTotal 从 0 开始
    const fresh = makeState();
    achievementsSystem(fresh, ctx);
    expect(view('recruit10').progress).toBe(5); // 保留，不被清掉
  });
});

describe('成就 · 解锁与持久化', () => {
  it('解锁时通过事件总线广播，玩家头顶冒气泡', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    const fired: string[] = [];
    bus.on('achievement', ({ id }) => fired.push(id));

    state.squad.possessCount = 3; // 「灵魂大师」goal 3
    achievementsSystem(state, ctx);

    expect(fired).toContain('possess3');
    expect(state.player.speechBubble?.text).toContain('灵魂大师');
    expect(view('possess3').unlocked).toBe(true);
  });

  it('已解锁不重复广播', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    let fired = 0;
    bus.on('achievement', () => { fired += 1; });

    state.squad.possessCount = 3;
    achievementsSystem(state, ctx);
    achievementsSystem(state, ctx); // 第二帧：statsDirty 已清，不应再发
    state.squad.possessCount = 4;
    achievementsSystem(state, ctx); // 统计又脏了，但成就已解锁

    expect(fired).toBe(1);
  });

  it('解锁后写入 localStorage（跨局累计）', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    state.squad.possessCount = 3;
    achievementsSystem(state, ctx);

    const raw = localStorage.getItem('fish.achievements.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.unlocked['possess3']).toBeTruthy();
    expect(parsed.stats.possessions).toBe(3);
  });

  it('定义里每条成就的 stat 键都合法（数据自检）', () => {
    const legalKeys = ['eaten', 'backstabs', 'maxLevel', 'evolutions', 'reversals', 'treasures', 'biomes', 'recruits', 'possessions', 'coins', 'ponds', 'dexClear', 'dexCoral', 'dexAbyss', 'pondBuildings', 'wishingWell'];
    for (const def of getAchievementView()) {
      expect(legalKeys).toContain(def.stat);
      expect(def.goal).toBeGreaterThan(0);
      expect(def.icon.length).toBeGreaterThan(0);
    }
    expect(getAchievementView().length).toBeGreaterThanOrEqual(19);
  });

  it('coin 事件计入「守财奴」进度，够 20 枚解锁', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    for (let i = 0; i < 20; i += 1) bus.emit('coin', { x: 0, y: 0, value: 15 });
    achievementsSystem(state, ctx);

    expect(view('coin20').unlocked).toBe(true);
    expect(getUnlockedCount()).toBeGreaterThanOrEqual(1);
  });

  it('联动 items：拾取 COIN 加分、发 coin 事件、道具消失', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();
    state.player.x = 500;
    state.player.y = 500;
    state.powerUps.push({ id: 'c1', x: 500, y: 500, type: 'COIN', radius: 14 });
    const scoreBefore = state.score;

    itemsSystem(state, ctx);
    achievementsSystem(state, ctx);

    expect(state.score).toBeGreaterThanOrEqual(scoreBefore + 15);
    expect(view('coin20').progress).toBeGreaterThanOrEqual(1);
    // 拾取后 radius 置 0 → 被过滤掉
    expect(state.powerUps.find((p) => p.id === 'c1')).toBeUndefined();
  });
});

describe('成就 · 多鱼塘（阶段 3a 特产的变现）', () => {
  it('图鉴目标由塘特产种数推导，不是写死的数字', () => {
    // 清水塘 2 种（小丑鱼 / 锦鲤）、珊瑚塘 4 种（新增海狮）、深渊塘 7 种
    expect(view('dex-clear').goal).toBe(2);
    expect(view('dex-coral').goal).toBe(4);
    expect(view('dex-abyss').goal).toBe(7);
  });

  it('吃遍清水塘两种特产 → 解锁「清水图鉴」', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    for (const t of [CreatureType.CLOWN_FISH, CreatureType.KOI]) {
      bus.emit('eat', {
        attacker: state.player, victim: createEntity(t, 100, 100), isBackAttack: false, x: 0, y: 0,
      });
    }
    achievementsSystem(state, ctx);

    expect(view('dex-clear').unlocked).toBe(true);
  });

  it('图鉴去重：同一种特产鱼吃五次也只算一种（不然蹲着刷就能满）', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    for (let i = 0; i < 5; i += 1) {
      bus.emit('eat', {
        attacker: state.player,
        victim: createEntity(CreatureType.CLOWN_FISH, 100, 100),
        isBackAttack: false, x: 0, y: 0,
      });
    }
    achievementsSystem(state, ctx);

    expect(view('dex-clear').progress).toBe(1);
    expect(view('dex-clear').unlocked).toBe(false);
  });

  it('非特产鱼不进图鉴（剑鱼没有 ponds 字段）', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    bus.emit('eat', {
      attacker: state.player,
      victim: createEntity(CreatureType.SWORD_FISH, 100, 100),
      isBackAttack: false, x: 0, y: 0,
    });
    achievementsSystem(state, ctx);

    expect(view('dex-abyss').progress).toBe(0);
    expect(view('dex-clear').progress).toBe(0);
  });

  it('到访鱼塘按 state.pondId 差分：三塘走遍解锁「三塘旅人」', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    achievementsSystem(state, ctx); // 开局所在的清水塘也算到访
    expect(view('pond-traveler').progress).toBe(1);

    state.pondId = 'CORAL' as typeof state.pondId;
    achievementsSystem(state, ctx);
    expect(view('pond-traveler').progress).toBe(2);

    state.pondId = 'ABYSS' as typeof state.pondId;
    achievementsSystem(state, ctx);
    expect(view('pond-traveler').progress).toBe(3);
    expect(view('pond-traveler').unlocked).toBe(true);
  });

  it('三座特产建筑各触发一次 → 解锁「探宝者」；同一座冷却转好再来不重复计数', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    bus.emit('buildingUse', { type: 'WISHING_WELL' });
    bus.emit('buildingUse', { type: 'WISHING_WELL' }); // 冷却转好又来一次
    bus.emit('buildingUse', { type: 'PEARL_FARM' });
    achievementsSystem(state, ctx);
    expect(view('pond-explorer').progress).toBe(2);
    expect(view('pond-explorer').unlocked).toBe(false);

    bus.emit('buildingUse', { type: 'SHIPWRECK' });
    achievementsSystem(state, ctx);
    expect(view('pond-explorer').unlocked).toBe(true);
  });

  it('许愿池累计 5 次 → 解锁「许愿成真」（按次数算，不去重）', () => {
    const { bus, ctx } = makeCtx();
    subscribeAchievements(bus);
    const state = makeState();

    for (let i = 0; i < 5; i += 1) bus.emit('buildingUse', { type: 'WISHING_WELL' });
    achievementsSystem(state, ctx);

    expect(view('wish-come-true').unlocked).toBe(true);
  });
});
