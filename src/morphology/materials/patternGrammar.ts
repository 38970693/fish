import { appearanceSeedFromString, createAppearanceRandom } from '../seed';
import type {
  CirclePatternPrimitive,
  EllipsePatternPrimitive,
  MaterialSelection,
  MorphologyPoint,
  PatternLayerOverride,
  PatternPrimitive,
  PathPatternPrimitive,
  ResolvedPatternLayer,
  StandardFishGeometry,
} from '../types';

export const MORPHOLOGY_PATTERN_REVISION = 'v3-pattern-2';
export const MAX_PATTERN_LAYERS = 3;
export const MAX_PATTERN_PRIMITIVES = 48;

export const PATTERN_SAMPLE_MATERIALS = Object.freeze({
  CLOWN_BANDS: { primaryColor: '#fb923c', secondaryColor: '#fff7ed', patternId: 'CLOWN_BANDS', scaleId: 'NONE', glow: 0 },
  STARRY_CLOWN: { primaryColor: '#243b80', secondaryColor: '#5be6ef', patternId: 'STARRY_CLOWN', scaleId: 'NONE', glow: 0.42 },
  RING_SPOTS: { primaryColor: '#0ea5e9', secondaryColor: '#fde68a', patternId: 'RING_SPOTS', scaleId: 'NONE', glow: 0.04 },
  LATERAL_DOTS: { primaryColor: '#14b8a6', secondaryColor: '#ccfbf1', patternId: 'LATERAL_DOTS', scaleId: 'NONE', glow: 0.03 },
  EDGE_TRIM: { primaryColor: '#7c3aed', secondaryColor: '#f0abfc', patternId: 'EDGE_TRIM', scaleId: 'NONE', glow: 0.06 },
  FLOW_SCALES: { primaryColor: '#b45309', secondaryColor: '#fef3c7', patternId: 'FLOW_SCALES', scaleId: 'NONE', glow: 0.02 },
} satisfies Record<string, Readonly<MaterialSelection>>);

export const pointInPolygon = (
  point: Pick<MorphologyPoint, 'x' | 'y'>,
  polygon: readonly MorphologyPoint[]
): boolean => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
};

export const bodyHalfWidthAtX = (polygon: readonly MorphologyPoint[], x: number): number => {
  const intersections: number[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
      intersections.push(a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x));
    }
  }
  return intersections.length ? Math.max(0, Math.max(...intersections.map(Math.abs))) : 0;
};

export const circleInsidePolygon = (
  center: Pick<MorphologyPoint, 'x' | 'y'>,
  radius: number,
  polygon: readonly MorphologyPoint[]
): boolean => {
  if (!pointInPolygon(center, polygon)) return false;
  for (let step = 0; step < 12; step += 1) {
    const angle = step * Math.PI / 6;
    if (!pointInPolygon({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }, polygon)) return false;
  }
  return true;
};

const makeBands = (
  geometry: StandardFishGeometry,
  starry: boolean,
  secondaryColor: string
): ResolvedPatternLayer => {
  const specs = [[-0.48, 0.56, -0.06], [0.18, 0.72, 0.1], [0.62, 0.5, -0.03]] as const;
  return Object.freeze({
    id: starry ? 'starry-bands' : 'clown-bands', kind: 'BANDS' as const, mask: 'BODY' as const,
    symmetry: 'CENTER' as const, lodPriority: 0 as const,
    primitives: Object.freeze(specs.map(([x, requestedHeight, bend]) => Object.freeze({
      kind: 'BAND' as const,
      x,
      height: Math.min(requestedHeight, bodyHalfWidthAtX(geometry.outline, x) * 0.86),
      bend,
      width: starry ? 0.14 : 0.135,
      color: starry ? '#5be6ef' : secondaryColor,
      alpha: starry ? 0.65 : 0.96,
      outlineColor: starry ? '#040c23' : '#0f172a',
      outlineWidth: starry ? 0.21 : 0.22,
      highlightColor: starry ? '#edfaff' : '#ffffff',
      highlightWidth: starry ? 0.065 : 0.032,
    }))),
  });
};

const makeStarrySpots = (seed: number, geometry: StandardFishGeometry): ResolvedPatternLayer => {
  const random = createAppearanceRandom(appearanceSeedFromString(`${seed}:starry-spots:0x51a7`));
  const palette = ['#ffe9aa', '#b6f7ff', '#ffffff'] as const;
  const circles: CirclePatternPrimitive[] = [];
  const { minX, maxX } = geometry.bounds;
  for (let pair = 0; pair < 11; pair += 1) {
    let circle: CirclePatternPrimitive | undefined;
    for (let attempt = 0; attempt < 64 && !circle; attempt += 1) {
      // 柔性网格的头尾会随游动收束，星点集中在稳定躯干区可避免边缘滑出。
      const x = minX + (maxX - minX) * (0.28 + random() * 0.44);
      const halfWidth = bodyHalfWidthAtX(geometry.outline, x);
      const radius = Math.min(0.018 + random() * 0.025, halfWidth * 0.14);
      const y = radius + random() * Math.max(0, halfWidth * 0.68 - radius * 2);
      const candidate: CirclePatternPrimitive = {
        kind: 'CIRCLE', x, y, radius, color: palette[Math.floor(random() * palette.length)],
        alpha: 0.62 + random() * 0.34, sparkle: pair % 3 === 0,
      };
      if (circleInsidePolygon(candidate, radius, geometry.outline)) circle = candidate;
    }
    if (circle) circles.push(circle, { ...circle, y: -circle.y });
  }
  const centerX = (minX + maxX) * 0.5;
  circles.push({ kind: 'CIRCLE', x: centerX, y: 0, radius: 0.018, color: palette[1], alpha: 0.82, sparkle: true });
  return Object.freeze({
    id: 'starry-spots', kind: 'SPOTS' as const, mask: 'BODY' as const,
    symmetry: 'MIRROR' as const, lodPriority: 1 as const,
    primitives: Object.freeze(circles.map(circle => Object.freeze(circle))),
  });
};

const makeRingSpots = (seed: number, geometry: StandardFishGeometry, color: string): ResolvedPatternLayer => {
  const random = createAppearanceRandom(appearanceSeedFromString(`${seed}:ring-spots:0x7106`));
  const circles: CirclePatternPrimitive[] = [];
  const { minX, maxX } = geometry.bounds;
  for (let pair = 0; pair < 7; pair += 1) {
    const x = minX + (maxX - minX) * (0.25 + random() * 0.5);
    const halfWidth = bodyHalfWidthAtX(geometry.outline, x);
    const radius = Math.min(0.05 + random() * 0.035, halfWidth * 0.15);
    const y = radius + random() * Math.max(0, halfWidth * 0.62 - radius * 2);
    const circle: CirclePatternPrimitive = { kind: 'CIRCLE', x, y, radius, color, alpha: 0.72, ringWidth: 0.018 };
    circles.push(circle, { ...circle, y: -y });
  }
  return Object.freeze({
    id: 'ring-spots', kind: 'SPOTS' as const, mask: 'BODY' as const,
    symmetry: 'MIRROR' as const, lodPriority: 1 as const,
    primitives: Object.freeze(circles.map(circle => Object.freeze(circle))),
  });
};

const makeLateralDots = (geometry: StandardFishGeometry, color: string): ResolvedPatternLayer => {
  const circles: CirclePatternPrimitive[] = [];
  const { minX, maxX } = geometry.bounds;
  for (let index = 0; index < 8; index += 1) {
    const x = minX + (maxX - minX) * (0.18 + index * 0.085);
    const y = bodyHalfWidthAtX(geometry.outline, x) * 0.34;
    const circle: CirclePatternPrimitive = { kind: 'CIRCLE', x, y, radius: 0.024, color, alpha: 0.82 };
    circles.push(circle, { ...circle, y: -y });
  }
  return Object.freeze({
    id: 'lateral-dots', kind: 'LATERAL' as const, mask: 'FLANKS' as const,
    symmetry: 'MIRROR' as const, lodPriority: 0 as const,
    primitives: Object.freeze(circles.map(circle => Object.freeze(circle))),
  });
};

const makeEdgeTrim = (geometry: StandardFishGeometry, color: string): ResolvedPatternLayer => {
  const { minX, maxX } = geometry.bounds;
  const makeSide = (side: -1 | 1) => Object.freeze([0.26, 0.42, 0.58, 0.72, 0.82].map(fraction => {
    const x = minX + (maxX - minX) * fraction;
    return Object.freeze({ x, y: side * bodyHalfWidthAtX(geometry.outline, x) * 0.86 });
  }));
  const paths: PathPatternPrimitive[] = ([-1, 1] as const).map(side => Object.freeze({
    kind: 'PATH' as const, points: makeSide(side), width: 0.035, color, alpha: 0.9,
  }));
  for (const side of [-1, 1] as const) {
    const tailRoot = { x: geometry.anchors.tailRoot.x, y: side * geometry.anchors.tailRoot.scale * 0.38 };
    paths.push(Object.freeze({ kind: 'PATH' as const, points: Object.freeze([
      Object.freeze(tailRoot), Object.freeze({ x: tailRoot.x - 0.42, y: side * 0.62 }),
      Object.freeze({ x: tailRoot.x - 0.82, y: side * 0.5 }),
    ]), width: 0.035, color, alpha: 0.9 }));
    for (const anchor of [geometry.anchors.pectoralLeft, geometry.anchors.pelvicLeft]) {
      const paired = side < 0 ? anchor : { ...anchor, y: -anchor.y };
      paths.push(Object.freeze({ kind: 'PATH' as const, points: Object.freeze([
        Object.freeze({ x: paired.x, y: paired.y }),
        Object.freeze({ x: paired.x - 0.16, y: paired.y + side * paired.scale * 0.55 }),
        Object.freeze({ x: paired.x + 0.12, y: paired.y + side * 0.05 }),
      ]), width: 0.028, color, alpha: 0.82 }));
    }
  }
  return Object.freeze({
    id: 'edge-trim', kind: 'EDGE' as const, mask: 'FINS' as const,
    symmetry: 'MIRROR' as const, lodPriority: 0 as const,
    primitives: Object.freeze(paths),
  });
};

const makeFlowScales = (geometry: StandardFishGeometry, color: string): ResolvedPatternLayer => {
  const ellipses: EllipsePatternPrimitive[] = [];
  const { minX, maxX } = geometry.bounds;
  for (let column = 0; column < 6; column += 1) {
    const x = minX + (maxX - minX) * (0.25 + column * 0.095);
    const halfWidth = bodyHalfWidthAtX(geometry.outline, x);
    for (const side of [-1, 1] as const) ellipses.push({
      kind: 'ELLIPSE', x, y: side * halfWidth * 0.34, radiusX: 0.07,
      radiusY: Math.min(0.035, halfWidth * 0.1), color, alpha: 0.52, width: 0.018,
    });
  }
  return Object.freeze({
    id: 'flow-scales', kind: 'SCALES' as const, mask: 'FLANKS' as const,
    symmetry: 'MIRROR' as const, lodPriority: 2 as const,
    primitives: Object.freeze(ellipses.map(ellipse => Object.freeze(ellipse))),
  });
};

const scaledPrimitive = (primitive: PatternPrimitive, scale: number, color?: string): PatternPrimitive => {
  const paint = color ? { color } : {};
  if (primitive.kind === 'BAND') return Object.freeze({
    ...primitive, ...paint, width: primitive.width * scale,
    outlineWidth: primitive.outlineWidth === undefined ? undefined : primitive.outlineWidth * scale,
    highlightWidth: primitive.highlightWidth === undefined ? undefined : primitive.highlightWidth * scale,
  });
  if (primitive.kind === 'CIRCLE') return Object.freeze({
    ...primitive, ...paint, radius: primitive.radius * scale,
    ringWidth: primitive.ringWidth === undefined ? undefined : primitive.ringWidth * scale,
  });
  if (primitive.kind === 'PATH') return Object.freeze({ ...primitive, ...paint, width: primitive.width * scale });
  return Object.freeze({
    ...primitive, ...paint, radiusX: primitive.radiusX * scale,
    radiusY: primitive.radiusY * scale, width: primitive.width * scale,
  });
};

const densitySlice = (
  primitives: readonly PatternPrimitive[], density: number, mirrored: boolean
): readonly PatternPrimitive[] => {
  const safeDensity = Math.max(0, Math.min(1, Number.isFinite(density) ? density : 1));
  if (!mirrored) return primitives.slice(0, Math.ceil(primitives.length * safeDensity));
  const pairCount = Math.floor(primitives.length / 2);
  const selected = primitives.slice(0, Math.ceil(pairCount * safeDensity) * 2);
  if (primitives.length % 2 && safeDensity > 0) selected.push(primitives.at(-1)!);
  return selected;
};

const applyLayerOverride = (
  layer: ResolvedPatternLayer,
  override: PatternLayerOverride | undefined
): ResolvedPatternLayer | undefined => {
  if (override?.enabled === false) return undefined;
  const symmetry = override?.symmetry ?? layer.symmetry;
  let primitives = densitySlice(layer.primitives, override?.density ?? 1, layer.symmetry === 'MIRROR');
  if (symmetry === 'ASYMMETRIC') primitives = primitives.filter((primitive, index) =>
    primitive.kind === 'CIRCLE' || primitive.kind === 'ELLIPSE' ? primitive.y >= 0 : index % 2 === 0);
  if (symmetry === 'CENTER') primitives = primitives.map(primitive => {
    if (primitive.kind === 'CIRCLE' || primitive.kind === 'ELLIPSE') return { ...primitive, y: 0 };
    if (primitive.kind === 'PATH') return { ...primitive, points: primitive.points.map(point => ({ ...point, y: 0 })) };
    return primitive;
  });
  const scale = Math.max(0.25, Math.min(2, override?.scale ?? 1));
  return Object.freeze({
    ...layer, symmetry,
    primitives: Object.freeze(primitives.map(primitive => scaledPrimitive(primitive, scale, override?.color))),
  });
};

export const buildPatternLayers = (
  seed: number,
  material: Readonly<MaterialSelection>,
  geometry: StandardFishGeometry,
  overrides: readonly PatternLayerOverride[] = []
): readonly Readonly<ResolvedPatternLayer>[] => {
  const layers: ResolvedPatternLayer[] = [];
  const overrideFor = (id: string) => overrides.find(override => override.id === id);
  const layerSeed = (id: string) => (seed + Math.trunc(overrideFor(id)?.seedOffset ?? 0)) >>> 0;
  if (material.patternId === 'CLOWN_BANDS' || material.patternId === 'STARRY_CLOWN') {
    layers.push(makeBands(geometry, material.patternId === 'STARRY_CLOWN', material.secondaryColor));
  }
  if (material.patternId === 'STARRY_CLOWN') layers.push(makeStarrySpots(layerSeed('starry-spots'), geometry));
  if (material.patternId === 'STRIPES') layers.push(makeBands(geometry, false, material.secondaryColor));
  if (material.patternId === 'SPOTS' || material.patternId === 'RING_SPOTS') layers.push(makeRingSpots(layerSeed('ring-spots'), geometry, material.secondaryColor));
  if (material.patternId === 'DOTS' || material.patternId === 'LATERAL_DOTS') layers.push(makeLateralDots(geometry, material.secondaryColor));
  if (material.patternId === 'EDGE_TRIM') layers.push(makeEdgeTrim(geometry, material.secondaryColor));
  if (material.patternId === 'FLOW_SCALES') layers.push(makeFlowScales(geometry, material.secondaryColor));
  const limited = layers
    .map(layer => applyLayerOverride(layer, overrideFor(layer.id)))
    .filter((layer): layer is ResolvedPatternLayer => !!layer)
    .sort((left, right) => (overrideFor(left.id)?.order ?? 0) - (overrideFor(right.id)?.order ?? 0))
    .slice(0, MAX_PATTERN_LAYERS);
  let remaining = MAX_PATTERN_PRIMITIVES;
  return Object.freeze(limited.map(layer => {
    const primitives = Object.freeze(layer.primitives.slice(0, remaining));
    remaining -= primitives.length;
    return Object.freeze({ ...layer, primitives });
  }));
};
