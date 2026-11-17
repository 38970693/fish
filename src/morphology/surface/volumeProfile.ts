import type { MorphologyGenes, StandardFishGeometry, SurfaceLayer, VolumeProfile } from '../types';

/** 修改表面层语义或缓存内容时递增，强制 Pixi/LOD 外观缓存失效。 */
export const MORPHOLOGY_SURFACE_REVISION = 'v3-cartoon-5';

export const STANDARD_VOLUME_LAYERS: readonly SurfaceLayer[] = Object.freeze([
  Object.freeze({ kind: 'FLANK_SHADE', color: '#504463', alpha: 0.12, width: 0.72, symmetry: 'MIRROR' }),
  Object.freeze({ kind: 'DORSAL_VOLUME', color: '#fffaf3', alpha: 0.24, width: 0.18, symmetry: 'LIGHTING' }),
  Object.freeze({ kind: 'HEAD_DOME', color: '#ffffff', alpha: 0.18, width: 0.56, symmetry: 'LIGHTING' }),
  Object.freeze({ kind: 'TAIL_PEDUNCLE', color: '#504463', alpha: 0.08, width: 0.44, symmetry: 'CENTER' }),
  Object.freeze({ kind: 'GILL', color: '#57506b', alpha: 0, width: 0.018, symmetry: 'MIRROR' }),
  Object.freeze({ kind: 'LATERAL_LINE', color: '#ffffff', alpha: 0, width: 0.015, symmetry: 'MIRROR' }),
  Object.freeze({ kind: 'NOSTRIL', color: '#57506b', alpha: 0, width: 0.016, symmetry: 'MIRROR' }),
]);

const round = (value: number): number => Math.round(value * 10_000) / 10_000;
const region = (centerX: number, centerY: number, radiusX: number, radiusY: number) => Object.freeze({
  centerX: round(centerX), centerY: round(centerY), radiusX: round(radiusX), radiusY: round(radiusY),
});

/**
 * 从轮廓与基因一次性解析体积语义。这里不读取 Canvas/PixiJS，也不会进入游戏逐帧逻辑。
 */
export const buildVolumeProfile = (
  geometry: StandardFishGeometry,
  genes: MorphologyGenes
): Readonly<VolumeProfile> => {
  const { minX, maxX, maxY } = geometry.bounds;
  const bodyLength = maxX - minX;
  const bodyHalfDepth = maxY;
  const headX = geometry.anchors.eyeLeft.x;
  const tailX = geometry.anchors.tailRoot.x;
  const tailDepth = geometry.anchors.tailRoot.scale;
  const ridgeWidth = bodyHalfDepth * (0.44 + genes.backCurve * 0.16);

  return Object.freeze({
    dorsalRidge: region((minX + maxX) * 0.08, 0, bodyLength * 0.42, ridgeWidth),
    flankShade: region((minX + maxX) * -0.03, 0, bodyLength * 0.48, bodyHalfDepth * (0.72 + genes.bellyCurve * 0.12)),
    headDome: region(headX - bodyLength * 0.05, 0, bodyLength * (0.18 + genes.headRatio * 0.08), bodyHalfDepth * (0.48 + genes.headRatio * 0.16)),
    tailPeduncle: region(tailX + bodyLength * 0.025, 0, bodyLength * 0.13, Math.max(0.08, tailDepth * 0.62)),
    // 局部光斑沿鱼体中线布置，避免上下两侧出现不同亮度。
    worldLight: Object.freeze({ x: -0.62, y: 0 }),
  });
};

export const localLightDirection = (
  worldLight: Readonly<{ x: number; y: number }>,
  _entityAngle: number
): Readonly<{ x: number; y: number }> => {
  return Object.freeze({
    x: round(worldLight.x),
    y: 0,
  });
};
