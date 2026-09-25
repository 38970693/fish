import { describe, expect, it, vi } from 'vitest';
import { createEntity } from '../gameEngine';
import { CreatureType } from '../types';
import { resolveMorphology } from '../morphology';
import { clearMorphologyDetailCache, drawCachedMorphologyBodyDetails, morphologyDetailCacheStats } from '../rendering/canvas/MorphologyDetailCache';

describe('Canvas fish volume detail cache', () => {
  it('reuses the same static visual and invalidates radius or layer changes', () => {
    clearMorphologyDetailCache();
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    const morphology = resolveMorphology(fish);
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    drawCachedMorphologyBodyDetails(ctx, morphology, 45, 0, 0);
    expect(morphologyDetailCacheStats().entries).toBe(1);
    drawCachedMorphologyBodyDetails(ctx, morphology, 45, Math.PI, 0);
    expect(morphologyDetailCacheStats().entries).toBe(1);
    drawCachedMorphologyBodyDetails(ctx, morphology, 46, 0, 0);
    expect(morphologyDetailCacheStats().entries).toBe(2);
    drawCachedMorphologyBodyDetails(ctx, { ...morphology, surfaceLayers: [] }, 45, 0, 0);
    expect(morphologyDetailCacheStats().entries).toBe(3);
    (ctx as unknown as { getTransform: () => DOMMatrix }).getTransform = () => ({ a: 2, b: 0, c: 0, d: 2 }) as DOMMatrix;
    drawCachedMorphologyBodyDetails(ctx, morphology, 45, 0, 0);
    expect(morphologyDetailCacheStats().entries).toBe(4);
    expect(ctx.drawImage).toHaveBeenCalledTimes(5);
  });

  it('evicts old images before exceeding the 32 MiB budget', () => {
    clearMorphologyDetailCache();
    const morphology = resolveMorphology(createEntity(CreatureType.CLOWN_FISH, 0, 0));
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    for (let index = 0; index < 50; index += 1) {
      drawCachedMorphologyBodyDetails(ctx, { ...morphology, signature: `${morphology.signature}-${index}` }, 100, 0, 0);
    }
    expect(morphologyDetailCacheStats().bytes).toBeLessThanOrEqual(32 * 1024 * 1024);
    expect(morphologyDetailCacheStats().entries).toBeLessThan(50);
    expect(ctx.drawImage).toHaveBeenCalledTimes(50);
  });
});
