import { BUILDING_DATA, BuildingType } from '../data/buildings';
import {
  ENDLESS_WORLD_CONFIG,
  createEndlessRandom,
  endlessChunkCoord,
  endlessChunkKey,
  getEndlessBiome,
  parseEndlessChunkKey,
} from '../data/endlessWorld';
import { BiomeType } from '../data/biomes';
import type { Building, FrameContext, GameState, Obstacle } from '../types';
import type { WaterCurrentZone } from '../data/habitats';
import { configureObstacleEcology } from './obstacleEcology';

const isChunkOwnedId = (id: string): boolean => id.startsWith('endless:');
const chunkPrefix = (
  x: number | bigint | string,
  y: number | bigint | string,
): string => `endless:${x},${y}:`;

export interface EndlessChunkContent {
  obstacles: Obstacle[];
  buildings: Building[];
  currents: WaterCurrentZone[];
}

export const generateEndlessChunkContent = (
  seed: number,
  chunkX: bigint,
  chunkY: bigint,
  originChunkX: number | bigint | string = 0,
  originChunkY: number | bigint | string = 0,
): EndlessChunkContent => {
  const size = ENDLESS_WORLD_CONFIG.CHUNK_SIZE;
  const originX = typeof originChunkX === 'bigint' ? originChunkX : BigInt(originChunkX);
  const originY = typeof originChunkY === 'bigint' ? originChunkY : BigInt(originChunkY);
  const minX = Number(chunkX - originX) * size;
  const minY = Number(chunkY - originY) * size;
  const prefix = chunkPrefix(chunkX, chunkY);
  const centerX = minX + size / 2;
  const centerY = minY + size / 2;
  const biome = getEndlessBiome(seed, centerX, centerY, originChunkX, originChunkY);

  const obstacleRng = createEndlessRandom(seed, chunkX, chunkY, 'obstacles');
  const obstacleCount = 1 + Math.floor(obstacleRng() * 3);
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < obstacleCount; i += 1) {
    const x = minX + 240 + obstacleRng() * (size - 480);
    const y = minY + 240 + obstacleRng() * (size - 480);
    const radius = 50 + obstacleRng() * 120;
    const type: Obstacle['type'] = biome === BiomeType.REEF
      ? (obstacleRng() < 0.7 ? 'CORAL' : 'ROCK')
      : biome === BiomeType.SWAMP
        ? (obstacleRng() < 0.65 ? 'SEAWEED' : 'ROCK')
        : obstacleRng() < 0.22 ? 'SEAWEED' : 'ROCK';
    obstacles.push(configureObstacleEcology({
      id: `${prefix}obstacle:${i}`,
      x,
      y,
      radius,
      type,
    }));
  }

  const buildingRng = createEndlessRandom(seed, chunkX, chunkY, 'buildings');
  const buildings: Building[] = [];
  if (buildingRng() < 0.22) {
    const types: BuildingType[] = [BuildingType.HOSPITAL, BuildingType.SHRINE, BuildingType.SHOP];
    const type = types[Math.floor(buildingRng() * types.length)] ?? BuildingType.HOSPITAL;
    const config = BUILDING_DATA[type];
    buildings.push({
      id: `${prefix}building:${type.toLowerCase()}`,
      x: minX + 300 + buildingRng() * (size - 600),
      y: minY + 300 + buildingRng() * (size - 600),
      type,
      radius: config.radius,
      cooldown: 0,
    });
  }

  const currentRng = createEndlessRandom(seed, chunkX, chunkY, 'currents');
  const currents: WaterCurrentZone[] = [];
  if (currentRng() < 0.18) {
    const colors: Record<BiomeType, string> = {
      SHALLOWS: '#67e8f9', REEF: '#5eead4', SWAMP: '#84cc16', ABYSS: '#818cf8',
    };
    currents.push({
      id: `${prefix}current:0`,
      name: '远洋流带',
      x: minX + size * (0.3 + currentRng() * 0.4),
      y: minY + size * (0.3 + currentRng() * 0.4),
      length: 620 + currentRng() * 520,
      width: 180 + currentRng() * 120,
      angle: currentRng() * Math.PI * 2,
      strength: 0.8 + currentRng() * 0.8,
      color: colors[biome],
    });
  }

  return { obstacles, buildings, currents };
};

const desiredChunkKeys = (centerX: bigint, centerY: bigint): string[] => {
  const keys: string[] = [];
  for (let dy = -ENDLESS_WORLD_CONFIG.ACTIVE_RADIUS; dy <= ENDLESS_WORLD_CONFIG.ACTIVE_RADIUS; dy += 1) {
    for (let dx = -ENDLESS_WORLD_CONFIG.ACTIVE_RADIUS; dx <= ENDLESS_WORLD_CONFIG.ACTIVE_RADIUS; dx += 1) {
      keys.push(endlessChunkKey(centerX + BigInt(dx), centerY + BigInt(dy)));
    }
  }
  return keys;
};

const belongsToLoadedChunk = (id: string, desired: Set<string>): boolean => {
  if (!isChunkOwnedId(id)) return true;
  const match = /^endless:([^:]+):/.exec(id);
  return !!match && desired.has(match[1]);
};

const captureOutgoingStaticDeltas = (state: GameState, desired: Set<string>): void => {
  const endless = state.endlessWorld!;
  for (const obstacle of state.obstacles) {
    if (!isChunkOwnedId(obstacle.id) || belongsToLoadedChunk(obstacle.id, desired)) continue;
    const changedDurability = obstacle.maxDurability !== undefined
      && obstacle.durability !== undefined
      && obstacle.durability < obstacle.maxDurability;
    const persistentState = obstacle.featureState === 'BROKEN' || changedDurability;
    if (!persistentState) continue;
    endless.objectDeltas[obstacle.id] = {
      featureState: obstacle.featureState,
      featureTimer: obstacle.featureTimer,
      durability: obstacle.durability,
      maxDurability: obstacle.maxDurability,
    };
  }
  for (const building of state.buildings) {
    if (!isChunkOwnedId(building.id) || belongsToLoadedChunk(building.id, desired)) continue;
    if (building.cooldown <= 0) continue;
    endless.objectDeltas[building.id] = {
      ...(endless.objectDeltas[building.id] ?? {}),
      cooldownUntil: state.time + building.cooldown,
    };
  }
};

const applyStaticDeltas = (state: GameState, content: EndlessChunkContent): void => {
  const deltas = state.endlessWorld!.objectDeltas;
  for (const obstacle of content.obstacles) {
    const delta = deltas[obstacle.id];
    if (!delta) continue;
    if (delta.featureState !== undefined) obstacle.featureState = delta.featureState;
    if (delta.featureTimer !== undefined) obstacle.featureTimer = delta.featureTimer;
    if (delta.durability !== undefined) obstacle.durability = delta.durability;
    if (delta.maxDurability !== undefined) obstacle.maxDurability = delta.maxDurability;
  }
  for (const building of content.buildings) {
    const delta = deltas[building.id];
    if (!delta?.cooldownUntil) continue;
    building.cooldown = Math.max(0, delta.cooldownUntil - state.time);
    if (building.cooldown <= 0) {
      const { cooldownUntil: _expired, ...rest } = delta;
      if (Object.keys(rest).length === 0) delete deltas[building.id];
      else deltas[building.id] = rest;
    }
  }
};

const pruneFarDynamicContent = (state: GameState): void => {
  const { player } = state;
  const entityKeep2 = ENDLESS_WORLD_CONFIG.ENTITY_KEEP_DISTANCE ** 2;
  const itemKeep2 = ENDLESS_WORLD_CONFIG.ITEM_KEEP_DISTANCE ** 2;
  const nearby = (x: number, y: number, max2: number): boolean => {
    const dx = x - player.x;
    const dy = y - player.y;
    return dx * dx + dy * dy <= max2;
  };
  state.entities = state.entities.filter(entity => entity.ownerId || nearby(entity.x, entity.y, entityKeep2));
  state.powerUps = state.powerUps.filter(item => nearby(item.x, item.y, itemKeep2));
  state.treasures = state.treasures.filter(item => nearby(item.x, item.y, itemKeep2));
  state.hazards = state.hazards.filter(item => nearby(item.x, item.y, itemKeep2));
  state.fountains = state.fountains.filter(item => nearby(item.x, item.y, itemKeep2));
};

const shiftPoint = (point: { x: number; y: number }, dx: number, dy: number): void => {
  point.x -= dx;
  point.y -= dy;
};

/**
 * 浮动原点：逻辑世界可以无限走，但渲染器永远只看到接近原点的小坐标。
 * 每次只按整 chunk 平移，所以全局 chunk id / seed 不变，离开再回来仍是同一块世界。
 */
export const maybeRebaseEndlessWorld = (state: GameState): { dx: number; dy: number } | null => {
  if (state.worldMode !== 'ENDLESS' || !state.endlessWorld) return null;
  const endless = state.endlessWorld;
  const chunk = ENDLESS_WORLD_CONFIG.CHUNK_SIZE;
  const threshold = chunk * ENDLESS_WORLD_CONFIG.REBASE_CHUNKS;
  if (Math.abs(state.player.x) < threshold && Math.abs(state.player.y) < threshold) return null;

  const shiftChunksX = Math.trunc(state.player.x / chunk);
  const shiftChunksY = Math.trunc(state.player.y / chunk);
  const dx = shiftChunksX * chunk;
  const dy = shiftChunksY * chunk;
  if (dx === 0 && dy === 0) return null;

  endless.originChunkX = (BigInt(endless.originChunkX) + BigInt(shiftChunksX)).toString();
  endless.originChunkY = (BigInt(endless.originChunkY) + BigInt(shiftChunksY)).toString();

  shiftPoint(state.player, dx, dy);
  shiftPoint(state.camera, dx, dy);
  for (const list of [
    state.entities, state.particles, state.obstacles, state.powerUps, state.hazards,
    state.portals, state.buildings, state.treasures, state.fountains, state.labels,
  ]) {
    for (const item of list) shiftPoint(item, dx, dy);
  }
  for (const current of state.currents ?? []) shiftPoint(current, dx, dy);
  for (const recruit of state.squad.pending) shiftPoint(recruit, dx, dy);
  for (const action of state.squad.pendingActions ?? []) {
    if (action.kind === 'COMMAND' && action.worldMouse) shiftPoint(action.worldMouse, dx, dy);
  }
  if (state.feedingEvent) {
    if (state.feedingEvent.x !== null) state.feedingEvent.x -= dx;
    if (state.feedingEvent.y !== null) state.feedingEvent.y -= dy;
    if (state.feedingEvent.lastX !== null) state.feedingEvent.lastX -= dx;
    if (state.feedingEvent.lastY !== null) state.feedingEvent.lastY -= dy;
    for (const drop of state.feedingEvent.drops) shiftPoint(drop, dx, dy);
  }
  for (const squad of state.rivalSquads ?? []) {
    if (squad.homeX !== null) squad.homeX -= dx;
    if (squad.homeY !== null) squad.homeY -= dy;
  }
  return { dx, dy };
};

export const endlessWorldSystem = (state: GameState, _ctx: FrameContext): void => {
  if (state.worldMode !== 'ENDLESS' || !state.endlessWorld) return;
  const endless = state.endlessWorld;
  maybeRebaseEndlessWorld(state);
  const chunkX = BigInt(endless.originChunkX) + BigInt(endlessChunkCoord(state.player.x));
  const chunkY = BigInt(endless.originChunkY) + BigInt(endlessChunkCoord(state.player.y));
  const desiredKeys = desiredChunkKeys(chunkX, chunkY);
  const desired = new Set(desiredKeys);
  const current = new Set(endless.loadedChunks);

  if (chunkX.toString() !== endless.centerChunkX || chunkY.toString() !== endless.centerChunkY || desiredKeys.some(key => !current.has(key))) {
    captureOutgoingStaticDeltas(state, desired);
    state.obstacles = state.obstacles.filter(obstacle => belongsToLoadedChunk(obstacle.id, desired));
    state.buildings = state.buildings.filter(building => belongsToLoadedChunk(building.id, desired));
    state.currents = (state.currents ?? []).filter(currentZone => belongsToLoadedChunk(currentZone.id, desired));

    for (const key of desiredKeys) {
      if (current.has(key)) continue;
      const { x, y } = parseEndlessChunkKey(key);
      const content = generateEndlessChunkContent(
        endless.seed, x, y, endless.originChunkX, endless.originChunkY,
      );
      applyStaticDeltas(state, content);
      state.obstacles.push(...content.obstacles);
      state.buildings.push(...content.buildings);
      state.currents!.push(...content.currents);
      endless.generatedChunkCount += 1;
    }
    endless.loadedChunks = desiredKeys;
    endless.centerChunkX = chunkX.toString();
    endless.centerChunkY = chunkY.toString();
  }

  // 长距离游动不能让离屏生态无限占着 MAX_ENTITIES / 道具预算。
  if (state.time % 60 === 0) pruneFarDynamicContent(state);
};
