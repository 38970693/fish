/**
 * 隐蔽（水草掩体）测试 —— 「水草不能躲避追杀」的回归防护。
 *
 * 修复前的两个独立缺陷，这里各有用例盯着：
 *   ① 水草混在 `state.obstacles` 里被 `resolveObstacles` 一起推开 → 玩家物理上进不去；
 *   ② AI 的锁定判定从不检查隐蔽状态 → 躲进去了照样被追，连「伪装」技能都是摆设。
 *
 * ⚠️ 两个坑，写用例时必须绕开：
 *   · `createEntity` 生成的鱼带 `semiGhostTimer`（不能吃也不能被吃），测试里清零。
 *   · `resolveObstacles` 对 `d === 0` 直接跳过（防除零），所以「被推开」的对照组
 *     不能把玩家摆在障碍正中心，否则推出量为 0、断言假通过。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { aiSystem } from '../systems/ai';
import {
  concealmentSystem,
  isInSeaweedCover,
  isConcealed,
  CONCEAL_REVEAL_RANGE,
} from '../systems/concealment';
import { worldSystem, __resetTeleportLock } from '../systems/world';
import { MAP_CENTER } from '../systems/terrain';
import { CreatureType } from '../data/creatures';
import { EventBus } from '../core/EventBus';
import type { FrameContext, GameEvents, GameState, Obstacle } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const makeState = (): GameState => createInitialState();

const seaweedAt = (x: number, y: number, radius = 200): Obstacle => ({
  id: 'sw-1', x, y, radius, type: 'SEAWEED',
});
const rockAt = (x: number, y: number, radius = 200): Obstacle => ({
  id: 'rk-1', x, y, radius, type: 'ROCK',
});

/** 追杀者：双髻鲨是 AGGRESSIVE / tier3（level 4 > 玩家 1），会主动追比自己小的目标 */
const makePursuer = (x: number, y: number) => {
  const fish = createEntity(CreatureType.HAMMERHEAD, x, y);
  fish.semiGhostTimer = 0;
  fish.angle = 0; // 背对玩家（玩家在左边）—— 真追的话会被 turnToward 掰向 π
  return fish;
};

/**
 * 搭一个「大鱼在右、玩家在中间」的追杀场景。
 * `state.time = 1` 是刻意的：aggressive 行为有 `time % 140 === 0` 的随机转向，
 * time=0 会让角度被随机量污染，断言就不准了。
 */
const setupChase = (distance: number, hiddenInSeaweed: boolean) => {
  const state = makeState();
  state.time = 1;
  state.player.x = MAP_CENTER.x;
  state.player.y = MAP_CENTER.y;
  state.obstacles = hiddenInSeaweed ? [seaweedAt(MAP_CENTER.x, MAP_CENTER.y, 300)] : [];
  const fish = makePursuer(MAP_CENTER.x + distance, MAP_CENTER.y);
  state.entities = [fish];
  concealmentSystem(state); // 刷新 inCover
  return { state, fish };
};

beforeEach(() => {
  __resetTeleportLock();
});

/* ══════════════ 1. 掩体判定 ══════════════ */

describe('水草掩体判定', () => {
  it('水草半径 85% 以内算藏好，擦着边缘不算', () => {
    const obs = [seaweedAt(1000, 1000, 200)];
    expect(isInSeaweedCover(1000, 1000, obs)).toBe(true);
    expect(isInSeaweedCover(1000, 1000 + 200 * 0.8, obs)).toBe(true);
    expect(isInSeaweedCover(1000, 1000 + 200 * 0.9, obs)).toBe(false);
    expect(isInSeaweedCover(1000 + 500, 1000, obs)).toBe(false);
  });

  it('只认水草：岩石和珊瑚是实心的，不提供掩体', () => {
    expect(isInSeaweedCover(0, 0, [rockAt(0, 0)])).toBe(false);
    expect(
      isInSeaweedCover(0, 0, [{ id: 'c1', x: 0, y: 0, radius: 200, type: 'CORAL' }])
    ).toBe(false);
  });

  it('isConcealed = 隐身技能 或 藏在水草里', () => {
    const e = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    e.camoActive = false;
    e.inCover = false;
    expect(isConcealed(e)).toBe(false);

    e.inCover = true;
    expect(isConcealed(e)).toBe(true);

    e.inCover = false;
    e.camoActive = true;
    expect(isConcealed(e)).toBe(true);
  });
});

/* ══════════════ 2. 每帧刷新 ══════════════ */

describe('concealmentSystem 每帧刷新隐蔽状态', () => {
  it('玩家与野鱼站在水草里 → inCover=true；站外面 =false', () => {
    const state = makeState();
    state.obstacles = [seaweedAt(3000, 3000, 200)];
    state.player.x = 3000;
    state.player.y = 3000;
    const inside = createEntity(CreatureType.HAMMERHEAD, 3050, 3000);
    const outside = createEntity(CreatureType.HAMMERHEAD, 3400, 3000);
    state.entities = [inside, outside];

    concealmentSystem(state);

    expect(state.player.inCover).toBe(true);
    expect(inside.inCover).toBe(true);
    expect(outside.inCover).toBe(false);
  });

  it('没有水草时不残留上一帧的隐蔽状态', () => {
    const state = makeState();
    state.player.inCover = true;
    state.obstacles = [rockAt(3000, 3000)];
    state.entities = [];

    concealmentSystem(state);

    expect(state.player.inCover).toBe(false);
  });
});

/* ══════════════ 3. AI 锁定被隐蔽挡住 ══════════════ */

describe('AI 看不见隐蔽目标', () => {
  it('玩家藏在水草里 → 大鱼不再朝玩家转向', () => {
    const { state, fish } = setupChase(600, true);
    expect(state.player.inCover).toBe(true);

    aiSystem(state, makeCtx());

    // 背对着玩家的角度原封不动 = 没锁定（真追的话会被掰向 π）
    expect(fish.angle).toBe(0);
  });

  it('对照组：没藏起来时，同一场景大鱼立刻转向玩家', () => {
    const { state, fish } = setupChase(600, false);
    expect(state.player.inCover).toBe(false);

    aiSystem(state, makeCtx());

    expect(fish.angle).not.toBe(0);
  });

  it('贴到脸上就藏不住了（CONCEAL_REVEAL_RANGE 内照样被追）', () => {
    const { state, fish } = setupChase(Math.floor(CONCEAL_REVEAL_RANGE / 2), true);
    expect(state.player.inCover).toBe(true);

    aiSystem(state, makeCtx());

    // 贴脸 → 识破 → 转向
    expect(fish.angle).not.toBe(0);
  });

  it('「伪装」技能（camoActive）同样让 AI 跟丢', () => {
    const { state, fish } = setupChase(600, false);
    state.player.camoActive = true;

    aiSystem(state, makeCtx());

    expect(fish.angle).toBe(0);
  });

  it('声呐反制：猎手 sonarTimer > 0 时能看穿隐蔽', () => {
    const { state, fish } = setupChase(600, true);
    fish.sonarTimer = 60;

    aiSystem(state, makeCtx());

    expect(fish.angle).not.toBe(0);
  });
});

/* ══════════════ 4. 甩掉愤怒追击 ══════════════ */

describe('藏起来能甩掉愤怒追击', () => {
  it('愤怒中的大鱼找不到隐蔽的玩家 → 愤怒清零 + 冒「?」', () => {
    const { state, fish } = setupChase(600, true);
    fish.angerTimer = 300;
    // 反制技能设成冷却中，避免它靠声呐又把玩家找回来（那是另一条链路，单独测）
    fish.schoolSkillCooldown = 999;

    aiSystem(state, makeCtx());

    expect(fish.angerTimer).toBe(0);
    expect(fish.speechBubble?.text).toBe('?');
  });

  it('没藏起来时愤怒照旧不清零', () => {
    const { state, fish } = setupChase(600, false);
    fish.angerTimer = 300;
    fish.schoolSkillCooldown = 999;

    aiSystem(state, makeCtx());

    expect(fish.angerTimer).toBeGreaterThan(0);
  });
});

/* ══════════════ 5. 水草可穿行 ══════════════ */

describe('水草可穿行（不再当实体障碍推开玩家）', () => {
  /** 玩家摆在障碍中心偏 50px —— 正中心会命中 resolveObstacles 的 d===0 跳过分支 */
  const runWith = (obstacle: Obstacle) => {
    const state = makeState();
    state.buildings = [];
    state.portals = [];
    state.obstacles = [obstacle];
    state.player.x = MAP_CENTER.x + 50;
    state.player.y = MAP_CENTER.y;
    state.player.currentBiome = 'ABYSS'; // 与中心点的真实生态区一致，避免发气泡干扰
    state.entities = [];
    worldSystem(state, makeCtx());
    return Math.hypot(state.player.x - (MAP_CENTER.x + 50), state.player.y - MAP_CENTER.y);
  };

  it('水草不推人：站在水草里位置不变', () => {
    expect(runWith(seaweedAt(MAP_CENTER.x, MAP_CENTER.y, 200))).toBeLessThan(1);
  });

  it('对照组：岩石仍然是实心的，照样把人推出去', () => {
    expect(runWith(rockAt(MAP_CENTER.x, MAP_CENTER.y, 200))).toBeGreaterThan(1);
  });
});
