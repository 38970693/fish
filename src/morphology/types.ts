export type MorphologyArchetype =
  | 'STANDARD_FISH'
  | 'DEEP_BODY'
  | 'PUFFER'
  | 'EEL'
  | 'RAY'
  | 'CEPHALOPOD';

export interface MorphologyGenes {
  bodyLength: number;
  bodyDepth: number;
  headRatio: number;
  bellyCurve: number;
  backCurve: number;
  snoutLength: number;
  tailPeduncle: number;
  dorsalFinHeight: number;
  pectoralFinSize: number;
  tailFork: number;
  eyeScale: number;
  eyeSpacing: number;
}

export type MorphologyGene = keyof MorphologyGenes;

export type PartSlot =
  | 'dorsal'
  | 'pectoralLeft'
  | 'pectoralRight'
  | 'pelvicLeft'
  | 'pelvicRight'
  | 'tailFin'
  | 'foreheadAccessory';

export type RenderLayer = 'REAR' | 'BODY' | 'DETAIL' | 'FRONT' | 'EFFECT';

export interface PartGeometry {
  kind: 'DORSAL' | 'PECTORAL' | 'PELVIC' | 'TAIL';
  length: number;
  spread: number;
  fork: number;
  softness: number;
  rootWidth: number;
  blendDepth: number;
}

export interface PartDefinition {
  id: string;
  slot: PartSlot;
  tags: readonly string[];
  requires?: readonly string[];
  excludes?: readonly string[];
  geometry: PartGeometry;
  layer: RenderLayer;
  boundsScale: number;
  fallbackId: string;
  pairId?: string;
}

export interface MaterialSelection {
  primaryColor: string;
  secondaryColor: string;
  patternId: string;
  scaleId: string;
  glow: number;
}

export type SurfaceLayerKind =
  | 'DORSAL_VOLUME'
  | 'FLANK_SHADE'
  | 'HEAD_DOME'
  | 'TAIL_PEDUNCLE'
  | 'GILL'
  | 'LATERAL_LINE'
  | 'NOSTRIL'
  | 'SCALES'
  | 'PATTERN';

export type SurfaceSymmetry = 'MIRROR' | 'CENTER' | 'LIGHTING';

/** 渲染中立的表面语义。Canvas 与 PixiJS 只能消费它，不得另建物种规则。 */
export interface SurfaceLayer {
  kind: SurfaceLayerKind;
  color: string;
  alpha: number;
  width?: number;
  density?: number;
  symmetry: SurfaceSymmetry;
}

export interface SurfaceRegion {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

/** V3-01 的共享体积计算结果，所有数值均为鱼体半径的倍数。 */
export interface VolumeProfile {
  dorsalRidge: SurfaceRegion;
  flankShade: SurfaceRegion;
  headDome: SurfaceRegion;
  tailPeduncle: SurfaceRegion;
  worldLight: Readonly<{ x: number; y: number }>;
}

export interface MotionProfile {
  spineSections: number;
  tailAmplitude: number;
  tailFrequency: number;
  amplitudeCurve: readonly number[];
  turnBend: number;
  finFlutter: number;
  idleBreath: number;
}

/** 每帧由实体运动解析出的渲染中立动作状态。 */
export interface ResolvedMotionState {
  speedRatio: number;
  turn: number;
  boosting: boolean;
  braking: boolean;
  hitReaction: number;
  tailAmplitude: number;
  tailFrequency: number;
  finAmplitude: number;
  leftFin: number;
  rightFin: number;
  breathAmplitude: number;
  bodyStretch: number;
}

export interface MorphologyRecipe {
  id: string;
  archetype: MorphologyArchetype;
  defaults: MorphologyGenes;
  ranges: Readonly<Partial<Record<MorphologyGene, readonly [number, number]>>>;
  requiredParts: Readonly<Partial<Record<PartSlot, string>>>;
  allowedTags: readonly string[];
  forbiddenTags?: readonly string[];
  material: MaterialSelection;
  surfaceLayers: readonly SurfaceLayer[];
  motion: MotionProfile;
  maxVisualExtent: number;
}

export interface PatternMark {
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
}

export type PatternLayerKind = 'BANDS' | 'SPOTS' | 'LATERAL' | 'EDGE' | 'SCALES';
export type PatternMask = 'BODY' | 'HEAD' | 'FLANKS' | 'FINS' | 'TAIL';
export type PatternSymmetry = 'MIRROR' | 'CENTER' | 'ASYMMETRIC';

export interface BandPatternPrimitive {
  kind: 'BAND';
  x: number;
  height: number;
  bend: number;
  width: number;
  color: string;
  alpha: number;
  outlineColor?: string;
  outlineWidth?: number;
  highlightColor?: string;
  highlightWidth?: number;
}

export interface CirclePatternPrimitive {
  kind: 'CIRCLE';
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
  ringWidth?: number;
  sparkle?: boolean;
}

export interface PathPatternPrimitive {
  kind: 'PATH';
  points: readonly MorphologyPoint[];
  width: number;
  color: string;
  alpha: number;
  closed?: boolean;
}

export interface EllipsePatternPrimitive {
  kind: 'ELLIPSE';
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  color: string;
  alpha: number;
  width: number;
}

export type PatternPrimitive = BandPatternPrimitive | CirclePatternPrimitive | PathPatternPrimitive | EllipsePatternPrimitive;

/** 解析后的渲染中立花纹层；Canvas/PixiJS 只消费图元，不再保存物种坐标。 */
export interface ResolvedPatternLayer {
  id: string;
  kind: PatternLayerKind;
  mask: PatternMask;
  symmetry: PatternSymmetry;
  lodPriority: 0 | 1 | 2;
  primitives: readonly PatternPrimitive[];
}

export interface PatternLayerOverride {
  id: string;
  enabled?: boolean;
  order?: number;
  density?: number;
  scale?: number;
  color?: string;
  symmetry?: PatternSymmetry;
  seedOffset?: number;
}

export interface FishAppearanceV2 {
  schemaVersion: 2;
  recipeId: string;
  seed: number;
  genes?: Partial<MorphologyGenes>;
  parts?: Partial<Record<PartSlot, string>>;
  material?: Partial<MaterialSelection>;
  patternLayers?: PatternLayerOverride[];
  mode?: 'SPECIES' | 'CREATIVE' | 'DEVELOPER';
}

export interface MorphologyAnchor {
  x: number;
  y: number;
  tangentX: number;
  tangentY: number;
  normalX: number;
  normalY: number;
  scale: number;
}

export interface MorphologyPoint {
  x: number;
  y: number;
}

export interface StandardFishGeometry {
  outline: readonly MorphologyPoint[];
  anchors: Readonly<Record<
    | 'eyeLeft' | 'eyeRight' | 'mouth' | 'dorsal'
    | 'pectoralLeft' | 'pectoralRight' | 'pelvicLeft' | 'pelvicRight' | 'tailRoot',
    MorphologyAnchor
  >>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number; radius: number };
}

export interface ResolvedMorphology {
  schemaVersion: 2;
  recipeId: string;
  archetype: MorphologyArchetype;
  seed: number;
  genes: Readonly<MorphologyGenes>;
  parts: Readonly<Partial<Record<PartSlot, string>>>;
  material: Readonly<MaterialSelection>;
  surfaceLayers: readonly Readonly<SurfaceLayer>[];
  patternLayers: readonly Readonly<ResolvedPatternLayer>[];
  volume: Readonly<VolumeProfile>;
  motion: Readonly<MotionProfile>;
  geometry: StandardFishGeometry;
  maxVisualExtent: number;
  signature: string;
  warnings: readonly string[];
}
