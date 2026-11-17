import { BiomeType } from './biomes';

export type WorldMode = 'FINITE' | 'ENDLESS';

export type EndlessLocationKind = 'SHIPWRECK' | 'WARM_SHELTER';

export interface EndlessExplorationLocation {
  id: string;
  kind: EndlessLocationKind;
  x: number;
  y: number;
  radius: number;
  discoveryRadius: number;
  regionX: string;
  regionY: string;
}

export interface EndlessExplorationState {
  discoveredIds: string[];
  completedIds: string[];
  targetId: string | null;
  activeLocations: EndlessExplorationLocation[];
  phase: 'IDLE' | 'SEARCHING' | 'RESTING';
  timer: number;
  duration: number;
  startHitCounter: number;
  interactHeld: boolean;
  lastResult: { text: string; timer: number } | null;
}

export interface EndlessWorldState {
  seed: number;
  loadedChunks: string[];
  /** 浮动原点对应的全局 chunk 偏移；局部 x/y 始终保持在较小数值，避免 WebGL 大坐标抖动。 */
  originChunkX: string;
  originChunkY: string;
  centerChunkX: string;
  centerChunkY: string;
  generatedChunkCount: number;
  /** 只保存偏离 seed 基线的静态状态，避免卸载区块后“打碎的岩石复活/建筑冷却清零”。 */
  objectDeltas: Record<string, {
    featureState?: 'IDLE' | 'WARNING' | 'ACTIVE' | 'BROKEN';
    featureTimer?: number;
    durability?: number;
    maxDurability?: number;
    cooldownUntil?: number;
  }>;
  /** 无尽海域航海记录：只持久化稀疏地点 ID；activeLocations 只覆盖当前活动区。 */
  exploration: EndlessExplorationState;
}

export const ENDLESS_WORLD_CONFIG = {
  CHUNK_SIZE: 1800,
  ACTIVE_RADIUS: 2,
  /** Three independent props plus one six-stone reef group per loaded chunk. */
  MAX_OBSTACLES_PER_CHUNK: 9,
  ENTITY_KEEP_DISTANCE: 5200,
  ITEM_KEEP_DISTANCE: 6200,
  RADAR_RANGE: 3600,
  BIOME_REGION_SIZE: 5400,
  REBASE_CHUNKS: 32,
  VERSION: 1,
  EXPLORATION_VERSION: 1,
  LOCATION_REGION_CHUNKS: 3,
  LOCATION_REGION_CHANCE: 0.78,
  LOCATION_DISCOVERY_RANGE: 1050,
  LOCATION_HINT_RANGE: 2500,
} as const;

const hash32 = (value: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
};

export const createEndlessRandom = (
  seed: number,
  chunkX: number | bigint | string,
  chunkY: number | bigint | string,
  subsystem: string,
): (() => number) => {
  let state = hash32(`${seed >>> 0}:${ENDLESS_WORLD_CONFIG.VERSION}:${chunkX}:${chunkY}:${subsystem}`) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const resolveWorldMode = (override?: string | null): WorldMode => {
  const normalize = (value?: string | null): WorldMode | null => {
    const key = (value ?? '').trim().toUpperCase();
    if (key === 'ENDLESS' || key === 'INFINITE') return 'ENDLESS';
    if (key === 'FINITE' || key === 'PONDS') return 'FINITE';
    return null;
  };
  const explicit = normalize(override);
  if (explicit) return explicit;
  try {
    return normalize(new URLSearchParams(window.location.search).get('world')) ?? 'FINITE';
  } catch {
    return 'FINITE';
  }
};

export const resolveWorldSeed = (override?: number | string | null): number => {
  const parse = (value: number | string | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  };
  const explicit = parse(override);
  if (explicit !== null) return explicit;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = parse(params.get('worldSeed') ?? params.get('pondSeed'));
    if (fromUrl !== null) return fromUrl;
  } catch { /* non-browser */ }
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  } catch {
    return hash32(`${Date.now()}:${typeof performance !== 'undefined' ? performance.now() : 0}`);
  }
};

export const endlessChunkCoord = (value: number): number =>
  Math.floor(value / ENDLESS_WORLD_CONFIG.CHUNK_SIZE);

export const endlessChunkKey = (
  x: number | bigint | string,
  y: number | bigint | string,
): string => `${x},${y}`;

export const parseEndlessChunkKey = (key: string): { x: bigint; y: bigint } => {
  const [rawX = '0', rawY = '0'] = key.split(',');
  try {
    return { x: BigInt(rawX), y: BigInt(rawY) };
  } catch {
    return { x: 0n, y: 0n };
  }
};

const toChunkBigInt = (value: number | bigint | string): bigint => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  try { return BigInt(value); } catch { return 0n; }
};

const floorDiv = (value: bigint, divisor: bigint): bigint => {
  let quotient = value / divisor;
  const remainder = value % divisor;
  if (remainder < 0n) quotient -= 1n;
  return quotient;
};

export const getEndlessBiome = (
  seed: number,
  x: number,
  y: number,
  originChunkX: number | bigint | string = 0,
  originChunkY: number | bigint | string = 0,
): BiomeType => {
  const localChunkX = BigInt(endlessChunkCoord(x));
  const localChunkY = BigInt(endlessChunkCoord(y));
  const globalChunkX = toChunkBigInt(originChunkX) + localChunkX;
  const globalChunkY = toChunkBigInt(originChunkY) + localChunkY;
  const chunksPerRegion = BigInt(ENDLESS_WORLD_CONFIG.BIOME_REGION_SIZE / ENDLESS_WORLD_CONFIG.CHUNK_SIZE);
  const regionX = floorDiv(globalChunkX, chunksPerRegion);
  const regionY = floorDiv(globalChunkY, chunksPerRegion);
  const roll = hash32(`${seed >>> 0}:biome:${regionX}:${regionY}`) % 4;
  return [BiomeType.SHALLOWS, BiomeType.REEF, BiomeType.SWAMP, BiomeType.ABYSS][roll];
};

/** 给 HUD/调试显示的精确全局坐标；内部 chunk 索引用 BigInt 字符串，不受 Number 精度上限影响。 */
export const formatEndlessGlobalCoordinate = (
  local: number,
  originChunk: number | bigint | string,
): string => {
  const global = toChunkBigInt(originChunk) * BigInt(ENDLESS_WORLD_CONFIG.CHUNK_SIZE)
    + BigInt(Math.round(local));
  return global.toString();
};

export const createEndlessWorldState = (seed: number): EndlessWorldState => ({
  seed: seed >>> 0,
  loadedChunks: [],
  originChunkX: '0',
  originChunkY: '0',
  centerChunkX: '0',
  centerChunkY: '0',
  generatedChunkCount: 0,
  objectDeltas: {},
  exploration: {
    discoveredIds: [],
    completedIds: [],
    targetId: null,
    activeLocations: [],
    phase: 'IDLE',
    timer: 0,
    duration: 0,
    startHitCounter: 0,
    interactHeld: false,
    lastResult: null,
  },
});
