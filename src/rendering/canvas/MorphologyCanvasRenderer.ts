import { localLightDirection, type ResolvedMorphology, type SurfaceLayerKind } from '../../morphology';
import { getMorphologyPart } from '../../morphology/registry';

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

export const drawMorphologyRearParts = (
  ctx: Ctx, morphology: ResolvedMorphology, radius: number, visualTime: number, color: string
): void => {
  const { tailRoot } = morphology.geometry.anchors;
  const wag = Math.sin(visualTime * 0.22) * radius * morphology.motion.tailAmplitude;
  const tailPart = getMorphologyPart(morphology.parts.tailFin, 'tail.classic').geometry;
  const length = tailPart.length;
  const fork = tailPart.spread * (0.62 + morphology.genes.tailFork * 0.38);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(15,23,42,0.35)';
  ctx.lineWidth = Math.max(1, radius * 0.045);
  ctx.beginPath();
  ctx.moveTo(tailRoot.x * radius, -tailRoot.scale * radius * 0.45);
  const tipX = (tailRoot.x - length) * radius;
  ctx.quadraticCurveTo((tailRoot.x - length * (0.38 + tailPart.softness * 0.12)) * radius, -fork * radius + wag * 0.35, tipX, -fork * 1.08 * radius + wag);
  ctx.quadraticCurveTo((tailRoot.x - length * 0.68) * radius, -fork * tailPart.fork * 0.38 * radius + wag * 0.2, (tailRoot.x - length * (0.72 - tailPart.fork * 0.08)) * radius, wag * 0.08);
  ctx.quadraticCurveTo((tailRoot.x - length * 0.68) * radius, fork * tailPart.fork * 0.38 * radius + wag * 0.2, tipX, fork * 1.08 * radius + wag);
  ctx.quadraticCurveTo((tailRoot.x - length * (0.38 + tailPart.softness * 0.12)) * radius, fork * radius + wag * 0.35, tailRoot.x * radius, tailRoot.scale * radius * 0.45);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = morphology.material.secondaryColor;
  ctx.lineWidth = Math.max(0.8, radius * 0.025);
  for (const ray of [-0.72, -0.36, 0, 0.36, 0.72]) {
    ctx.beginPath();
    ctx.moveTo(tailRoot.x * radius, ray * tailRoot.scale * radius * 0.42);
    ctx.quadraticCurveTo((tailRoot.x - length * 0.48) * radius, ray * fork * radius + wag * 0.2, tipX, ray * fork * radius + wag);
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
  const { minX, maxX, maxY } = morphology.geometry.bounds;
  const headX = morphology.geometry.anchors.eyeLeft.x;
  const dorsal = morphology.geometry.anchors.dorsal;
  const dorsalPart = getMorphologyPart(morphology.parts.dorsal, 'dorsal.classic').geometry;
  const { dorsalRidge, flankShade, headDome, tailPeduncle, worldLight } = morphology.volume;
  const light = localLightDirection(worldLight, entityAngle);
  const flankLayer = surfaceLayer(morphology, 'FLANK_SHADE');
  const ridgeLayer = surfaceLayer(morphology, 'DORSAL_VOLUME');
  const headLayer = surfaceLayer(morphology, 'HEAD_DOME');
  const tailLayer = surfaceLayer(morphology, 'TAIL_PEDUNCLE');
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

  // 固定世界光从左上照射；鱼转身时高光在局部坐标中反向移动。
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

  // 鳃盖与侧线暂保留为轻量解剖提示；V3-02 再提升为独立部件。
  ctx.beginPath();
  ctx.moveTo((headX - 0.2) * radius, -maxY * radius * 0.48);
  ctx.quadraticCurveTo((headX - 0.42) * radius, 0, (headX - 0.2) * radius, maxY * radius * 0.48);
  ctx.strokeStyle = 'rgba(15,23,42,0.3)';
  ctx.lineWidth = Math.max(1, radius * 0.035);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo((headX - 0.34) * radius, radius * 0.08);
  ctx.quadraticCurveTo(-radius * 0.18, radius * 0.16, minX * radius * 0.7, radius * 0.05);
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = Math.max(0.8, radius * 0.025);
  ctx.stroke();
  // 俯视时背鳍投影落在中轴上，画成双侧等宽的半透明脊线。
  const ridgeLength = radius * (0.48 + dorsalPart.spread * 0.34);
  const ridgeHalfWidth = radius * (0.025 + dorsal.scale * dorsalPart.length * 0.055);
  const ridgeX = dorsal.x * radius;
  ctx.beginPath();
  ctx.moveTo(ridgeX - ridgeLength * 0.62, 0);
  ctx.quadraticCurveTo(ridgeX, -ridgeHalfWidth, ridgeX + ridgeLength * 0.48, 0);
  ctx.quadraticCurveTo(ridgeX, ridgeHalfWidth, ridgeX - ridgeLength * 0.62, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.strokeStyle = morphology.material.secondaryColor;
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = Math.max(0.8, radius * 0.024);
  ctx.stroke();
  ctx.restore();
};

export const drawMorphologyFrontParts = (ctx: Ctx, morphology: ResolvedMorphology, radius: number, color: string): void => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.78;
  ctx.strokeStyle = 'rgba(15,23,42,0.3)';
  ctx.lineWidth = Math.max(1, radius * 0.04);
  for (const side of [-1, 1] as const) {
    const fin = side < 0 ? morphology.geometry.anchors.pectoralLeft : morphology.geometry.anchors.pectoralRight;
    const partId = side < 0 ? morphology.parts.pectoralLeft : morphology.parts.pectoralRight;
    const fallback = side < 0 ? 'pectoral.classic' : 'pectoral.classic.right';
    const part = getMorphologyPart(partId, fallback).geometry;
    const length = fin.scale * part.length;
    ctx.beginPath();
    ctx.moveTo(fin.x * radius, fin.y * radius);
    ctx.quadraticCurveTo((fin.x - part.spread * 0.43) * radius, (fin.y + side * length) * radius, (fin.x + part.spread * 0.52) * radius, (fin.y + side * 0.08) * radius);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 半透明根部融合区把鳍压进身体，而不是像贴片悬浮在轮廓上。
    const rootGradient = ctx.createRadialGradient(fin.x * radius, fin.y * radius, 0, fin.x * radius, fin.y * radius, radius * fin.scale * 0.42);
    rootGradient.addColorStop(0, rgba(morphology.material.secondaryColor, 0.34));
    rootGradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = rootGradient;
    ctx.beginPath();
    ctx.ellipse(fin.x * radius, fin.y * radius, radius * fin.scale * 0.44, radius * fin.scale * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = morphology.material.secondaryColor;
    ctx.lineWidth = Math.max(0.8, radius * 0.025);
    for (const offset of [-0.16, 0.04, 0.22]) {
      ctx.beginPath();
      ctx.moveTo(fin.x * radius, fin.y * radius);
      ctx.quadraticCurveTo((fin.x - part.spread * (0.28 + offset)) * radius, (fin.y + side * length * (0.78 + offset * 0.2)) * radius, (fin.x + part.spread * 0.4) * radius, (fin.y + side * 0.07) * radius);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = 'rgba(15,23,42,0.3)';
    ctx.lineWidth = Math.max(1, radius * 0.04);
  }
  ctx.restore();
};
