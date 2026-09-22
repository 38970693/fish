import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import { OBSTACLE_ECOLOGY } from '../data/obstacleEcology';
import { createInitialState } from '../factories/initialState';
import { SYSTEMS } from '../systems';
import {
  configureObstacleEcology,
  obstacleEcologySystem,
  sampleVentForce,
} from '../systems/obstacleEcology';
import { createEntity } from '../systems/spawn';
import { worldSystem } from '../systems/world';
import type { FrameContext, GameEvents, Obstacle } from '../types';

const ctx: FrameContext = {
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
};

const brittle = (): Obstacle => ({
  id: 'brittle-test', x: 1000, y: 1000, radius: 100, type: 'ROCK',
  feature: 'BRITTLE', featureState: 'IDLE', durability: 100, maxDurability: 100,
});

const vent = (overrides: Partial<Obstacle> = {}): Obstacle => ({
  id: 'vent-test', x: 1000, y: 1000, radius: 100, type: 'ROCK',
  feature: 'VENT', featureState: 'ACTIVE', featureTimer: 30, featureAngle: 0,
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe('生态障碍', () => {
  it('特征分配稳定且不调用 Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const a = configureObstacleEcology({ id: 'stable-rock', x: 0, y: 0, radius: 100, type: 'ROCK' });
    const b = configureObstacleEcology({ id: 'stable-rock', x: 0, y: 0, radius: 100, type: 'ROCK' });
    expect({ feature: b.feature, angle: b.featureAngle, timer: b.featureTimer }).toEqual({
      feature: a.feature, angle: a.featureAngle, timer: a.featureTimer,
    });
    expect(random).not.toHaveBeenCalled();
  });

  it('普通接触不会破坏岩层，加速正面撞击会破坏并掉落三枚金币', () => {
    const state = createInitialState({ skipWorldGen: true });
    const rock = brittle();
    state.obstacles = [rock];
    state.player.x = rock.x - rock.radius - state.player.radius + 2;
    state.player.y = rock.y;
    state.player.vx = state.player.speed * 2;
    state.player.vy = 0;
    state.player.boost.active = false;
    obstacleEcologySystem(state, ctx);
    expect(rock.featureState).toBe('IDLE');

    state.player.boost.active = true;
    obstacleEcologySystem(state, ctx);
    expect(rock.featureState).toBe('BROKEN');
    expect(rock.durability).toBe(0);
    expect(state.powerUps.filter(item => item.type === 'COIN')).toHaveLength(OBSTACLE_ECOLOGY.BRITTLE_COIN_COUNT);
  });

  it('背向岩层加速不会误触发破坏', () => {
    const state = createInitialState({ skipWorldGen: true });
    const rock = brittle();
    state.obstacles = [rock];
    state.player.x = rock.x - rock.radius - state.player.radius + 2;
    state.player.y = rock.y;
    state.player.vx = -state.player.speed * 2;
    state.player.vy = 0;
    state.player.boost.active = true;
    obstacleEcologySystem(state, ctx);
    expect(rock.featureState).toBe('IDLE');
  });

  it('破碎岩层退出实体碰撞', () => {
    const state = createInitialState({ skipWorldGen: true });
    const rock = brittle();
    rock.featureState = 'BROKEN';
    state.obstacles = [rock];
    state.player.x = rock.x;
    state.player.y = rock.y;
    state.player.vx = state.player.vy = 0;
    worldSystem(state, ctx);
    expect(state.player.x).toBe(rock.x);
    expect(state.player.y).toBe(rock.y);
  });

  it('热泉按休眠、预警、喷发顺序循环', () => {
    const state = createInitialState({ skipWorldGen: true });
    const source = vent({ featureState: 'IDLE', featureTimer: 1 });
    state.obstacles = [source];
    obstacleEcologySystem(state, ctx);
    expect(source.featureState).toBe('WARNING');
    expect(source.featureTimer).toBe(OBSTACLE_ECOLOGY.VENT_WARNING_FRAMES);
    source.featureTimer = 1;
    obstacleEcologySystem(state, ctx);
    expect(source.featureState).toBe('ACTIVE');
    expect(source.featureTimer).toBe(OBSTACLE_ECOLOGY.VENT_ACTIVE_FRAMES);
    source.featureTimer = 1;
    obstacleEcologySystem(state, ctx);
    expect(source.featureState).toBe('IDLE');
    expect(source.featureTimer).toBe(OBSTACLE_ECOLOGY.VENT_IDLE_FRAMES);
  });

  it('上涌流同时推动玩家和 AI，圆形范围外不受影响', () => {
    const state = createInitialState({ skipWorldGen: true });
    const source = vent();
    state.obstacles = [source];
    state.player.x = 1250;
    state.player.y = 1000;
    state.player.vx = state.player.vy = 0;
    const inside = createEntity('CLOWN_FISH', 1250, 1010);
    inside.vx = inside.vy = 0;
    const outside = createEntity('CLOWN_FISH', 1250, 1400);
    outside.vx = outside.vy = 0;
    state.entities = [inside, outside];
    obstacleEcologySystem(state, ctx);
    expect(state.player.x).toBeGreaterThan(1250);
    expect(inside.x).toBeGreaterThan(1250);
    expect(outside.x).toBe(1250);
    expect(outside.y).toBe(1400);
    expect(sampleVentForce(source, { x: 1250, y: 1000 })?.x).toBeGreaterThan(0);
    expect(sampleVentForce(source, { x: 800, y: 1000 })?.x).toBeLessThan(0);
    expect(sampleVentForce(source, { x: 1000, y: 1200 })?.y).toBeGreaterThan(0);
    expect(sampleVentForce(source, { x: 1600, y: 1000 })).toBeNull();
  });

  it('同距离四个方向获得对称的径向推力', () => {
    const source = vent();
    const right = sampleVentForce(source, { x: 1250, y: 1000 })!;
    const left = sampleVentForce(source, { x: 750, y: 1000 })!;
    const down = sampleVentForce(source, { x: 1000, y: 1250 })!;
    const up = sampleVentForce(source, { x: 1000, y: 750 })!;
    expect(right.strength).toBeCloseTo(left.strength);
    expect(right.strength).toBeCloseTo(down.strength);
    expect(right.strength).toBeCloseTo(up.strength);
    expect(right.x).toBeCloseTo(-left.x);
    expect(down.y).toBeCloseTo(-up.y);
  });

  it('系统位于洋流之后、世界碰撞之前', () => {
    const names = SYSTEMS.map(system => system.name);
    expect(names.indexOf('obstacleEcology')).toBeGreaterThan(names.indexOf('habitats'));
    expect(names.indexOf('obstacleEcology')).toBeLessThan(names.indexOf('world'));
  });
});
