import type { ResolvedMorphology } from '../../morphology';
import { drawMorphologyBodyDetails, traceMorphologyBody } from './MorphologyCanvasRenderer';

type CacheEntry = { canvas: HTMLCanvasElement; half: number; side: number; bytes: number };
const BUDGET_BYTES = 32 * 1024 * 1024;
const cache = new Map<string, CacheEntry>();
let cachedBytes = 0;

const cacheKey = (morphology: ResolvedMorphology, radius: number, lod: 0 | 1 | 2, density: number): string =>
  `${morphology.signature}|r:${radius}|lod:${lod}|density:${density}|layers:${morphology.surfaceLayers.map(layer => layer.kind).join(',')}`;

const drawDirect = (ctx: CanvasRenderingContext2D, morphology: ResolvedMorphology, radius: number,
  entityAngle: number, lod: 0 | 1 | 2): void => {
  ctx.save();
  ctx.beginPath();
  traceMorphologyBody(ctx, morphology, radius);
  ctx.clip();
  drawMorphologyBodyDetails(ctx, morphology, radius, entityAngle, lod);
  ctx.restore();
};

export const clearMorphologyDetailCache = (): void => {
  cache.clear();
  cachedBytes = 0;
};

export const morphologyDetailCacheStats = (): { entries: number; bytes: number } =>
  ({ entries: cache.size, bytes: cachedBytes });

/** 体积高光和成对解剖线均不随动作变；仅鱼体位置/朝向随主 Canvas 变换。 */
export const drawCachedMorphologyBodyDetails = (
  ctx: CanvasRenderingContext2D, morphology: ResolvedMorphology, radius: number,
  entityAngle: number, lod: 0 | 1 | 2
): void => {
  if (typeof ctx.drawImage !== 'function') { drawDirect(ctx, morphology, radius, entityAngle, lod); return; }
  const transform = ctx.getTransform?.();
  const scale = transform ? Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d)) : 1;
  if (!Number.isFinite(scale) || scale > 3) { drawDirect(ctx, morphology, radius, entityAngle, lod); return; }
  const density = Math.max(1, Math.ceil(scale - 1e-6));
  const key = cacheKey(morphology, radius, lod, density);
  let entry = cache.get(key);
  if (entry) {
    cache.delete(key);
    cache.set(key, entry);
  } else {
    const half = Math.ceil(radius * morphology.maxVisualExtent) + 2;
    const side = half * 2;
    const bytes = side * side * density * density * 4;
    if (bytes > BUDGET_BYTES) { drawDirect(ctx, morphology, radius, entityAngle, lod); return; }
    const canvas = document.createElement('canvas');
    canvas.width = side * density;
    canvas.height = side * density;
    const offscreen = canvas.getContext('2d');
    if (!offscreen) { drawDirect(ctx, morphology, radius, entityAngle, lod); return; }
    offscreen.scale(density, density);
    offscreen.translate(half, half);
    // localLightDirection 固定在鱼体中线，不随 entityAngle 改变，故可共享朝向。
    drawDirect(offscreen, morphology, radius, 0, lod);
    entry = { canvas, half, side, bytes };
    while (cachedBytes + bytes > BUDGET_BYTES && cache.size > 0) {
      const oldest = cache.keys().next().value as string;
      cachedBytes -= cache.get(oldest)!.bytes;
      cache.delete(oldest);
    }
    cache.set(key, entry);
    cachedBytes += bytes;
  }
  ctx.drawImage(entry.canvas, -entry.half, -entry.half, entry.side, entry.side);
};
