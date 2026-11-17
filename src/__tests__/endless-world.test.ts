import { describe, expect, it } from 'vitest';
import {
  ENDLESS_WORLD_CONFIG,
  formatEndlessGlobalCoordinate,
  getEndlessBiome,
} from '../data/endlessWorld';
import { createInitialState } from '../factories/initialState';
import {
  endlessWorldSystem,
  generateEndlessChunkContent,
  maybeRebaseEndlessWorld,
} from '../systems/endlessWorld';
import { clampToMap, getBiome, isPositionValid } from '../systems/terrain';
import { createEntity } from '../systems/spawn';
import { CreatureType } from '../data/creatures';
import type { FrameContext } from '../types';

const EMPTY_CONTEXT = {} as FrameContext;

describe('无限海域', () => {
  it('显式开启 ENDLESS 后从局部原点开始，并按玩家周边装载区块', () => {
    const state = createInitialState({
      mode: 'LEGACY',
      worldMode: 'ENDLESS',
      worldSeed: 20260925,
      skipWorldGen: true,
    });

    expect(state.worldMode).toBe('ENDLESS');
    expect(state.endlessWorld?.seed).toBe(20260925);
    expect({ x: state.player.x, y: state.player.y }).toEqual({ x: 0, y: 0 });

    endlessWorldSystem(state, EMPTY_CONTEXT);

    const side = ENDLESS_WORLD_CONFIG.ACTIVE_RADIUS * 2 + 1;
    expect(state.endlessWorld?.loadedChunks).toHaveLength(side * side);
    expect(state.endlessWorld?.loadedChunks).toContain('0,0');
    expect(state.obstacles.every(item => item.id.startsWith('endless:'))).toBe(true);
    expect(state.buildings.every(item => item.id.startsWith('endless:'))).toBe(true);
    expect((state.currents ?? []).every(item => item.id.startsWith('endless:'))).toBe(true);
  });

  it('ENDLESS 不会把玩家推回有限鱼塘边界', () => {
    const mover = { x: 120_000, y: -90_000, radius: 20, angle: 0, vx: 2, vy: 0 };
    clampToMap(mover, false, 'CLEAR', 'ENDLESS');
    expect(mover.x).toBe(120_000);
    expect(mover.y).toBe(-90_000);
  });

  it('浮动原点重定位后保持同一全局位置，同时把相机和动态对象一起平移', () => {
    const state = createInitialState({
      mode: 'LEGACY',
      worldMode: 'ENDLESS',
      worldSeed: 7,
      skipWorldGen: true,
    });
    const chunk = ENDLESS_WORLD_CONFIG.CHUNK_SIZE;
    const travel = chunk * ENDLESS_WORLD_CONFIG.REBASE_CHUNKS + 125;
    state.player.x = travel;
    state.player.y = -travel;
    state.camera.x = travel + 40;
    state.camera.y = -travel + 60;
    state.labels.push({ x: travel + 10, y: -travel - 20, text: 'probe', color: '#fff', timer: 1, size: 10 });

    const globalBefore = {
      x: formatEndlessGlobalCoordinate(state.player.x, state.endlessWorld?.originChunkX ?? '0'),
      y: formatEndlessGlobalCoordinate(state.player.y, state.endlessWorld?.originChunkY ?? '0'),
    };
    const shift = maybeRebaseEndlessWorld(state);
    const globalAfter = {
      x: formatEndlessGlobalCoordinate(state.player.x, state.endlessWorld?.originChunkX ?? '0'),
      y: formatEndlessGlobalCoordinate(state.player.y, state.endlessWorld?.originChunkY ?? '0'),
    };

    expect(shift).not.toBeNull();
    expect(globalAfter).toEqual(globalBefore);
    expect(Math.abs(state.player.x)).toBeLessThan(chunk);
    expect(Math.abs(state.player.y)).toBeLessThan(chunk);
    expect(state.camera.x - state.player.x).toBe(40);
    expect(state.camera.y - state.player.y).toBe(60);
    expect(state.labels[0].x - state.player.x).toBe(10);
    expect(state.labels[0].y - state.player.y).toBe(-20);
  });

  it('没有有限地图坐标上限，负坐标和超大坐标都合法', () => {
    expect(isPositionValid(-2_000_000, 3_000_000, 500, 'CLEAR', 'ENDLESS')).toBe(true);
    expect(isPositionValid(Number.MAX_SAFE_INTEGER / 4, -Number.MAX_SAFE_INTEGER / 4, 0, 'CLEAR', 'ENDLESS')).toBe(true);
  });

  it('同 seed + 全局 chunk 坐标逐字段确定，并支持远超 Number 安全整数的 chunk key', () => {
    const hugeX = 123456789012345678901234567890n;
    const hugeY = -98765432109876543210987654321n;
    const a = generateEndlessChunkContent(20260925, hugeX, hugeY, hugeX, hugeY);
    const b = generateEndlessChunkContent(20260925, hugeX, hugeY, hugeX, hugeY);
    expect(a).toEqual(b);
    expect(a.obstacles.every(item => item.id.includes(hugeX.toString()))).toBe(true);
  });

  it('宏观生态区按全局 chunk 决定，浮动原点前后不会换生态', () => {
    const seed = 9911;
    const originX = '12345678901234567890';
    const originY = '-23456789012345678901';
    const localX = 321;
    const localY = -777;
    expect(getBiome(localX, localY, 'ENDLESS', seed, originX, originY))
      .toBe(getEndlessBiome(seed, localX, localY, originX, originY));
  });

  it('走远后只保留当前 25 个区块，并回收远处野生鱼/道具但保留队友', () => {
    const state = createInitialState({ mode: 'RIVALS', worldMode: 'ENDLESS', worldSeed: 8080, skipWorldGen: true });
    endlessWorldSystem(state, EMPTY_CONTEXT);
    const wild = createEntity(CreatureType.CLOWN_FISH, 20_000, 20_000);
    const owned = createEntity(CreatureType.CLOWN_FISH, 20_000, 20_000);
    owned.ownerId = 'player';
    state.entities.push(wild, owned);
    state.powerUps.push({ id: 'far', x: 20_000, y: 20_000, type: 'COIN', radius: 14 });
    state.player.x = ENDLESS_WORLD_CONFIG.CHUNK_SIZE * 8;
    state.time = 60;
    endlessWorldSystem(state, EMPTY_CONTEXT);
    expect(state.endlessWorld?.loadedChunks).toHaveLength(25);
    expect(state.endlessWorld?.loadedChunks).not.toContain('0,0');
    expect(state.entities).not.toContain(wild);
    expect(state.entities).toContain(owned);
    expect(state.powerUps.some(item => item.id === 'far')).toBe(false);
  });

  it('卸载再返回时，打碎的静态障碍和建筑冷却不会被 seed 重置', () => {
    const state = createInitialState({ mode: 'RIVALS', worldMode: 'ENDLESS', worldSeed: 5150, skipWorldGen: true });
    endlessWorldSystem(state, EMPTY_CONTEXT);
    const obstacle = state.obstacles.find(item => item.id.startsWith('endless:0,0:'))!;
    expect(obstacle).toBeTruthy();
    obstacle.featureState = 'BROKEN';
    obstacle.durability = 0;
    obstacle.maxDurability ??= 10;
    const building = state.buildings[0];
    if (building) building.cooldown = 300;

    state.player.x = ENDLESS_WORLD_CONFIG.CHUNK_SIZE * 8;
    state.time = 100;
    endlessWorldSystem(state, EMPTY_CONTEXT);
    expect(state.endlessWorld!.objectDeltas[obstacle.id]?.featureState).toBe('BROKEN');

    state.player.x = 0;
    state.time = 160;
    endlessWorldSystem(state, EMPTY_CONTEXT);
    const restored = state.obstacles.find(item => item.id === obstacle.id)!;
    expect(restored.featureState).toBe('BROKEN');
    expect(restored.durability).toBe(0);
    if (building) {
      const match = /^endless:([^,]+),([^:]+):/.exec(building.id)!;
      state.player.x = Number(BigInt(match[1])) * ENDLESS_WORLD_CONFIG.CHUNK_SIZE;
      state.player.y = Number(BigInt(match[2])) * ENDLESS_WORLD_CONFIG.CHUNK_SIZE;
      endlessWorldSystem(state, EMPTY_CONTEXT);
      const restoredBuilding = state.buildings.find(item => item.id === building.id)!;
      expect(restoredBuilding.cooldown).toBe(240);
    }
  });

  it('连续跨越数百个 chunk 时活动世界预算保持有界，不随探索距离增长', () => {
    const state = createInitialState({ mode: 'RIVALS', worldMode: 'ENDLESS', worldSeed: 314159, skipWorldGen: true });
    const chunk = ENDLESS_WORLD_CONFIG.CHUNK_SIZE;
    let maxObstacles = 0;
    let maxBuildings = 0;
    let maxCurrents = 0;
    for (let i = 0; i < 220; i += 1) {
      state.player.x += chunk * 3;
      state.player.y += (i % 2 === 0 ? 1 : -1) * chunk;
      endlessWorldSystem(state, EMPTY_CONTEXT);
      maxObstacles = Math.max(maxObstacles, state.obstacles.length);
      maxBuildings = Math.max(maxBuildings, state.buildings.length);
      maxCurrents = Math.max(maxCurrents, state.currents?.length ?? 0);
      expect(state.endlessWorld?.loadedChunks).toHaveLength(25);
    }
    expect(maxObstacles).toBeLessThanOrEqual(25 * ENDLESS_WORLD_CONFIG.MAX_OBSTACLES_PER_CHUNK);
    expect(maxBuildings).toBeLessThanOrEqual(25);
    expect(maxCurrents).toBeLessThanOrEqual(25);
    expect(BigInt(state.endlessWorld!.originChunkX)).not.toBe(0n);
    expect(state.endlessWorld!.generatedChunkCount).toBeGreaterThan(500);
  });
});
