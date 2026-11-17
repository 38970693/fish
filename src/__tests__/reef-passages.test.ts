import { describe, expect, it } from 'vitest';
import { createReefCluster, getReefPassages, REEF_GAPS } from '../data/reefClusters';
import { canTraverseSegment, hasObstacleOcclusion, segmentClearance } from '../core/obstacleGeometry';
import { ObstacleIndex, resolveObstacles, captureTerrainFrame } from '../systems/terrain';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { generateEndlessChunkContent } from '../systems/endlessWorld';
import { findRefugeWaypoint, reefNavigationPoint, reefChaseWaitPoint, isReefChaseSkipped } from '../systems/reefNavigation';
import { processCollision } from '../systems/combat';
import { SKILL_HANDLERS } from '../systems/skills';
import { worldSystem } from '../systems/world';
import { awardPlayerGrowth, applyPlayerRadiusGrowth } from '../systems/playerGrowth';
import { applyEvolutionChoice, progressionSystem } from '../systems/progression';
import { possessMember } from '../systems/squad';
import { EventBus } from '../core/EventBus';
import { CreatureType } from '../data/creatures';
import { GameStatus, type FrameContext, type GameEvents, type Obstacle } from '../types';

const center = { x: 2000, y: 2000 };
const lane = () => createReefCluster('test-reef', center, 0, 56);
const context = (): FrameContext => ({
  dt: 1, screen: { width: 1280, height: 720 }, mouse: { x: 900, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  events: new EventBus<GameEvents>(),
});
const arena = () => {
  const state = createInitialState({ skipWorldGen: true, enableQuests: false, mode: 'LEGACY', worldMode: 'FINITE' });
  state.status = GameStatus.PLAYING; state.obstacles = lane();
  return state;
};
const mover = (radius: number) => ({ x: 1700, y: 2000, radius, angle: 0, vx: 600, vy: 0 });

describe('真实体型通道', () => {
  it('净宽从实体推导，连续半径与余量决定双向通行', () => {
    for (const gap of REEF_GAPS) for (const angle of [0, 0.77, 2.5]) {
      const obstacles = createReefCluster('rotated', center, angle, gap);
      const p = getReefPassages(obstacles)[0];
      expect(p.clearance).toBeCloseTo(gap / 2, 6);
      expect(canTraverseSegment(p.points[0], p.points[2], gap / 2 - 3, obstacles)).toBe(true);
      expect(canTraverseSegment(p.points[2], p.points[0], gap / 2 - 2.9, obstacles)).toBe(false);
    }
  });

  it('第三块礁石真的封路，水草与破碎岩层不挡路', () => {
    const obstacles = lane(), p = getReefPassages(obstacles)[0];
    const block: Obstacle = { id: 'extra', ...center, radius: 25, type: 'ROCK' };
    expect(getReefPassages([...obstacles, block])[0].clearance).toBe(-25);
    expect(hasObstacleOcclusion(p.points[0], p.points[2], [...obstacles, block])).toBe(true);
    expect(hasObstacleOcclusion(p.points[0], p.points[2], [...obstacles, { ...block, type: 'SEAWEED' }])).toBe(false);
    expect(canTraverseSegment(p.points[0], p.points[2], 22, [...obstacles, { ...block, featureState: 'BROKEN' }])).toBe(true);
  });

  it('高速位移小鱼穿过，大鱼稳定停在合法一侧；索引与全扫一致', () => {
    const obstacles = lane(), index = new ObstacleIndex(); index.rebuild(obstacles);
    for (const radius of [22, 26, 50]) {
      const a = mover(radius), b = mover(radius), origin = { x: a.x, y: a.y };
      a.x = b.x = 2300;
      resolveObstacles(a, obstacles, undefined, origin); resolveObstacles(b, obstacles, index, origin);
      expect(a.x).toBeCloseTo(b.x, 6); expect(a.y).toBeCloseTo(b.y, 6);
      if (radius === 22) expect(a.x).toBe(2300);
      else expect(a.x).toBeLessThan(2000);
      expect(canTraverseSegment(a, a, radius, obstacles)).toBe(true);
    }
  });

  it('两端可进入，侧墙没有大鱼可钻的漏口；缩小立刻获得通行资格', () => {
    const obstacles = lane();
    for (const x of [1892, 2000, 2108]) {
      expect(canTraverseSegment({ x, y: 1700 }, { x, y: 2000 }, 22, obstacles)).toBe(false);
    }
    const fish = mover(50); fish.x = 2300;
    resolveObstacles(fish, obstacles, undefined, { x: 1700, y: 2000 });
    expect(fish.x).toBeLessThan(2000);
    // Recenter in the approach lane before attempting the now-passable entrance.
    const origin = { x: 1700, y: 2000 }; fish.radius = 22; fish.x = 2300; fish.y = 2000;
    resolveObstacles(fish, obstacles, undefined, origin);
    expect(fish.x).toBe(2300);
  });

  it('单块薄障碍不能被一步跨过，起点位于圆心也能修正', () => {
    const obstacle: Obstacle = { id: 'thin', ...center, radius: 20, type: 'ROCK' };
    const fish = mover(12); fish.x = 2600;
    resolveObstacles(fish, [obstacle], undefined, { x: 1400, y: 2000 });
    expect(fish.x).toBeCloseTo(1968, 2);
    fish.x = 2000; fish.y = 2000;
    resolveObstacles(fish, [obstacle]);
    expect(segmentClearance(fish, fish, [obstacle])).toBeCloseTo(12, 6);
  });

  it('真实 world 阶段约束技能与外力的合成位移', () => {
    const state = arena(), p = state.player; p.x = 1700; p.y = 2000; p.radius = 50;
    captureTerrainFrame(state); p.x += 600; worldSystem(state, context());
    expect(p.x).toBeLessThan(2000);
    p.x = 1700; p.y = 2000; p.angle = 0;
    SKILL_HANDLERS.PIERCE(p, state, 3);
    expect(p.x).toBeLessThan(2000);
  });

  it('小鱼主动找藏身通道，大鱼不使用它的连接边', () => {
    const state = arena(), fish = createEntity(CreatureType.CLOWN_FISH, 1650, 2000);
    const threat = createEntity(CreatureType.HAMMERHEAD, 1450, 2000);
    fish.radius = 22; threat.radius = 50;
    const target = findRefugeWaypoint(fish, threat, state)!;
    expect(target).not.toBeNull(); expect(target.x).toBe(1758);
    expect(findRefugeWaypoint(threat, fish, state)).toBeNull();
    const goal = { x: 2350, y: 2000 };
    expect(reefNavigationPoint(fish, goal, state)).toEqual(goal);
    const detour = reefNavigationPoint(threat, goal, state);
    expect(detour).not.toEqual(goal);
    expect(canTraverseSegment(threat, detour, threat.radius, state.obstacles)).toBe(true);
    fish.x = 2000;
    expect(findRefugeWaypoint(fish, threat, state)!.x).toBe(2242);
  });

  it('隔着实体礁石不能咬，也不能用范围或点名技能命中', () => {
    const state = arena(), a = state.player;
    a.x = 2000; a.y = 1840; a.radius = 80; a.angle = Math.PI / 2; a.level = 20;
    const victim = createEntity(CreatureType.HAMMERHEAD, 2000, 2010);
    victim.radius = 100; victim.semiGhostTimer = 0; state.entities = [victim];
    const before = victim.health;
    processCollision(a, victim, state, context());
    expect(victim.health).toBe(before);
    SKILL_HANDLERS.THUNDER(a, state, 2);
    SKILL_HANDLERS.DEADLY_TEAR(a, state, 2);
    expect(victim.health).toBe(before);
  });

  it('大鱼短暂守在可达的外部出口，然后放弃洞内目标', () => {
    const state = arena(), prey = createEntity(CreatureType.CLOWN_FISH, 2000, 2000);
    const predator = createEntity(CreatureType.HAMMERHEAD, 1650, 2000);
    prey.radius = 22; predator.radius = 50;
    const wait = reefChaseWaitPoint(predator, prey, state)!;
    expect(canTraverseSegment(predator, wait, predator.radius, state.obstacles)).toBe(true);
    expect(isReefChaseSkipped(predator, prey, state.time)).toBe(false);
    state.time += 180; reefChaseWaitPoint(predator, prey, state);
    expect(isReefChaseSkipped(predator, prey, state.time)).toBe(true);
    state.time += 301;
    expect(isReefChaseSkipped(predator, prey, state.time)).toBe(false);
  });

  it('普通鱼塘包含通道，出生点与建筑入口不压在实体内', () => {
    for (const pondId of ['CLEAR', 'CORAL', 'ABYSS'] as const) {
      const state = createInitialState({ mode: 'RIVALS', pondLayout: 'PROCEDURAL', pondSeed: 42, pondId, worldMode: 'FINITE' });
      const passages = getReefPassages(state.obstacles);
      expect(passages.length).toBeGreaterThan(0);
      expect(canTraverseSegment(state.player, state.player, 200, state.obstacles)).toBe(true);
      for (const b of state.buildings) expect(canTraverseSegment(b, b, b.radius + 100, state.obstacles)).toBe(true);
      for (const p of passages) expect(p.clearance).toBeGreaterThanOrEqual(28 - 1e-5);
    }
  });

  it('在宽一点的洞内升级也保留出口容量，游出去后吸收剩余体型增长', () => {
    const state = arena(), p = state.player;
    p.config = { ...p.config, baseRadius: 30 };
    p.x = 2000; p.y = 2000; p.radius = 24;
    awardPlayerGrowth(state, context(), 100);
    expect(p.radius).toBe(25);
    expect(p.pendingRadiusGrowth).toBeGreaterThan(0);
    expect(canTraverseSegment(p, { x: 2242, y: 2000 }, p.radius, state.obstacles)).toBe(true);
    const pending = p.pendingRadiusGrowth!;
    p.x = 2400;
    for (let i = 0; i < 60; i++) applyPlayerRadiusGrowth(state);
    expect(p.pendingRadiusGrowth).toBe(0);
    expect(p.radius).toBeCloseTo(25 + pending, 5);
  });

  it('狭处选择进化后继续游动，到宽处再换大身体', () => {
    const state = arena(), p = state.player;
    p.x = 2000; p.y = 2000; p.radius = 22;
    const original = p.type;
    applyEvolutionChoice(state, CreatureType.HAMMERHEAD);
    expect(p.type).toBe(original); expect(p.pendingEvolutionType).toBe(CreatureType.HAMMERHEAD);
    expect(state.status).toBe(GameStatus.PLAYING);
    progressionSystem(state, context()); expect(state.status).toBe(GameStatus.PLAYING);
    p.x = 2400;
    progressionSystem(state, context());
    expect(p.type).toBe(CreatureType.HAMMERHEAD); expect(p.pendingEvolutionType).toBeUndefined();
    expect(canTraverseSegment(p, p, p.radius, state.obstacles)).toBe(true);
  });

  it('窄处亡语复活采用新身体的合法位置，避免把大身体塞在旧洞内', () => {
    const state = arena(), p = state.player;
    p.x = 2000; p.y = 2000; p.radius = 22; p.health = 0;
    const member = createEntity(CreatureType.HAMMERHEAD, 2400, 2000);
    member.ownerId = 'player'; state.entities = [member];
    expect(possessMember(state, member.id, { revive: true })).toBe(true);
    expect(p.x).toBe(2400);
    expect(canTraverseSegment(p, p, p.radius, state.obstacles)).toBe(true);
  });

  it('远洋礁群稳定重访，平移原点不改变净空或成员身份', () => {
    let found = 0;
    for (let x = -3; x <= 3; x++) {
      const a = generateEndlessChunkContent(42, BigInt(x), 2n);
      expect(a).toEqual(generateEndlessChunkContent(42, BigInt(x), 2n));
      const b = generateEndlessChunkContent(42, BigInt(x), 2n, 100000000000000000n, -100000000000000000n);
      // Every rejection test is local, so even a remote origin cannot change object identities.
      const c = generateEndlessChunkContent(42, BigInt(x), 2n, BigInt(x), 2n);
      expect(b.obstacles.map(o => o.id)).toEqual(a.obstacles.map(o => o.id));
      const pa = getReefPassages(a.obstacles), pc = getReefPassages(c.obstacles);
      found += pa.length;
      pc.forEach((p, i) => expect(p.clearance).toBeCloseTo(pa[i].clearance, 6));
      for (const p of pc) {
        expect(p.center.x).toBeGreaterThanOrEqual(400); expect(p.center.x).toBeLessThanOrEqual(1400);
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
