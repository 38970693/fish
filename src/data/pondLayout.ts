import type { Obstacle } from '../types';
import { MAP_SHAPE_CONFIG, WORLD_SIZE } from './world';
import { DEFAULT_POND, POND_DATA, type PondId } from './ponds';
import { isPositionValid } from '../systems/terrain';

export type PondLayoutMode = 'CLASSIC' | 'PROCEDURAL';
export type PondLandmarkKind = 'LILY' | 'NURSERY' | 'PEARL_BED' | 'WRECK' | 'VENT';

export interface PondLayoutPoint { x: number; y: number }
export interface PondLandmark extends PondLayoutPoint {
  id: string;
  kind: PondLandmarkKind;
  radius: number;
}
export interface PondRoute {
  id: string;
  points: PondLayoutPoint[];
  width: number;
}
export interface PondLayout {
  seed: number;
  version: number;
  spawn: PondLayoutPoint;
  shop: PondLayoutPoint;
  landmarks: PondLandmark[];
  routes: PondRoute[];
  fallbackReason?: string;
}

export const POND_LAYOUT_VERSION = 1;
export const POND_LAYOUT_MAX_CANDIDATES = 32;
export const POND_LAYOUT_STORAGE_KEY = 'fish.pondLayoutMode';
const SHOP_MIN_DISTANCE = 1300;
const SHOP_MAX_DISTANCE = 1900;
const EDGE_BUFFER = 420;
const ROUTE_WIDTH = 440;
const GRID_SIZE = 80;
const OBSTACLE_CLEARANCE = 200;

const normalizePond = (pondId?: string | null): PondId =>
  ((pondId && pondId in POND_DATA) ? pondId : DEFAULT_POND) as PondId;

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

/** Independent deterministic stream: changing one subsystem never advances another. */
export const createLayoutRandom = (
  seed: number,
  pondId: string,
  subsystem: string,
  version = POND_LAYOUT_VERSION,
): (() => number) => {
  let state = hash32(`${seed >>> 0}:${pondId}:${version}:${subsystem}`) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const normalizePondLayoutMode = (value?: string | null): PondLayoutMode | null => {
  const key = (value ?? '').trim().toUpperCase();
  if (key === 'PROCEDURAL') return 'PROCEDURAL';
  if (key === 'CLASSIC') return 'CLASSIC';
  return null;
};

export const resolvePondLayoutMode = (
  runMode: string,
  override?: string | null,
): PondLayoutMode => {
  if (runMode !== 'RIVALS') return 'CLASSIC';
  const explicit = normalizePondLayoutMode(override);
  if (explicit) return explicit;
  try {
    const fromUrl = normalizePondLayoutMode(new URLSearchParams(window.location.search).get('pondLayout'));
    if (fromUrl) {
      localStorage.setItem(POND_LAYOUT_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
  } catch { /* non-browser */ }
  return 'CLASSIC';
};

export const resolvePondSeed = (override?: number | string | null): number => {
  const parse = (value: number | string | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  };
  const explicit = parse(override);
  if (explicit !== null) return explicit;
  try {
    const fromUrl = parse(new URLSearchParams(window.location.search).get('pondSeed'));
    if (fromUrl !== null) return fromUrl;
  } catch { /* non-browser */ }
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  } catch {
    const clock = typeof performance !== 'undefined' ? Math.floor(performance.now() * 1000) : 0;
    return hash32(`${Date.now()}:${clock}`);
  }
};

const polarPoint = (angle: number, distance: number): PondLayoutPoint => ({
  x: MAP_SHAPE_CONFIG.CENTER_X + Math.cos(angle) * distance,
  y: MAP_SHAPE_CONFIG.CENTER_Y + Math.sin(angle) * distance,
});

const pointSegmentDistance = (p: PondLayoutPoint, a: PondLayoutPoint, b: PondLayoutPoint): number => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
};

export const isNearLayoutRoute = (layout: PondLayout, p: PondLayoutPoint, clearance = 0): boolean =>
  layout.routes.some(route => route.points.slice(1).some((b, i) =>
    pointSegmentDistance(p, route.points[i], b) < route.width / 2 + clearance));

const landmarkKinds: Record<PondId, PondLandmarkKind[]> = {
  CLEAR: ['LILY', 'LILY', 'LILY'],
  CORAL: ['NURSERY', 'PEARL_BED', 'PEARL_BED'],
  ABYSS: ['WRECK', 'VENT', 'VENT'],
};

const makeSafeTemplate = (seed: number, pondId: PondId, reason?: string): PondLayout => {
  const spawn = pondId === 'CORAL'
    ? polarPoint(-2.55, 520)
    : pondId === 'ABYSS' ? polarPoint(2.35, 460) : polarPoint(2.8, 380);
  const shop = pondId === 'CORAL'
    ? polarPoint(-0.4, 1600)
    : pondId === 'ABYSS' ? polarPoint(-0.8, 1550) : polarPoint(-0.55, 1500);
  const angles = pondId === 'CORAL' ? [1.55, 2.65, -1.7] : pondId === 'ABYSS' ? [0.25, -2.4, 1.45] : [1.2, -2.0, -0.2];
  const landmarks = landmarkKinds[pondId].map((kind, i) => ({
    id: `${pondId.toLowerCase()}-${kind.toLowerCase()}-${i + 1}`,
    kind,
    ...polarPoint(angles[i], 1250 + i * 250),
    radius: i === 0 ? 220 : 150,
  }));
  const routes: PondRoute[] = [
    { id: 'spawn-shop', points: [spawn, polarPoint((Math.atan2(shop.y - spawn.y, shop.x - spawn.x) + 0.35), 780), shop], width: ROUTE_WIDTH },
    ...landmarks.map((landmark, i) => ({ id: `route-${i + 1}`, points: [spawn, landmark], width: ROUTE_WIDTH })),
  ];
  if (pondId === 'CORAL') {
    routes.push({ id: 'coral-bypass', points: [spawn, polarPoint(Math.PI * 0.95, 1550), shop], width: ROUTE_WIDTH });
  }
  if (pondId === 'ABYSS') {
    const wreck = landmarks.find(landmark => landmark.kind === 'WRECK')!;
    const routeAngle = Math.atan2(wreck.y - MAP_SHAPE_CONFIG.CENTER_Y, wreck.x - MAP_SHAPE_CONFIG.CENTER_X) + Math.PI / 2;
    routes.push({
      id: 'abyss-starlight',
      points: [
        { x: wreck.x - Math.cos(routeAngle) * 520, y: wreck.y - Math.sin(routeAngle) * 520 },
        { x: wreck.x, y: wreck.y },
        { x: wreck.x + Math.cos(routeAngle) * 520, y: wreck.y + Math.sin(routeAngle) * 520 },
      ],
      width: ROUTE_WIDTH,
    });
  }
  return { seed: seed >>> 0, version: POND_LAYOUT_VERSION, spawn, shop, landmarks, routes, fallbackReason: reason };
};

export const getSafePondLayout = (seed: number, pondId?: string | null, reason?: string): PondLayout =>
  makeSafeTemplate(seed, normalizePond(pondId), reason);

const locallyValid = (layout: PondLayout, pondId: PondId): boolean => {
  const points = [layout.spawn, layout.shop, ...layout.landmarks];
  if (!points.every((p, i) => isPositionValid(p.x, p.y, i < 2 ? EDGE_BUFFER : 300, pondId))) return false;
  const shopDist = Math.hypot(layout.shop.x - layout.spawn.x, layout.shop.y - layout.spawn.y);
  if (shopDist < SHOP_MIN_DISTANCE || shopDist > SHOP_MAX_DISTANCE) return false;
  if (layout.landmarks.some(l => Math.hypot(l.x - layout.spawn.x, l.y - layout.spawn.y) < 700)) return false;
  return layout.routes.every(route => route.points.every(p => isPositionValid(p.x, p.y, 220, pondId)));
};

const generatePondLayoutInternal = (
  seed: number,
  pondId?: string | null,
  validateCandidate: (layout: PondLayout, pondId: PondId) => boolean = locallyValid,
): PondLayout => {
  const pond = normalizePond(pondId);
  const rng = createLayoutRandom(seed, pond, 'landmarks');
  for (let attempt = 0; attempt < POND_LAYOUT_MAX_CANDIDATES; attempt += 1) {
    const spawnAngle = rng() * Math.PI * 2;
    const spawn = polarPoint(spawnAngle, 260 + rng() * 520);
    const shopAngle = spawnAngle + (0.7 + rng() * 1.4) * (rng() < 0.5 ? -1 : 1);
    const shop = {
      x: spawn.x + Math.cos(shopAngle) * (SHOP_MIN_DISTANCE + rng() * (SHOP_MAX_DISTANCE - SHOP_MIN_DISTANCE)),
      y: spawn.y + Math.sin(shopAngle) * (SHOP_MIN_DISTANCE + rng() * (SHOP_MAX_DISTANCE - SHOP_MIN_DISTANCE)),
    };
    const landmarks = landmarkKinds[pond].map((kind, i) => {
      const a = spawnAngle + (i + 1) * (Math.PI * 2 / 3) + (rng() - 0.5) * 0.8;
      const p = polarPoint(a, 1150 + rng() * 900);
      return { id: `${pond.toLowerCase()}-${kind.toLowerCase()}-${i + 1}`, kind, ...p, radius: i === 0 ? 220 : 150 };
    });
    const routes: PondRoute[] = [
      { id: 'spawn-shop', points: [spawn, shop], width: ROUTE_WIDTH },
      ...landmarks.map((landmark, i) => ({ id: `route-${i + 1}`, points: [spawn, landmark], width: ROUTE_WIDTH })),
    ];
    if (pond === 'CORAL') {
      const bypass = polarPoint(spawnAngle + Math.PI * 0.8, 1500 + rng() * 280);
      routes.push({ id: 'coral-bypass', points: [spawn, bypass, shop], width: ROUTE_WIDTH });
    }
    if (pond === 'ABYSS') {
      const wreck = landmarks.find(landmark => landmark.kind === 'WRECK')!;
      const routeRng = createLayoutRandom(seed, pond, `route-starlight-${attempt}`);
      const routeAngle = Math.atan2(wreck.y - MAP_SHAPE_CONFIG.CENTER_Y, wreck.x - MAP_SHAPE_CONFIG.CENTER_X)
        + Math.PI / 2 + (routeRng() - 0.5) * 0.45;
      const offset = 420 + routeRng() * 180;
      routes.push({
        id: 'abyss-starlight',
        points: [
          { x: wreck.x - Math.cos(routeAngle) * offset, y: wreck.y - Math.sin(routeAngle) * offset },
          { x: wreck.x, y: wreck.y },
          { x: wreck.x + Math.cos(routeAngle) * offset, y: wreck.y + Math.sin(routeAngle) * offset },
        ],
        width: ROUTE_WIDTH,
      });
    }
    const layout: PondLayout = { seed: seed >>> 0, version: POND_LAYOUT_VERSION, spawn, shop, landmarks, routes };
    if (validateCandidate(layout, pond)) return layout;
  }
  return makeSafeTemplate(seed, pond, `${POND_LAYOUT_MAX_CANDIDATES} candidates failed local safety constraints`);
};

export const generatePondLayout = (seed: number, pondId?: string | null): PondLayout =>
  generatePondLayoutInternal(seed, pondId);

/** 测试钩子：只用于覆盖“候选全部失败 → 安全模板”分支，运行时不调用。 */
export const __generatePondLayoutWithValidatorForTest = (
  seed: number,
  pondId: string | null | undefined,
  validateCandidate: (layout: PondLayout, pondId: PondId) => boolean,
): PondLayout => generatePondLayoutInternal(seed, pondId, validateCandidate);

/** 80-unit grid reachability check with obstacles inflated by 200 units. */
export const validatePondLayoutReachability = (
  layout: PondLayout,
  obstacles: readonly Obstacle[],
  pondId?: string | null,
): { ok: boolean; reason?: string } => {
  const pond = normalizePond(pondId);
  const cells = Math.ceil(WORLD_SIZE / GRID_SIZE);
  const blocked = (gx: number, gy: number): boolean => {
    const x = gx * GRID_SIZE + GRID_SIZE / 2;
    const y = gy * GRID_SIZE + GRID_SIZE / 2;
    if (!isPositionValid(x, y, 80, pond)) return true;
    return obstacles.some(o => Math.hypot(x - o.x, y - o.y) < o.radius + OBSTACLE_CLEARANCE);
  };
  const toCell = (p: PondLayoutPoint): [number, number] => [
    Math.max(0, Math.min(cells - 1, Math.floor(p.x / GRID_SIZE))),
    Math.max(0, Math.min(cells - 1, Math.floor(p.y / GRID_SIZE))),
  ];
  const [sx, sy] = toCell(layout.spawn);
  const seen = new Uint8Array(cells * cells);
  const queue: Array<[number, number]> = [[sx, sy]];
  seen[sy * cells + sx] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
      if (nx < 0 || ny < 0 || nx >= cells || ny >= cells) continue;
      const idx = ny * cells + nx;
      if (seen[idx] || blocked(nx, ny)) continue;
      seen[idx] = 1;
      queue.push([nx, ny]);
    }
  }
  for (const [name, point] of [['shop', layout.shop], ...layout.landmarks.map(l => [l.id, l] as [string, PondLayoutPoint])] as Array<[string, PondLayoutPoint]>) {
    const [gx, gy] = toCell(point);
    if (!seen[gy * cells + gx]) return { ok: false, reason: `${name} unreachable on ${GRID_SIZE}-unit grid` };
  }
  if (pond === 'CORAL' && !layout.routes.some(r => r.id === 'coral-bypass')) return { ok: false, reason: 'coral bypass missing' };
  return { ok: true };
};
