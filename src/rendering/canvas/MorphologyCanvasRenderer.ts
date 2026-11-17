import { buildRadialSpines, localLightDirection, type ResolvedMorphology, type ResolvedMotionState, type SurfaceLayerKind } from '../../morphology';
import { getMorphologyPart } from '../../morphology/registry';
import { cartoonPalette, traceCartoonTail } from '../cartoonStyle';

type Ctx = CanvasRenderingContext2D;

const surfaceLayer = (morphology: ResolvedMorphology, kind: SurfaceLayerKind) =>
  morphology.surfaceLayers.find(layer => layer.kind === kind);

const rgba = (color: string, alpha: number): string => {
  const hex = color.replace('#', '');
  if (!/^[\da-f]{6}$/i.test(hex)) return color;
  const value = Number.parseInt(hex, 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
};

/** 把渲染中立轮廓写入当前 Canvas path。调用方负责 beginPath/fill/stroke。 */
export const traceMorphologyBody = (ctx: Ctx, morphology: ResolvedMorphology, radius: number): void => {
  const points = morphology.geometry.outline;
  if (points.length < 3) return;
  ctx.moveTo(points[0].x * radius, points[0].y * radius);
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    ctx.quadraticCurveTo(current.x * radius, current.y * radius, (current.x + next.x) * radius * 0.5, (current.y + next.y) * radius * 0.5);
  }
  ctx.closePath();
};

/** 绘制共享花纹图元。调用方负责先用鱼体轮廓裁切。 */
export const drawMorphologyPatterns = (
  ctx: Ctx, morphology: ResolvedMorphology, radius: number, lod: 0 | 1 | 2 = 0,
  scope: 'BODY' | 'EXTERIOR' = 'BODY'
): void => {
  ctx.save();
  ctx.lineCap = 'round';
  for (const layer of morphology.patternLayers) {
    if (lod > 0 && layer.lodPriority > 1) continue;
    const exterior = layer.mask === 'FINS' || layer.mask === 'TAIL';
    if ((scope === 'EXTERIOR') !== exterior) continue;
    for (const primitive of layer.primitives) {
      if (primitive.kind === 'BAND') {
        ctx.beginPath();
        ctx.moveTo((primitive.x - 0.08) * radius, -primitive.height * radius);
        ctx.quadraticCurveTo((primitive.x + primitive.bend) * radius, 0, (primitive.x - primitive.bend * 0.45) * radius, primitive.height * radius);
        if (primitive.outlineColor && primitive.outlineWidth) {
          ctx.strokeStyle = primitive.outlineColor; ctx.globalAlpha = 0.42;
          ctx.lineWidth = primitive.outlineWidth * radius; ctx.stroke();
        }
        ctx.strokeStyle = primitive.color; ctx.globalAlpha = primitive.alpha;
        ctx.lineWidth = primitive.width * radius; ctx.stroke();
        if (primitive.highlightColor && primitive.highlightWidth) {
          ctx.strokeStyle = primitive.highlightColor; ctx.globalAlpha = 0.48;
          ctx.lineWidth = primitive.highlightWidth * radius; ctx.stroke();
        }
      } else if (primitive.kind === 'CIRCLE') {
        ctx.fillStyle = primitive.color; ctx.globalAlpha = primitive.alpha;
        ctx.beginPath(); ctx.arc(primitive.x * radius, primitive.y * radius, primitive.radius * radius, 0, Math.PI * 2);
        if (primitive.ringWidth) {
          ctx.strokeStyle = primitive.color; ctx.lineWidth = primitive.ringWidth * radius; ctx.stroke();
        } else ctx.fill();
        if (primitive.sparkle) {
          const x = primitive.x * radius; const y = primitive.y * radius; const arm = radius * 0.055;
          ctx.strokeStyle = '#f8fdff'; ctx.globalAlpha = 0.72; ctx.lineWidth = Math.max(0.8, radius * 0.012);
          ctx.beginPath(); ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y); ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm); ctx.stroke();
        }
      } else if (primitive.kind === 'PATH') {
        if (primitive.points.length < 2) continue;
        ctx.globalAlpha = primitive.alpha; ctx.strokeStyle = primitive.color; ctx.lineWidth = primitive.width * radius;
        ctx.beginPath(); ctx.moveTo(primitive.points[0].x * radius, primitive.points[0].y * radius);
        for (const point of primitive.points.slice(1)) ctx.lineTo(point.x * radius, point.y * radius);
        if (primitive.closed) ctx.closePath();
        ctx.stroke();
      } else {
        ctx.globalAlpha = primitive.alpha; ctx.strokeStyle = primitive.color; ctx.lineWidth = primitive.width * radius;
        ctx.beginPath(); ctx.ellipse(primitive.x * radius, primitive.y * radius, primitive.radiusX * radius, primitive.radiusY * radius, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  ctx.restore();
};

export const drawMorphologyRearParts = (
  ctx: Ctx, morphology: ResolvedMorphology, radius: number, visualTime: number, color: string,
  motion?: ResolvedMotionState
): void => {
  const { tailRoot } = morphology.geometry.anchors;
  const amplitude = motion?.tailAmplitude ?? morphology.motion.tailAmplitude;
  const frequency = motion?.tailFrequency ?? morphology.motion.tailFrequency;
  const spread = 1 + Math.sin(visualTime * frequency * 0.1) * amplitude * 0.3;
  const tailPart = getMorphologyPart(morphology.parts.tailFin, 'tail.classic').geometry;
  const length = tailPart.length;
  const fork = tailPart.spread * (0.62 + morphology.genes.tailFork * 0.38);
  ctx.save();
  const palette = cartoonPalette(morphology.material.primaryColor);
  ctx.fillStyle = palette.fin;
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = Math.max(0.8, radius * 0.025);
  const tipX = (tailRoot.x - length) * radius;
  traceCartoonTail(ctx, radius, tailRoot.x, tailRoot.scale * 0.45, length, fork * spread, tailPart.fork, tailPart.softness);
  ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = morphology.material.secondaryColor;
  ctx.lineWidth = Math.max(0.6, radius * 0.016);
  for (const ray of [-0.55, 0, 0.55]) {
    ctx.beginPath();
    ctx.moveTo(tailRoot.x * radius, ray * tailRoot.scale * radius * 0.42);
    ctx.quadraticCurveTo((tailRoot.x - length * 0.48) * radius, ray * fork * radius * spread, tipX, ray * fork * radius * spread);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
};

/** 身体体积、高光与解剖线；调用方先用鱼体轮廓 clip。 */
export const drawMorphologyBodyDetails = (
  ctx: Ctx,
  morphology: ResolvedMorphology,
  radius: number,
  entityAngle = 0,
  lod: 0 | 1 | 2 = 0
): void => {
  const { minX, maxY } = morphology.geometry.bounds;
  const headX = morphology.geometry.anchors.eyeLeft.x;
  const { dorsalRidge, flankShade, headDome, tailPeduncle, worldLight } = morphology.volume;
  const light = localLightDirection(worldLight, entityAngle);
  const flankLayer = surfaceLayer(morphology, 'FLANK_SHADE');
  const ridgeLayer = surfaceLayer(morphology, 'DORSAL_VOLUME');
  const headLayer = surfaceLayer(morphology, 'HEAD_DOME');
  const tailLayer = surfaceLayer(morphology, 'TAIL_PEDUNCLE');
  const gillLayer = surfaceLayer(morphology, 'GILL');
  const lateralLayer = surfaceLayer(morphology, 'LATERAL_LINE');
  const nostrilLayer = surfaceLayer(morphology, 'NOSTRIL');
  ctx.save();
  ctx.lineCap = 'round';

  // 双侧腹部同时下沉；中心保留较亮的背部体积。
  if (flankLayer) {
    const gradient = ctx.createLinearGradient(0, -maxY * radius, 0, maxY * radius);
    gradient.addColorStop(0, rgba(flankLayer.color, flankLayer.alpha));
    gradient.addColorStop(0.38, rgba(flankLayer.color, 0));
    gradient.addColorStop(0.62, rgba(flankLayer.color, 0));
    gradient.addColorStop(1, rgba(flankLayer.color, flankLayer.alpha));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(flankShade.centerX * radius, 0, flankShade.radiusX * radius, flankShade.radiusY * radius, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 局部高光沿鱼体中线，转身后也不破坏上下对称。
  if (ridgeLayer) {
    const offsetX = light.x * dorsalRidge.radiusX * radius * 0.16;
    const offsetY = light.y * Math.max(dorsalRidge.radiusY * radius, radius * 0.04) * 0.8;
    const gradient = ctx.createRadialGradient(
      dorsalRidge.centerX * radius + offsetX,
      offsetY,
      0,
      dorsalRidge.centerX * radius,
      0,
      dorsalRidge.radiusX * radius
    );
    gradient.addColorStop(0, rgba(ridgeLayer.color, ridgeLayer.alpha));
    gradient.addColorStop(0.55, rgba(ridgeLayer.color, ridgeLayer.alpha * 0.38));
    gradient.addColorStop(1, rgba(ridgeLayer.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(dorsalRidge.centerX * radius, 0, dorsalRidge.radiusX * radius, Math.max(radius * 0.035, dorsalRidge.radiusY * radius), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (headLayer && lod === 0) {
    const highlightX = (headDome.centerX + light.x * headDome.radiusX * 0.25) * radius;
    const highlightY = (headDome.centerY + light.y * headDome.radiusY * 0.25) * radius;
    const gradient = ctx.createRadialGradient(highlightX, highlightY, 0, headDome.centerX * radius, 0, headDome.radiusX * radius);
    gradient.addColorStop(0, rgba(headLayer.color, headLayer.alpha));
    gradient.addColorStop(0.58, rgba(headLayer.color, headLayer.alpha * 0.42));
    gradient.addColorStop(1, rgba(headLayer.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(headDome.centerX * radius, 0, headDome.radiusX * radius, headDome.radiusY * radius, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (tailLayer && lod === 0) {
    const gradient = ctx.createRadialGradient(tailPeduncle.centerX * radius, 0, 0, tailPeduncle.centerX * radius, 0, tailPeduncle.radiusX * radius);
    gradient.addColorStop(0, rgba(tailLayer.color, tailLayer.alpha));
    gradient.addColorStop(1, rgba(tailLayer.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(tailPeduncle.centerX * radius, 0, tailPeduncle.radiusX * radius, tailPeduncle.radiusY * radius, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (lod > 0) { ctx.restore(); return; }

  // V3-02：鳃盖、侧线和鼻孔全部按中轴成对生成。
  for (const side of [-1, 1] as const) {
    if (gillLayer && gillLayer.alpha > 0) {
      ctx.beginPath();
      for (let index = 0; index < (gillLayer.count ?? 1); index += 1) {
        const offset = index * 0.115;
        ctx.moveTo((headX - 0.24 - offset) * radius, side * maxY * radius * 0.12);
        ctx.quadraticCurveTo((headX - 0.42 - offset) * radius, side * maxY * radius * 0.34, (headX - 0.2 - offset) * radius, side * maxY * radius * 0.58);
      }
      ctx.strokeStyle = rgba(gillLayer.color, gillLayer.alpha);
      ctx.lineWidth = Math.max(1, radius * (gillLayer.width ?? 0.035));
      ctx.stroke();
    }
    if (lateralLayer && lateralLayer.alpha > 0) {
      ctx.beginPath();
      ctx.moveTo((headX - 0.38) * radius, side * maxY * radius * 0.2);
      ctx.quadraticCurveTo(-radius * 0.18, side * maxY * radius * 0.27, minX * radius * 0.7, side * maxY * radius * 0.14);
      ctx.strokeStyle = rgba(lateralLayer.color, lateralLayer.alpha);
      ctx.lineWidth = Math.max(0.8, radius * (lateralLayer.width ?? 0.025));
      ctx.stroke();
    }
    if (nostrilLayer && nostrilLayer.alpha > 0) {
      const mouth = morphology.geometry.anchors.mouth;
      ctx.beginPath();
      ctx.arc((mouth.x - 0.2) * radius, side * maxY * radius * 0.13, Math.max(0.8, radius * (nostrilLayer.width ?? 0.024)), 0, Math.PI * 2);
      ctx.fillStyle = rgba(nostrilLayer.color, nostrilLayer.alpha);
      ctx.fill();
    }
  }
  ctx.restore();
};

export const drawMorphologyFrontParts = (
  ctx: Ctx, morphology: ResolvedMorphology, radius: number, color: string, motion?: ResolvedMotionState
): void => {
  ctx.save();
  const palette = cartoonPalette(morphology.material.primaryColor);
  ctx.fillStyle = palette.fin;
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = Math.max(0.7, radius * 0.022);
  for (const family of ['pectoral', 'pelvic'] as const) {
    for (const side of [-1, 1] as const) {
      const left = side < 0;
      const fin = family === 'pectoral'
        ? left ? morphology.geometry.anchors.pectoralLeft : morphology.geometry.anchors.pectoralRight
        : left ? morphology.geometry.anchors.pelvicLeft : morphology.geometry.anchors.pelvicRight;
      const partId = family === 'pectoral'
        ? left ? morphology.parts.pectoralLeft : morphology.parts.pectoralRight
        : left ? morphology.parts.pelvicLeft : morphology.parts.pelvicRight;
      const fallback = family === 'pectoral'
        ? left ? 'pectoral.classic' : 'pectoral.classic.right'
        : left ? 'pelvic.round' : 'pelvic.round.right';
      const part = getMorphologyPart(partId, fallback).geometry;
      const finPose = left ? motion?.leftFin ?? 0 : motion?.rightFin ?? 0;
      const length = fin.scale * part.length * (1 + finPose * 0.34);
      ctx.beginPath();
      ctx.moveTo((fin.x + part.spread * 0.22) * radius, fin.y * radius);
      ctx.quadraticCurveTo((fin.x + part.spread * 0.12) * radius, (fin.y + side * length * 1.15) * radius,
        (fin.x - part.spread * 0.36) * radius, (fin.y + side * length * 0.85) * radius);
      ctx.quadraticCurveTo((fin.x - part.spread * 0.58) * radius, (fin.y + side * length * 0.4) * radius,
        (fin.x - part.spread * 0.12) * radius, fin.y * radius);
      ctx.closePath(); ctx.fill(); ctx.stroke();

    }
  }
  const spines = surfaceLayer(morphology, 'RADIAL_SPINES');
  if (spines) {
    ctx.globalAlpha = spines.alpha;
    ctx.fillStyle = spines.color;
    for (const triangle of buildRadialSpines(morphology)) {
      ctx.beginPath();
      ctx.moveTo(triangle[0].x * radius, triangle[0].y * radius);
      ctx.lineTo(triangle[1].x * radius, triangle[1].y * radius);
      ctx.lineTo(triangle[2].x * radius, triangle[2].y * radius);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
};
