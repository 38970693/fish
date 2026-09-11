/**
 * 多鱼塘阶段 2a 测试 —— 塘际传送门与世界重建。
 *
 * 覆盖：塘际门生成 / 障碍密度按塘缩放 / pondTravel 换塘与清场（战队保留）/
 * 同塘或非法目标不触发 / 铺底撒鱼 / worldSystem 按门种类分流 / 闪屏计时 / 死循环锁。
 *
 * ⚠️ world.ts 的传送冷却 `teleportLockUntilFrame` 是模块级状态，会跨用例泄漏，
 * 每个用例开头先 __resetTeleportLock()（与 squad 的 __resetSwitchCursor 同理）。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { pondTravel, createObstacles, createPortals, worldSystem, __resetTeleportLock } from '../systems/world';
import { createEntity } from '../systems/spawn';
import { otherPonds, POND_DATA } from '../data/ponds';
import { MAP_CENTER } from '../systems/terrain';
import { CreatureType } from '../data/creatures';
import { EventBus } from '../core/EventBus';
import { GameStatus, type FrameContext, type GameEvents, type GameState } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

/** 用固定种子的 LCG 顶掉 Math.random：同样的种子 → 同样的世界，便于确定性地比较数量 */
const withSeededRandom = <T>(seed: number, fn: () => T): T => {
  const orig = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
};

/** 造一扇塘际门，并把玩家放到门里 */
const standOnPondPortal = (state: GameState, targetPond: string): void => {
  state.portals = [
    {
      id: 'pp-1',
      x: MAP_CENTER.x + 900,
      y: MAP_CENTER.y,
      radius: 112,
      angle: 0,
      name: `${POND_DATA[targetPond as keyof typeof POND_DATA].name}·门`,
      kind: 'POND',
      targetPond,
    },
  ];
  state.player.x = MAP_CENTER.x + 900;
  state.player.y = MAP_CENTER.y;
};

beforeEach(() => {
  __resetTeleportLock();
});

describe('塘际门生成', () => {
  it('每个「别的塘」一扇塘际门，塘内门仍是 4 扇，且不指向自己', () => {
    const portals = createPortals('CLEAR');
    const pondPortals = portals.filter((p) => p.kind === 'POND');
    const other = otherPonds('CLEAR');

    expect(pondPortals).toHaveLength(other.length);
    expect(pondPortals.map((p) => p.targetPond).sort()).toEqual([...other].sort());
    pondPortals.forEach((p) => expect(p.targetPond).not.toBe('CLEAR'));

    const locals = portals.filter((p) => (p.kind ?? 'LOCAL') === 'LOCAL');
    expect(locals).toHaveLength(4);
    // 塘际门更大，一眼能认出来
    pondPortals.forEach((p) => expect(p.radius).toBeGreaterThan(locals[0].radius));
  });

  it('塘际门的位置在地图内（不会生成到花瓣外面）', () => {
    const portals = createPortals('CORAL').filter((p) => p.kind === 'POND');
    portals.forEach((p) => {
      const d = Math.hypot(p.x - MAP_CENTER.x, p.y - MAP_CENTER.y);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(2000); // 花瓣最小半径
    });
  });
});

describe('障碍物密度按塘缩放', () => {
  it('珊瑚塘（礁石密布）> 清水塘 > 深渊塘（空旷）', () => {
    // 同一个随机种子跑三遍：差异只来自 obstacleScale，结果可复现
    const count = (pondId: string) => withSeededRandom(20260911, () => createObstacles(pondId).length);
    const clear = count('CLEAR');
    const coral = count('CORAL');
    const abyss = count('ABYSS');

    expect(coral).toBeGreaterThan(clear);
    expect(clear).toBeGreaterThan(abyss);
  });

  it('未知塘按默认塘的密度算', () => {
    const a = withSeededRandom(7, () => createObstacles('NOPE').length);
    const b = withSeededRandom(7, () => createObstacles('CLEAR').length);
    expect(a).toBe(b);
  });
});

describe('pondTravel · 换塘与世界重建', () => {
  it('切换塘、玩家回中心、加保护、闪屏出现，成长与分数保留', () => {
    const state = createInitialState({ pondId: 'CLEAR' });
    state.status = GameStatus.PLAYING;
    state.score = 777;
    state.player.weight = 250;
    state.player.level = 12;
    state.player.skillLevel = 5;

    const ok = pondTravel(state, 'ABYSS');

    expect(ok).toBe(true);
    expect(state.pondId).toBe('ABYSS');
    expect(state.player.x).toBe(MAP_CENTER.x);
    expect(state.player.y).toBe(MAP_CENTER.y);
    expect(state.player.vx).toBe(0);
    expect(state.player.vy).toBe(0);
    expect(state.player.invulnerableTimer).toBeGreaterThan(0);
    expect(state.screenFlash?.color).toBe(POND_DATA.ABYSS.color);
    // 成长与分数跟着走
    expect(state.score).toBe(777);
    expect(state.player.weight).toBe(250);
    expect(state.player.level).toBe(12);
    expect(state.player.skillLevel).toBe(5);
    // 地形按新塘重建
    expect(state.obstacles.length).toBeGreaterThan(0);
    expect(state.portals.some((p) => p.kind === 'POND' && p.targetPond === 'CLEAR')).toBe(true);
    expect(state.buildings.length).toBeGreaterThan(0);
  });

  it('清场：野鱼/道具/宝藏/危险/粒子/飘字全清，战队成员保留并挪到玩家身边', () => {
    const state = createInitialState({ skipWorldGen: true, pondId: 'CLEAR' });
    state.status = GameStatus.PLAYING;

    state.entities.push(createEntity(CreatureType.CLOWN_FISH, 100, 100)); // 野鱼
    const mate = createEntity(CreatureType.BLUE_TANG, 200, 200);
    mate.ownerId = 'player'; // 战队成员
    state.entities.push(mate);

    state.powerUps.push({ id: 'u1', x: 0, y: 0, type: 'SPEED', value: 1 } as never);
    state.treasures.push({ id: 't1', x: 0, y: 0, type: 'GEM', status: 'ACTIVE', timer: 1, radius: 60 } as never);
    state.hazards.push({ id: 'h1', x: 0, y: 0, type: 'METEOR', status: 'WARNING', timer: 1, radius: 350 } as never);
    state.particles.push({ id: 'pa1', x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, color: '#fff', size: 1 } as never);
    state.labels.push({ id: 'la1', text: '逆转!', x: 0, y: 0, color: '#fff', timer: 1 } as never);

    pondTravel(state, 'CORAL');

    expect(state.entities).toHaveLength(1);
    expect(state.entities[0].id).toBe(mate.id);
    expect(state.powerUps).toHaveLength(0);
    expect(state.treasures).toHaveLength(0);
    expect(state.hazards).toHaveLength(0);
    expect(state.particles).toHaveLength(0);
    expect(state.labels).toHaveLength(0);
    // 成员被挪到玩家身边（不会留在旧塘的坐标上）
    expect(Math.hypot(mate.x - state.player.x, mate.y - state.player.y)).toBeLessThan(500);
  });

  it('同塘 / 空目标不触发换塘', () => {
    const state = createInitialState({ skipWorldGen: true, pondId: 'CLEAR' });
    expect(pondTravel(state, 'CLEAR')).toBe(false);
    expect(pondTravel(state, undefined)).toBe(false);
    expect(pondTravel(state, null)).toBe(false);
    expect(state.pondId).toBe('CLEAR');
  });

  it('传 ctx 才给新塘铺底撒鱼（不传 = 空塘，方便单测断言）', () => {
    const state = createInitialState({ skipWorldGen: true, pondId: 'CLEAR' });
    state.status = GameStatus.PLAYING;

    pondTravel(state, 'CORAL');
    expect(state.entities).toHaveLength(0);

    pondTravel(state, 'ABYSS', makeCtx());
    expect(state.entities.length).toBeGreaterThan(0);
  });

  it('铺底的鱼不会超过实体上限', () => {
    const state = createInitialState({ skipWorldGen: true, pondId: 'CLEAR' });
    state.status = GameStatus.PLAYING;
    for (let i = 0; i < 200; i += 1) state.entities.push(createEntity(CreatureType.PLANKTON, 0, 0));
    pondTravel(state, 'ABYSS', makeCtx());
    expect(state.entities.length).toBeLessThanOrEqual(200);
  });
});

describe('worldSystem · 门的分流', () => {
  it('走进塘际门 → 换塘', () => {
    const state = createInitialState({ skipWorldGen: true, pondId: 'CLEAR' });
    state.status = GameStatus.PLAYING;
    standOnPondPortal(state, 'ABYSS');

    worldSystem(state, makeCtx());

    expect(state.pondId).toBe('ABYSS');
    expect(state.screenFlash).not.toBeNull();
  });

  it('塘内门只在塘内门里挑目标，不会把玩家丢到塘际门上', () => {
    const state = createInitialState({ skipWorldGen: true, pondId: 'CLEAR' });
    state.status = GameStatus.PLAYING;
    state.portals = [
      { id: 'l1', x: MAP_CENTER.x + 900, y: MAP_CENTER.y, radius: 100, angle: 0, name: '浅滩之门', kind: 'LOCAL' },
      { id: 'l2', x: MAP_CENTER.x - 800, y: MAP_CENTER.y, radius: 80, angle: 0, name: '珊瑚之门', kind: 'LOCAL' },
      { id: 'p1', x: MAP_CENTER.x, y: MAP_CENTER.y, radius: 112, angle: 0, name: '深渊塘·门', kind: 'POND', targetPond: 'ABYSS' },
    ];
    state.player.x = MAP_CENTER.x + 900;
    state.player.y = MAP_CENTER.y;

    worldSystem(state, makeCtx());

    expect(state.pondId).toBe('CLEAR'); // 没换塘
    // 被送到另一扇塘内门旁边
    expect(Math.hypot(state.player.x - (MAP_CENTER.x - 800), state.player.y - MAP_CENTER.y)).toBeLessThan(300);
  });

  it('换塘后同一帧内不会再被吸走（冷却锁生效）', () => {
    const state = createInitialState({ skipWorldGen: true, pondId: 'CLEAR' });
    state.status = GameStatus.PLAYING;
    standOnPondPortal(state, 'ABYSS');
    const ctx = makeCtx();

    worldSystem(state, ctx);
    expect(state.pondId).toBe('ABYSS');

    // 把玩家硬塞到新塘的一扇塘际门上，冷却期间不该再次换塘
    const next = state.portals.find((p) => p.kind === 'POND');
    if (next) {
      state.player.x = next.x;
      state.player.y = next.y;
      worldSystem(state, ctx);
      expect(state.pondId).toBe('ABYSS');
    }
  });

  it('闪屏计时逐帧递减并归零', () => {
    const state = createInitialState({ skipWorldGen: true, pondId: 'CLEAR' });
    state.status = GameStatus.PLAYING;
    state.screenFlash = { timer: 3, color: '#ffffff' };
    const ctx = makeCtx();

    worldSystem(state, ctx);
    worldSystem(state, ctx);
    expect(state.screenFlash?.timer).toBe(1);

    worldSystem(state, ctx);
    expect(state.screenFlash).toBeNull();
  });
});
