import { describe, expect, it } from 'vitest';
import { createCurrentZones, type WaterCurrentZone } from '../data/habitats';
import { createInitialState } from '../factories/initialState';
import { SYSTEMS } from '../systems';
import { habitatsSystem, sampleCurrent } from '../systems/habitats';
import { createEntity } from '../systems/spawn';
import { createObstacles, createPortals } from '../systems/world';
import type { FrameContext } from '../types';

const ctx = {
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: { emit: () => undefined },
  dt: 1,
} as unknown as FrameContext;

const current = (overrides: Partial<WaterCurrentZone> = {}): WaterCurrentZone => ({
  id: 'test-current', name: '测试洋流', x: 1000, y: 1000,
  length: 800, width: 240, angle: 0, strength: 1.5, color: '#67e8f9',
  ...overrides,
});

describe('单向洋流', () => {
  it('每个鱼塘都有一条有界且可逆行的洋流', () => {
    for (const pond of ['CLEAR', 'CORAL', 'ABYSS'] as const) {
      const zones = createCurrentZones(pond);
      expect(zones).toHaveLength(1);
      expect(zones[0].length).toBeGreaterThan(zones[0].width);
      expect(zones[0].strength).toBeGreaterThan(0);
      expect(zones[0].strength).toBeLessThanOrEqual(1.6);
    }
  });

  it('中心为完整推力，边缘平滑减弱，区外没有推力', () => {
    const zone = current();
    expect(sampleCurrent(zone, { x: 1000, y: 1000 }).factor).toBe(1);
    expect(sampleCurrent(zone, { x: 1000, y: 1110 }).factor).toBeGreaterThan(0);
    expect(sampleCurrent(zone, { x: 1000, y: 1110 }).factor).toBeLessThan(1);
    expect(sampleCurrent(zone, { x: 1000, y: 1130 }).factor).toBe(0);
  });

  it('玩家、野生鱼、己方和敌方成员使用相同推力', () => {
    const state = createInitialState({ skipWorldGen: true });
    state.currents = [current()];
    state.player.x = state.player.y = 1000;
    state.player.vx = state.player.vy = 0;
    const actors = ['wild', 'player', 'rival'].map((ownerId, index) => {
      const entity = createEntity('CLOWN_FISH', 1000, 1000);
      entity.id = `actor-${index}`;
      entity.ownerId = ownerId === 'wild' ? undefined : ownerId;
      entity.vx = entity.vy = 0;
      return entity;
    });
    state.entities = actors;

    habitatsSystem(state, ctx);

    for (const actor of [state.player, ...actors]) {
      expect(actor.x).toBeCloseTo(1001.5);
      expect(actor.y).toBeCloseTo(1000);
      expect(actor.currentZoneId).toBe('test-current');
      expect(actor.currentStrength).toBe(1);
    }
  });

  it('离开洋流后会清除 HUD 状态', () => {
    const state = createInitialState({ skipWorldGen: true });
    state.currents = [current()];
    state.player.x = 1700;
    state.player.y = 1000;
    state.player.currentZoneId = 'old-current';
    state.player.currentStrength = 1;
    habitatsSystem(state, ctx);
    expect(state.player.x).toBe(1700);
    expect(state.player.currentZoneId).toBeUndefined();
    expect(state.player.currentStrength).toBe(0);
  });

  it('系统运行在双方移动之后、世界碰撞之前', () => {
    const names = SYSTEMS.map(system => system.name);
    expect(names.indexOf('habitats')).toBeGreaterThan(names.indexOf('rivalSquads'));
    expect(names.indexOf('habitats')).toBeLessThan(names.indexOf('world'));
  });

  it('世界生成不会用障碍物或传送门堵住水道', () => {
    for (const pond of ['CLEAR', 'CORAL', 'ABYSS'] as const) {
      const zone = createCurrentZones(pond)[0];
      const cos = Math.cos(zone.angle);
      const sin = Math.sin(zone.angle);
      const local = (point: { x: number; y: number }) => {
        const dx = point.x - zone.x;
        const dy = point.y - zone.y;
        return { along: dx * cos + dy * sin, across: -dx * sin + dy * cos };
      };
      for (const obstacle of createObstacles(pond)) {
        const p = local(obstacle);
        expect(
          Math.abs(p.along) >= zone.length / 2 + obstacle.radius + 35
          || Math.abs(p.across) >= zone.width / 2 + obstacle.radius + 35
        ).toBe(true);
      }
      for (const portal of createPortals(pond)) {
        expect(sampleCurrent(zone, portal).factor).toBe(0);
      }
    }
  });
});
