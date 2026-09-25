import { test, expect } from '@playwright/test';

test('Canvas 静态体积缓存与直接绘制在固定像素下等价', async ({ page }) => {
  await page.goto('/previews/g1-g2-playtest.html');
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const [{ createEntity }, { CreatureType }, { resolveMorphology },
      { drawCachedMorphologyBodyDetails, clearMorphologyDetailCache },
      { drawMorphologyBodyDetails, traceMorphologyBody }] = await Promise.all([
        load('/src/gameEngine.ts'), load('/src/types.ts'), load('/src/morphology/index.ts'),
        load('/src/rendering/canvas/MorphologyDetailCache.ts'),
        load('/src/rendering/canvas/MorphologyCanvasRenderer.ts'),
      ]);
    clearMorphologyDetailCache();
    const differences: Array<{ scale: number; mismatched: number; maxDelta: number; alphaMismatched: number }> = [];
    for (const scale of [1, 2]) for (const type of [CreatureType.CLOWN_FISH, CreatureType.PUFFER_FISH]) {
      const fish = createEntity(type, 0, 0);
      const morphology = resolveMorphology(fish);
      const makeCanvas = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320 * scale;
        canvas.height = 320 * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(scale, scale);
        ctx.translate(160, 160);
        ctx.fillStyle = morphology.material.primaryColor;
        ctx.fillRect(-160, -160, 320, 320);
        return { canvas, ctx };
      };
      const direct = makeCanvas();
      const cached = makeCanvas();
      direct.ctx.save();
      direct.ctx.beginPath();
      traceMorphologyBody(direct.ctx, morphology, 56);
      direct.ctx.clip();
      drawMorphologyBodyDetails(direct.ctx, morphology, 56, 0.7, 0);
      direct.ctx.restore();
      drawCachedMorphologyBodyDetails(cached.ctx, morphology, 56, 0.7, 0);
      const left = direct.ctx.getImageData(0, 0, 320 * scale, 320 * scale).data;
      const right = cached.ctx.getImageData(0, 0, 320 * scale, 320 * scale).data;
      let mismatched = 0;
      let maxDelta = 0;
      let alphaMismatched = 0;
      for (let index = 0; index < left.length; index += 1) {
        const delta = Math.abs(left[index] - right[index]);
        if (delta > 2) mismatched += 1;
        if (index % 4 === 3 && delta > 2) alphaMismatched += 1;
        maxDelta = Math.max(maxDelta, delta);
      }
      differences.push({ scale, mismatched, maxDelta, alphaMismatched });
    }
    return differences;
  });
  for (const fish of result) {
    expect(fish.alphaMismatched).toBe(0);
    expect(fish.maxDelta).toBeLessThanOrEqual(3);
    expect(fish.mismatched).toBeLessThanOrEqual(10);
  }
});
