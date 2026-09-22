import { describe, expect, it } from 'vitest';
import { CreatureType } from '../data/creatures';
import { EventBus } from '../core/EventBus';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { aiSystem, calculateSchoolHeading } from '../systems/ai';
import { MAP_CENTER } from '../systems/terrain';
import type { FrameContext, GameEvents } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

describe('鱼群效应', () => {
  it('对齐和聚合会把掉队鱼引回群体航向', () => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0, { moodId: 'CALM' });
    fish.angle = Math.PI;
    const neighbors = [80, 120, 160].map((x) => {
      const neighbor = createEntity(CreatureType.CLOWN_FISH, x, 0, { moodId: 'CALM' });
      neighbor.angle = 0; neighbor.vx = neighbor.speed; neighbor.vy = 0;
      return neighbor;
    });
    const heading = calculateSchoolHeading(fish, neighbors);
    expect(heading).not.toBeNull();
    expect(Math.abs(heading!)).toBeLessThan(Math.PI / 3);
  });

  it('贴得太近时分离力优先，避免鱼群叠成一个点', () => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0, { moodId: 'CALM' });
    fish.angle = 0;
    const neighbor = createEntity(CreatureType.CLOWN_FISH, 1, 0, { moodId: 'CALM' });
    neighbor.angle = 0; neighbor.vx = neighbor.speed; neighbor.vy = 0;
    const heading = calculateSchoolHeading(fish, [neighbor]);
    expect(Math.abs(heading!)).toBeGreaterThan(Math.PI * 0.75);
  });

  it('实际 AI 更新会让附近同类逐步趋向共同航向', () => {
    const state = createInitialState();
    state.time = 1;
    state.player.x = MAP_CENTER.x - 1800; state.player.y = MAP_CENTER.y;
    state.player.level = 1;
    const angles = [-0.8, 0.05, 0.9];
    state.entities = angles.map((angle, index) => {
      const fish = createEntity(CreatureType.CLOWN_FISH, MAP_CENTER.x + index * 85, MAP_CENTER.y + (index - 1) * 35, { moodId: 'CALM' });
      fish.angle = angle; fish.semiGhostTimer = 0;
      return fish;
    });
    const spread = () => Math.max(...state.entities.map(entity => entity.angle)) - Math.min(...state.entities.map(entity => entity.angle));
    const before = spread();
    for (let frame = 0; frame < 60; frame += 1) { state.time += 1; aiSystem(state, makeCtx()); }
    expect(spread()).toBeLessThan(before * 0.55);
    expect(state.entities.every(entity => Math.hypot(entity.vx, entity.vy) > 0)).toBe(true);
  });

  it('落单鱼连续缓转，不再按固定间隔突然甩头', () => {
    const state = createInitialState();
    state.time = 1;
    state.player.x = MAP_CENTER.x - 1800; state.player.y = MAP_CENTER.y; state.player.level = 1;
    const fish = createEntity(CreatureType.CLOWN_FISH, MAP_CENTER.x, MAP_CENTER.y, { moodId: 'CALM' });
    fish.angle = 0; fish.semiGhostTimer = 0; state.entities = [fish];
    let previous = fish.angle; let largestTurn = 0;
    for (let frame = 0; frame < 180; frame += 1) {
      state.time += 1; aiSystem(state, makeCtx());
      largestTurn = Math.max(largestTurn, Math.abs(fish.angle - previous)); previous = fish.angle;
    }
    // 旧游荡单次可突转 0.4rad；现在即使撞上长周期航向修正也控制在 0.08rad 内。
    expect(largestTurn).toBeLessThan(0.08);
    expect(Math.hypot(fish.x - MAP_CENTER.x, fish.y - MAP_CENTER.y)).toBeGreaterThan(80);
  });
});
