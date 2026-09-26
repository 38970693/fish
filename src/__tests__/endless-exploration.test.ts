import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { BUILDING_DATA, BuildingType } from '../data/buildings';
import { ENDLESS_WORLD_CONFIG, type EndlessExplorationLocation } from '../data/endlessWorld';
import { createInitialState } from '../factories/initialState';
import { endlessWorldSystem, generateEndlessExplorationLocation } from '../systems/endlessWorld';
import { endlessExplorationSystem } from '../systems/endlessExploration';
import type { FrameContext, GameEvents, GameState } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const findGenerated = (
  seed: number,
  kind?: EndlessExplorationLocation['kind'],
): EndlessExplorationLocation => {
  for (let y = -8n; y <= 8n; y += 1n) {
    for (let x = -8n; x <= 8n; x += 1n) {
      const location = generateEndlessExplorationLocation(seed, x, y, 0n, 0n);
      if (location && (!kind || location.kind === kind)) return location;
    }
  }
  throw new Error(`seed ${seed} 未生成需要的远洋地点`);
};

const stateWithLocation = (kind: EndlessExplorationLocation['kind']): GameState => {
  const state = createInitialState({ mode: 'RIVALS', worldMode: 'ENDLESS', worldSeed: 20260926, skipWorldGen: true });
  const radius = kind === 'SHIPWRECK' ? BUILDING_DATA.SHIPWRECK.radius : BUILDING_DATA.WARM_SHELTER.radius;
  const location: EndlessExplorationLocation = {
    id: `endless:0,0:location:v1:0,0:${kind.toLowerCase()}`,
    kind,
    x: 0,
    y: 0,
    radius,
    discoveryRadius: ENDLESS_WORLD_CONFIG.LOCATION_DISCOVERY_RANGE,
    regionX: '0',
    regionY: '0',
  };
  state.endlessWorld!.exploration.activeLocations = [location];
  state.buildings = [{
    id: location.id,
    x: location.x,
    y: location.y,
    type: kind === 'SHIPWRECK' ? BuildingType.SHIPWRECK : BuildingType.WARM_SHELTER,
    radius,
    cooldown: 0,
  }];
  return state;
};

describe('无尽海域探索循环', () => {
  it('EXP-01：同 seed + BigInt 区域逐字段稳定，负坐标与超大区域正常', () => {
    const seed = 20260926;
    const hugeX = 123456789012345678901234567890n;
    const hugeY = -98765432109876543210987654321n;
    const a = generateEndlessExplorationLocation(seed, hugeX, hugeY, hugeX * 3n, hugeY * 3n);
    const b = generateEndlessExplorationLocation(seed, hugeX, hugeY, hugeX * 3n, hugeY * 3n);
    expect(a).toEqual(b);
    if (a) {
      expect(a.id).toContain(hugeX.toString());
      expect(a.regionY).toBe(hugeY.toString());
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
    }
  });

  it('EXP-01：地点避开同 chunk 的障碍和普通建筑', () => {
    const location = findGenerated(20260926);
    const regionChunks = BigInt(ENDLESS_WORLD_CONFIG.LOCATION_REGION_CHUNKS);
    const regionX = BigInt(location.regionX);
    const regionY = BigInt(location.regionY);
    const originX = regionX * regionChunks;
    const originY = regionY * regionChunks;
    const local = generateEndlessExplorationLocation(20260926, regionX, regionY, originX, originY)!;
    const state = createInitialState({ worldMode: 'ENDLESS', worldSeed: 20260926, skipWorldGen: true });
    state.endlessWorld!.originChunkX = originX.toString();
    state.endlessWorld!.originChunkY = originY.toString();
    state.player.x = local.x;
    state.player.y = local.y;
    endlessWorldSystem(state, {} as FrameContext);
    const building = state.buildings.find(item => item.id === local.id);
    expect(building).toBeTruthy();
    for (const obstacle of state.obstacles) {
      expect(Math.hypot(obstacle.x - local.x, obstacle.y - local.y)).toBeGreaterThan(obstacle.radius + local.radius);
    }
    for (const other of state.buildings) {
      if (other.id === local.id) continue;
      expect(Math.hypot(other.x - local.x, other.y - local.y)).toBeGreaterThan(other.radius + local.radius);
    }
  });

  it('EXP-02：进入发现范围写入航海记录并自动选择目标', () => {
    const state = stateWithLocation('SHIPWRECK');
    const ctx = makeCtx();
    endlessExplorationSystem(state, ctx);
    const location = state.endlessWorld!.exploration.activeLocations[0];
    expect(state.endlessWorld!.exploration.discoveredIds).toContain(location.id);
    expect(state.endlessWorld!.exploration.targetId).toBe(location.id);
  });

  it('EXP-03：沉船必须按 E 搜索，完成后只结算一次', () => {
    const state = stateWithLocation('SHIPWRECK');
    const ctx = makeCtx();
    const record = state.endlessWorld!.exploration;
    endlessExplorationSystem(state, ctx);
    ctx.input.interact = true;
    endlessExplorationSystem(state, ctx);
    ctx.input.interact = false;
    expect(record.phase).toBe('SEARCHING');
    for (let i = 0; i < 3 * 60; i += 1) endlessExplorationSystem(state, ctx);
    expect(record.completedIds).toContain(record.activeLocations[0].id);
    expect(state.powerUps.filter(item => item.type === 'COIN')).toHaveLength(5);
    const score = state.score;
    for (let i = 0; i < 240; i += 1) endlessExplorationSystem(state, ctx);
    expect(state.score).toBe(score);
    expect(state.powerUps.filter(item => item.type === 'COIN')).toHaveLength(5);
  });

  it('EXP-03：暖流庇护所提供低压恢复，完成后同地点不重复恢复', () => {
    const state = stateWithLocation('WARM_SHELTER');
    const ctx = makeCtx();
    const record = state.endlessWorld!.exploration;
    state.player.health = state.player.maxHealth * 0.2;
    endlessExplorationSystem(state, ctx);
    ctx.input.interact = true;
    endlessExplorationSystem(state, ctx);
    ctx.input.interact = false;
    expect(record.phase).toBe('RESTING');
    for (let i = 0; i < 2 * 60; i += 1) endlessExplorationSystem(state, ctx);
    expect(record.completedIds).toContain(record.activeLocations[0].id);
    expect(state.player.health).toBeGreaterThan(state.player.maxHealth * 0.2);
    const health = state.player.health;
    for (let i = 0; i < 180; i += 1) endlessExplorationSystem(state, ctx);
    expect(state.player.health).toBe(health);
  });

  it('EXP-04：离开活动区再返回，已完成地点 ID 保留且重新生成同一地点', () => {
    const state = createInitialState({ worldMode: 'ENDLESS', worldSeed: 20260926, skipWorldGen: true });
    endlessWorldSystem(state, {} as FrameContext);
    const first = state.endlessWorld!.exploration.activeLocations[0];
    if (!first) {
      state.player.x = ENDLESS_WORLD_CONFIG.CHUNK_SIZE * 3;
      endlessWorldSystem(state, {} as FrameContext);
    }
    const location = state.endlessWorld!.exploration.activeLocations[0];
    expect(location).toBeTruthy();
    state.endlessWorld!.exploration.completedIds.push(location.id);
    const startX = state.player.x;
    const startY = state.player.y;
    state.player.x += ENDLESS_WORLD_CONFIG.CHUNK_SIZE * 12;
    endlessWorldSystem(state, {} as FrameContext);
    expect(state.endlessWorld!.exploration.completedIds).toContain(location.id);
    state.player.x = startX;
    state.player.y = startY;
    endlessWorldSystem(state, {} as FrameContext);
    expect(state.endlessWorld!.exploration.completedIds).toContain(location.id);
  });
});
