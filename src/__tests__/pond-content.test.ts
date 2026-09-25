/**
 * 多鱼塘阶段 3a 测试 —— 每塘独有内容（特产鱼 / 特产建筑 / 塘事件）。
 *
 * 覆盖：
 *   - 按塘生成池：特产鱼只进所属塘，全局鱼处处有，未知塘回退全塘视图
 *   - 数据自检：现有数据的 ponds 引用全部合法
 *   - 建筑按塘生成：特产建筑只在所属塘；三个新建筑的效果各有断言
 *   - 塘事件：清水塘无事件；珊瑚塘金币雨；深渊塘星光鱼群潮；间隔不对不触发
 *
 * ⚠️ world.ts 的 teleportLock 是模块级状态（本文件虽不传送，但 worldSystem 会跑），
 * 沿用惯例每个用例前 reset。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { createBuildings, worldSystem, __resetTeleportLock } from '../systems/world';
import { pondEventSystem } from '../systems/pondEvents';
import { explorationEventSystem } from '../systems/explorationEvents';
import {
  CREATURE_DATA,
  CreatureType,
  getSpawnPool,
  SPAWN_POOL_BY_TIER,
  POND_SPAWN_POOLS,
  validateCreatures,
} from '../data/creatures';
import { SKILL_DATA } from '../data/skills';
import { BUILDING_DATA, BuildingType } from '../data/buildings';
import { POND_EVENT_DATA, getPondSpecialties } from '../data/pondEvents';
import { POND_DATA } from '../data/ponds';
import { MAP_CENTER } from '../systems/terrain';
import { EventBus } from '../core/EventBus';
import { scoreGain } from '../data/ponds';
import type { FrameContext, GameEvents, GameState } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

beforeEach(() => {
  __resetTeleportLock();
});

/* ══════════════ ① 特产鱼：按塘生成池 ══════════════ */

describe('按塘生成池（特产鱼）', () => {
  it('清水塘特产：小丑鱼/锦鲤只在清水塘的池子里', () => {
    expect(getSpawnPool('CLEAR', 1)).toContain('CLOWN_FISH');
    expect(getSpawnPool('CLEAR', 2)).toContain('KOI');
    expect(getSpawnPool('CORAL', 1)).not.toContain('CLOWN_FISH');
    expect(getSpawnPool('ABYSS', 1)).not.toContain('CLOWN_FISH');
    expect(getSpawnPool('CORAL', 2)).not.toContain('KOI');
  });

  it('珊瑚塘特产：海马/帝王蟹/狮子鱼只在珊瑚塘', () => {
    expect(getSpawnPool('CORAL', 2)).toContain('SEAHORSE');
    expect(getSpawnPool('CORAL', 2)).toContain('CRAB');
    expect(getSpawnPool('CORAL', 3)).toContain('LIONFISH');
    expect(getSpawnPool('CLEAR', 2)).not.toContain('SEAHORSE');
    expect(getSpawnPool('ABYSS', 2)).not.toContain('CRAB');
    expect(getSpawnPool('CLEAR', 3)).not.toContain('LIONFISH');
  });

  it('海狮是独立于海狗的珊瑚塘大型物种', () => {
    expect(CREATURE_DATA.SEA_LION.name).toBe('海狮');
    expect(CREATURE_DATA.SEA_LION.shape).toBe('SEAL');
    expect(getSpawnPool('CORAL', 3)).toContain('SEA_LION');
    expect(getSpawnPool('CLEAR', 3)).not.toContain('SEA_LION');
    expect(getSpawnPool('ABYSS', 3)).not.toContain('SEA_LION');
    expect(CREATURE_DATA.FUR_SEAL.name).toBe('海狗');
  });

  it('深渊塘特产：水母/鮟鱇/吸血鬼乌贼/吞鳗/哥布林鲨/皇带鱼/星光鱼只在深渊塘', () => {
    expect(getSpawnPool('ABYSS', 1)).toContain('JELLYFISH');
    expect(getSpawnPool('ABYSS', 1)).toContain('STARLIGHT_FISH');
    expect(getSpawnPool('ABYSS', 2)).toContain('VAMPIRE_SQUID');
    expect(getSpawnPool('ABYSS', 2)).toContain('PELICAN_EEL');
    expect(getSpawnPool('ABYSS', 3)).toContain('ANGLER_FISH');
    expect(getSpawnPool('ABYSS', 3)).toContain('GOBLIN_SHARK');
    expect(getSpawnPool('ABYSS', 3)).toContain('OARFISH');
    expect(getSpawnPool('CLEAR', 1)).not.toContain('JELLYFISH');
    expect(getSpawnPool('CLEAR', 1)).not.toContain('STARLIGHT_FISH');
    expect(getSpawnPool('CORAL', 3)).not.toContain('ANGLER_FISH');
  });

  it('全局物种（蓝唐王鱼/海龟/河豚/大白鲨…）每个塘都有', () => {
    for (const pond of Object.keys(POND_DATA)) {
      expect(getSpawnPool(pond, 1)).toContain('BLUE_TANG');
      expect(getSpawnPool(pond, 1)).toContain('TURTLE');
      expect(getSpawnPool(pond, 2)).toContain('PUFFER_FISH');
      expect(getSpawnPool(pond, 4)).toContain('GREAT_WHITE');
    }
  });

  it('每个塘每个 tier 的池子都非空（任何塘都刷得出鱼）', () => {
    for (const pond of Object.keys(POND_SPAWN_POOLS)) {
      for (const tier of [1, 2, 3, 4]) {
        expect(POND_SPAWN_POOLS[pond as keyof typeof POND_SPAWN_POOLS][tier]?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('SPAWN_POOL_BY_TIER（全塘通用视图）包含所有可刷物种 —— 旧行为不回退', () => {
    const union = Object.values(SPAWN_POOL_BY_TIER).flat();
    const expected = Object.entries(CREATURE_DATA)
      .filter(([, s]) => {
        const spec = s as { tier: number; behavior: string };
        return spec.tier > 0 && spec.behavior !== 'MASCOT';
      })
      .map(([type]) => type);
    expect([...union].sort()).toEqual([...expected].sort());
  });

  it('未知塘回退全塘通用视图（向后兼容，绝不 undefined）', () => {
    expect(getSpawnPool('UNKNOWN_POND', 1)).toContain('CLOWN_FISH');
    expect(getSpawnPool(null, 2)).toContain('VAMPIRE_SQUID');
    expect(getSpawnPool(undefined, 3)).toContain('ANGLER_FISH');
  });

  it('现有数据的 ponds 引用全部合法（validateCreatures 不报塘错误）', () => {
    const problems = validateCreatures(Object.keys(SKILL_DATA)).filter((p) => p.includes('鱼塘') || p.includes('ponds'));
    expect(problems).toEqual([]);
  });
});

/* ══════════════ ② 特产建筑 ══════════════ */

describe('按塘生成建筑（特产建筑）', () => {
  it('清水塘有许愿池，没有珍珠场/沉船；全局建筑照常', () => {
    const buildings = createBuildings('CLEAR');
    const types = buildings.map((b) => b.type);
    expect(types).toContain(BuildingType.WISHING_WELL);
    expect(types).not.toContain(BuildingType.PEARL_FARM);
    expect(types).not.toContain(BuildingType.SHIPWRECK);
    expect(types.filter((t) => t === BuildingType.HOSPITAL)).toHaveLength(2);
    expect(types.filter((t) => t === BuildingType.SHRINE)).toHaveLength(2);
    expect(types).toContain(BuildingType.SHOP);
  });

  it('珊瑚塘只有珍珠场；深渊塘只有沉船', () => {
    const coral = createBuildings('CORAL').map((b) => b.type);
    expect(coral).toContain(BuildingType.PEARL_FARM);
    expect(coral).not.toContain(BuildingType.WISHING_WELL);
    expect(coral).not.toContain(BuildingType.SHIPWRECK);

    const abyss = createBuildings('ABYSS').map((b) => b.type);
    expect(abyss).toContain(BuildingType.SHIPWRECK);
    expect(abyss).not.toContain(BuildingType.WISHING_WELL);
    expect(abyss).not.toContain(BuildingType.PEARL_FARM);
  });

  it('许愿池：游进去稳定得金币（分数 + 气泡 + coin 事件）', () => {
    const state = createInitialState({ pondId: 'CLEAR', skipWorldGen: true });
    const well = {
      id: 'well-1', x: state.player.x, y: state.player.y,
      type: BuildingType.WISHING_WELL as string,
      radius: BUILDING_DATA.WISHING_WELL.radius, cooldown: 0,
    };
    state.buildings = [well];
    const ctx = makeCtx();
    const coins: unknown[] = [];
    ctx.events.on('coin', (e) => coins.push(e));

    worldSystem(state, ctx);

    expect(state.score).toBe(scoreGain('CLEAR', 15));
    expect(state.player.speechBubble?.text).toContain('许愿成功');
    expect(coins).toHaveLength(1);
    // 触发后进冷却，不会每帧白给
    expect(well.cooldown).toBe(BUILDING_DATA.WISHING_WELL.cooldown);
  });

  it('珍珠场：开出一圈金币道具（4 枚 COIN）', () => {
    const state = createInitialState({ pondId: 'CORAL', skipWorldGen: true });
    state.buildings = [{
      id: 'pearl-1', x: state.player.x, y: state.player.y,
      type: BuildingType.PEARL_FARM as string,
      radius: BUILDING_DATA.PEARL_FARM.radius, cooldown: 0,
    }];
    worldSystem(state, makeCtx());

    const coins = state.powerUps.filter((p) => p.type === 'COIN');
    expect(coins).toHaveLength(4);
  });

  it('沉船：按 E 搜索完成后才掉金币并惊扰吸血鬼乌贼', () => {
    const state = createInitialState({ pondId: 'ABYSS', skipWorldGen: true });
    state.buildings = [{
      id: 'wreck-1', x: state.player.x, y: state.player.y,
      type: BuildingType.SHIPWRECK as string,
      radius: BUILDING_DATA.SHIPWRECK.radius, cooldown: 0,
    }];
    const ctx = makeCtx();
    worldSystem(state, ctx);
    explorationEventSystem(state, ctx);
    expect(state.score).toBe(0);
    expect(state.buildings[0].prompt?.text).toContain('按 E 搜索');

    ctx.input.interact = true;
    explorationEventSystem(state, ctx);
    ctx.input.interact = false;
    for (let frame = 0; frame < 180; frame += 1) explorationEventSystem(state, ctx);

    expect(state.score).toBe(scoreGain('ABYSS', 30));
    expect(state.powerUps.filter((p) => p.type === 'COIN')).toHaveLength(5);
    const squid = state.entities.find((e) => e.type === CreatureType.VAMPIRE_SQUID);
    expect(squid).toBeTruthy();
    expect(squid!.angerTimer).toBeGreaterThan(0);
  });
});

/* ══════════════ ③ 塘事件 ══════════════ */

describe('塘专属事件', () => {
  it('清水塘没有大世界事件（什么时间点都不触发）', () => {
    const state = createInitialState({ pondId: 'CLEAR', skipWorldGen: true });
    expect(POND_EVENT_DATA.CLEAR).toBeNull();

    state.time = 3600;
    pondEventSystem(state, makeCtx());
    expect(state.powerUps).toHaveLength(0);
    expect(state.entities).toHaveLength(0);

    state.time = 2400;
    pondEventSystem(state, makeCtx());
    expect(state.powerUps).toHaveLength(0);
  });

  it('珊瑚产卵夜：每 3600 帧在玩家周围洒 6 枚金币', () => {
    const state = createInitialState({ pondId: 'CORAL', skipWorldGen: true });
    state.time = 3600;
    pondEventSystem(state, makeCtx());

    const coins = state.powerUps.filter((p) => p.type === 'COIN');
    expect(coins).toHaveLength(6);
    // 都落在玩家附近（看得见、够得着）
    coins.forEach((c) => {
      expect(Math.hypot(c.x - state.player.x, c.y - state.player.y)).toBeLessThanOrEqual(260);
    });
  });

  it('星光鱼群潮：每 2400 帧一群星光鱼过境（成簇出现）', () => {
    const state = createInitialState({ pondId: 'ABYSS', skipWorldGen: true });
    state.time = 2400;
    pondEventSystem(state, makeCtx());

    const fish = state.entities.filter((e) => e.type === CreatureType.STARLIGHT_FISH);
    expect(fish).toHaveLength(6);
    fish.forEach((f) => {
      expect(Math.hypot(f.x - state.player.x, f.y - state.player.y)).toBeLessThanOrEqual(420);
    });
  });

  it('间隔不对不触发：CORAL 在 2400 帧、ABYSS 在 3600 帧都安静', () => {
    const coral = createInitialState({ pondId: 'CORAL', skipWorldGen: true });
    coral.time = 2400;
    pondEventSystem(coral, makeCtx());
    expect(coral.powerUps).toHaveLength(0);

    const abyss = createInitialState({ pondId: 'ABYSS', skipWorldGen: true });
    abyss.time = 3600;
    pondEventSystem(abyss, makeCtx());
    expect(abyss.entities).toHaveLength(0);
  });
});

/* ══════════════ ④ 特产汇总（UI 数据） ══════════════ */

describe('getPondSpecialties（菜单塘卡数据）', () => {
  it('三条特产线齐全：珊瑚塘展示新增海狮，清水塘和深渊塘保持原样', () => {
    const clear = getPondSpecialties('CLEAR');
    expect(clear.fish).toEqual(['小丑鱼', '锦鲤']);
    expect(clear.building).toBe('许愿池');
    expect(clear.event).toBeNull();

    const coral = getPondSpecialties('CORAL');
    expect(coral.fish).toEqual(['海马', '帝王蟹', '狮子鱼', '海狮']);
    expect(coral.building).toBe('珍珠养殖场');
    expect(coral.event).toBe('珊瑚产卵夜');

    const abyss = getPondSpecialties('ABYSS');
    // 同 tier 按注册表插入顺序（稳定排序）：星光鱼插在蓝唐王鱼之后 → 排在水母前
    expect(abyss.fish).toEqual(['星光鱼', '水母', '吸血鬼乌贼', '吞鳗', '灯笼鱼', '哥布林鲨', '皇带鱼']);
    expect(abyss.building).toBe('沉船残骸');
    expect(abyss.event).toBe('星光鱼群潮');
  });

  it('未知塘回退默认塘（清水塘）的特产', () => {
    expect(getPondSpecialties('NOPE')).toEqual(getPondSpecialties('CLEAR'));
    expect(getPondSpecialties(undefined)).toEqual(getPondSpecialties('CLEAR'));
  });
});
