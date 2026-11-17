import type { Obstacle } from '../../types';
import { stableObstacleHash, stableObstacleSample } from '../../data/obstacleEcology';

export type RockVariant = 'BOULDER' | 'STRATA' | 'VOLCANIC';
export type CoralVariant = 'BRANCH' | 'FAN' | 'BRAIN';
export type SeaweedVariant = 'KELP' | 'MEADOW' | 'REED';
export type ObstacleVariant = RockVariant | CoralVariant | SeaweedVariant;

export interface ObstaclePalette {
  base: string;
  dark: string;
  light: string;
  accent: string;
  ground: string;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface ObstacleStroke {
  points: NormalizedPoint[];
  width: number;
}

export interface ObstacleSpot extends NormalizedPoint {
  size: number;
  tone: 'LIGHT' | 'DARK' | 'ACCENT';
}

export interface CoralBranch {
  angle: number;
  length: number;
  width: number;
  bend: number;
  fork: number;
}

export interface SeaweedBlade {
  offset: number;
  height: number;
  width: number;
  lean: number;
  phase: number;
  depth: number;
}

export interface ObstacleAppearance {
  variant: ObstacleVariant;
  rotation: number;
  palette: ObstaclePalette;
  silhouette: NormalizedPoint[];
  strokes: ObstacleStroke[];
  spots: ObstacleSpot[];
  branches: CoralBranch[];
  blades: SeaweedBlade[];
}

const PALETTES: Record<Obstacle['type'], readonly ObstaclePalette[]> = {
  ROCK: [
    { base: '#a7bdd3', dark: '#688ba7', light: '#e6f3fa', accent: '#ffcfdb', ground: '#d8e4d5' },
    { base: '#a8cfc3', dark: '#6b9f97', light: '#e2f8df', accent: '#fff0b7', ground: '#dce8c6' },
    { base: '#bcb2d7', dark: '#8b80ae', light: '#efdeff', accent: '#ffc4d5', ground: '#e6d5da' },
  ],
  CORAL: [
    { base: '#ffadbf', dark: '#c87b99', light: '#fff0ee', accent: '#ffe6a2', ground: '#efdbce' },
    { base: '#c5b0ed', dark: '#9380bf', light: '#f4e9ff', accent: '#b7f0e4', ground: '#dcd8e4' },
    { base: '#ffc391', dark: '#cb936f', light: '#fff3d4', accent: '#ffbccc', ground: '#eee0bc' },
  ],
  SEAWEED: [
    { base: '#8bd9b3', dark: '#529d88', light: '#d7f5c4', accent: '#ffcfdd', ground: '#d8e7bc' },
    { base: '#82d5c7', dark: '#4c9fa3', light: '#c9f7eb', accent: '#fff0ad', ground: '#d3e5d0' },
    { base: '#b7d98b', dark: '#7eab73', light: '#edf5bd', accent: '#edccf5', ground: '#e7e4c0' },
  ],
};

const VARIANTS: Record<Obstacle['type'], readonly ObstacleVariant[]> = {
  ROCK: ['BOULDER', 'STRATA', 'VOLCANIC'],
  CORAL: ['BRANCH', 'FAN', 'BRAIN'],
  SEAWEED: ['KELP', 'MEADOW', 'REED'],
};

const CACHE_LIMIT = 512;
const appearanceCache = new Map<string, ObstacleAppearance>();

/** Stable unsigned hash. Rendering never consumes the world's random stream. */
export const obstacleHash = stableObstacleHash;
export const obstacleSample = stableObstacleSample;

const radialSilhouette = (seed: string, count: number, min: number, max: number, yScale = 1): NormalizedPoint[] =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const radius = min + obstacleSample(seed, index) * (max - min);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * yScale };
  });

const makeRock = (seed: string, variant: RockVariant): Pick<ObstacleAppearance, 'silhouette' | 'strokes' | 'spots'> => {
  const count = variant === 'STRATA' ? 11 : variant === 'VOLCANIC' ? 10 : 9;
  const silhouette = radialSilhouette(seed, count, variant === 'STRATA' ? 0.74 : 0.78, 1.03, variant === 'STRATA' ? 0.77 : 0.9);
  const strokes: ObstacleStroke[] = Array.from({ length: variant === 'STRATA' ? 3 : 2 }, (_, i) => {
    const startX = -0.58 + obstacleSample(seed, 30 + i) * 0.5;
    const startY = -0.3 + i * 0.27;
    return {
      width: 0.025 + obstacleSample(seed, 34 + i) * 0.018,
      points: [
        { x: startX, y: startY },
        { x: startX + 0.2, y: startY + 0.08 + obstacleSample(seed, 40 + i) * 0.12 },
        { x: startX + 0.42, y: startY - 0.02 + obstacleSample(seed, 44 + i) * 0.1 },
      ],
    };
  });
  const spotCount = variant === 'VOLCANIC' ? 7 : 5;
  const spots: ObstacleSpot[] = Array.from({ length: spotCount }, (_, i) => ({
    x: -0.56 + obstacleSample(seed, 60 + i * 3) * 1.12,
    y: -0.42 + obstacleSample(seed, 61 + i * 3) * 0.84,
    size: 0.035 + obstacleSample(seed, 62 + i * 3) * 0.06,
    tone: variant === 'VOLCANIC' && i < 3 ? 'ACCENT' : i % 2 === 0 ? 'LIGHT' : 'DARK',
  }));
  return { silhouette, strokes, spots };
};

const makeCoral = (seed: string, variant: CoralVariant): Pick<ObstacleAppearance, 'silhouette' | 'strokes' | 'spots' | 'branches'> => {
  const branchCount = variant === 'BRANCH' ? 7 : variant === 'FAN' ? 9 : 0;
  const branches: CoralBranch[] = Array.from({ length: branchCount }, (_, i) => ({
    angle: -1.14 + (i / Math.max(1, branchCount - 1)) * 2.28 + (obstacleSample(seed, 80 + i) - 0.5) * 0.16,
    length: (variant === 'FAN' ? 0.86 : 0.78) + obstacleSample(seed, 90 + i) * 0.22,
    width: (variant === 'FAN' ? 0.045 : 0.07) + obstacleSample(seed, 100 + i) * 0.045,
    bend: (obstacleSample(seed, 110 + i) - 0.5) * (variant === 'FAN' ? 0.22 : 0.42),
    fork: 0.45 + obstacleSample(seed, 120 + i) * 0.25,
  }));
  const silhouette = variant === 'BRAIN'
    ? radialSilhouette(seed, 14, 0.79, 1.01, 0.78)
    : [
      { x: -0.68, y: 0.52 }, { x: -0.58, y: 0.28 }, { x: -0.28, y: 0.17 },
      { x: 0.05, y: 0.2 }, { x: 0.4, y: 0.15 }, { x: 0.68, y: 0.35 },
      { x: 0.58, y: 0.58 }, { x: 0.08, y: 0.66 }, { x: -0.4, y: 0.62 },
    ];
  const strokes: ObstacleStroke[] = variant === 'BRAIN'
    ? Array.from({ length: 5 }, (_, i) => ({
      width: 0.025,
      points: Array.from({ length: 5 }, (__, p) => ({
        x: -0.58 + p * 0.29,
        y: -0.38 + i * 0.19 + Math.sin(p * 2.2 + i) * 0.075,
      })),
    }))
    : [];
  const spots: ObstacleSpot[] = Array.from({ length: variant === 'BRAIN' ? 8 : 10 }, (_, i) => ({
    x: -0.62 + obstacleSample(seed, 140 + i * 2) * 1.24,
    y: -0.42 + obstacleSample(seed, 141 + i * 2) * 0.84,
    size: 0.025 + obstacleSample(seed, 160 + i) * 0.035,
    tone: i % 3 === 0 ? 'ACCENT' : 'LIGHT',
  }));
  return { silhouette, strokes, spots, branches };
};

const makeSeaweed = (seed: string, variant: SeaweedVariant): Pick<ObstacleAppearance, 'silhouette' | 'strokes' | 'spots' | 'blades'> => {
  const count = variant === 'MEADOW' ? 11 : variant === 'REED' ? 7 : 6;
  const blades: SeaweedBlade[] = Array.from({ length: count }, (_, i) => ({
    offset: -0.7 + (i / (count - 1)) * 1.4 + (obstacleSample(seed, 180 + i) - 0.5) * 0.12,
    height: (variant === 'MEADOW' ? 0.58 : 0.72) + obstacleSample(seed, 190 + i) * (variant === 'REED' ? 0.3 : 0.38),
    width: (variant === 'MEADOW' ? 0.035 : variant === 'REED' ? 0.045 : 0.075) + obstacleSample(seed, 200 + i) * 0.045,
    lean: (obstacleSample(seed, 210 + i) - 0.5) * 0.42,
    phase: obstacleSample(seed, 220 + i) * Math.PI * 2,
    depth: obstacleSample(seed, 230 + i),
  })).sort((a, b) => a.depth - b.depth);
  return {
    silhouette: radialSilhouette(seed, 10, 0.5, 0.76, 0.34),
    strokes: [],
    spots: [],
    blades,
  };
};

export const resolveObstacleAppearance = (obstacle: Pick<Obstacle, 'id' | 'type' | 'radius'>): ObstacleAppearance => {
  const key = `${obstacle.id}|${obstacle.type}|${obstacle.radius}`;
  const cached = appearanceCache.get(key);
  if (cached) return cached;

  const variantList = VARIANTS[obstacle.type];
  const variant = variantList[Math.floor(obstacleSample(key, 0) * variantList.length)]!;
  const paletteList = PALETTES[obstacle.type];
  const palette = paletteList[Math.floor(obstacleSample(key, 1) * paletteList.length)]!;
  const rotation = (obstacleSample(key, 2) - 0.5) * (obstacle.type === 'SEAWEED' ? 0.14 : 0.3);

  let details: Pick<ObstacleAppearance, 'silhouette' | 'strokes' | 'spots' | 'branches' | 'blades'>;
  if (obstacle.type === 'ROCK') {
    details = { ...makeRock(key, variant as RockVariant), branches: [], blades: [] };
  } else if (obstacle.type === 'CORAL') {
    details = { ...makeCoral(key, variant as CoralVariant), blades: [] };
  } else {
    details = { ...makeSeaweed(key, variant as SeaweedVariant), branches: [] };
  }

  const appearance: ObstacleAppearance = { variant, rotation, palette, ...details };
  if (appearanceCache.size >= CACHE_LIMIT) appearanceCache.delete(appearanceCache.keys().next().value!);
  appearanceCache.set(key, appearance);
  return appearance;
};

export const clearObstacleAppearanceCache = (): void => appearanceCache.clear();
