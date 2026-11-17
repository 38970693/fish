import { MAP_SHAPE_CONFIG } from './world';
import { DEFAULT_POND, POND_DATA, type PondId } from './ponds';
import { getMapBoundaryRadius } from '../systems/terrain';
import { createLayoutRandom, isNearLayoutRoute, type PondLayout } from './pondLayout';
import { createEndlessRandom, ENDLESS_WORLD_CONFIG, getEndlessBiome, parseEndlessChunkKey } from './endlessWorld';
import type { GameState } from '../types';

export interface PondScenery {
  x: number;
  y: number;
  radius: number;
  angle: number;
  id?: string;
  kind: 'LILY' | 'CORAL' | 'GLOW' | 'GARDEN' | 'ANEMONE' | 'SPONGE' | 'SAND' | 'BUBBLES' | 'BOTTLE';
}

const cache = new Map<string, readonly PondScenery[]>();
const THEMES: Record<PondId, readonly PondScenery['kind'][]> = {
  CLEAR: ['LILY', 'GARDEN', 'ANEMONE', 'SAND', 'BUBBLES', 'SPONGE', 'GARDEN', 'BOTTLE', 'LILY'],
  CORAL: ['CORAL', 'GARDEN', 'ANEMONE', 'SPONGE', 'SAND', 'BUBBLES', 'GARDEN', 'BOTTLE', 'CORAL'],
  ABYSS: ['GLOW', 'GARDEN', 'SAND', 'GLOW', 'ANEMONE', 'BUBBLES', 'GARDEN', 'BOTTLE', 'SPONGE'],
};

/** Stable, non-colliding marks: both renderers show the same pond without random flicker. */
export const getPondScenery = (pondId?: string | null, layout?: PondLayout): readonly PondScenery[] => {
  const id = pondId && pondId in POND_DATA ? pondId as PondId : DEFAULT_POND;
  const cacheKey = layout ? `${id}:${layout.version}:${layout.seed}` : id;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const kinds = THEMES[id];
  const scenery: PondScenery[] = [];
  const count = layout ? 40 : 180;
  const random = layout ? createLayoutRandom(layout.seed, id, 'scenery', layout.version) : null;
  for (let i = 0; i < count; i += 1) {
    const angle = random ? random() * Math.PI * 2 : i * 2.399963229728653 + 0.31;
    const fraction = random ? 0.18 + random() * 0.7 : 0.2 + 0.66 * Math.sqrt((i + 0.5) / count);
    const distance = Math.min(
      getMapBoundaryRadius(angle, id) - 320,
      getMapBoundaryRadius(angle, id) * fraction,
    );
    const x = MAP_SHAPE_CONFIG.CENTER_X + Math.cos(angle) * distance;
    const y = MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(angle) * distance;
    if (layout && (
      isNearLayoutRoute(layout, { x, y }, 80)
      || Math.hypot(x - layout.shop.x, y - layout.shop.y) < 360
      || layout.landmarks.some(landmark => Math.hypot(x - landmark.x, y - landmark.y) < landmark.radius + 180)
    )) continue;
    scenery.push({
      id: `${cacheKey}:scenery:${i}`,
      x,
      y,
      radius: random ? 64 + random() * 45 : 45 + (i * 37 % 64),
      angle,
      kind: kinds[i % kinds.length],
    });
  }
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, scenery);
  return scenery;
};

const chunkSceneryCache = new Map<string, readonly PondScenery[]>();
let lastEndlessKey = '';
let lastEndlessScenery: readonly PondScenery[] = [];

/** Global chunk identities are stable across streaming and floating-origin rebases. */
export const getOceanScenery = (state: Pick<GameState, 'worldMode' | 'pondId' | 'pondLayout' | 'endlessWorld' | 'arena'>): readonly PondScenery[] => {
  if (state.arena) return [];
  if (state.worldMode !== 'ENDLESS') return getPondScenery(state.pondId, state.pondLayout);
  const endless = state.endlessWorld;
  if (!endless) return [];
  const signature = `${endless.seed}:${endless.originChunkX}:${endless.originChunkY}:${endless.loadedChunks.join('|')}`;
  if (signature === lastEndlessKey) return lastEndlessScenery;
  const size = ENDLESS_WORLD_CONFIG.CHUNK_SIZE;
  const originX = BigInt(endless.originChunkX), originY = BigInt(endless.originChunkY);
  const scenery: PondScenery[] = [];
  for (const chunk of endless.loadedChunks) {
    const { x, y } = parseEndlessChunkKey(chunk);
    const minX = Number(x - originX) * size, minY = Number(y - originY) * size;
    const key = `${endless.seed}:${chunk}`;
    let marks = chunkSceneryCache.get(key);
    if (!marks) {
      const rng = createEndlessRandom(endless.seed, x, y, 'decorative-gardens');
      const biome = getEndlessBiome(endless.seed, minX + size / 2, minY + size / 2, originX, originY);
      const kinds = THEMES[biome === 'REEF' ? 'CORAL' : biome === 'ABYSS' ? 'ABYSS' : 'CLEAR'];
      marks = Array.from({ length: 25 }, (_, i) => ({
        id: `ocean:${key}:${i}`,
        x: (i % 5 + 0.28 + rng() * 0.44) * size / 5,
        y: (Math.floor(i / 5) + 0.28 + rng() * 0.44) * size / 5,
        radius: 55 + rng() * 52, angle: rng() * Math.PI * 2,
        kind: kinds[(i + Math.floor(rng() * 3)) % kinds.length],
      }));
      if (chunkSceneryCache.size >= 64) chunkSceneryCache.delete(chunkSceneryCache.keys().next().value!);
      chunkSceneryCache.set(key, marks);
    }
    for (const mark of marks) scenery.push({ ...mark, x: mark.x + minX, y: mark.y + minY });
  }
  lastEndlessKey = signature;
  lastEndlessScenery = scenery;
  return scenery;
};
