import { test, expect, type Page } from '@playwright/test';

const startEndless = async (page: Page, renderer: 'canvas' | 'pixi') => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`/?mode=rivals&world=endless&worldSeed=20260925&renderer=${renderer}`);
  const toggle = page.getByRole('button', { name: /无限大地图/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '驶入无限海域' })).toBeVisible();
  await page.getByRole('button', { name: '驶入无限海域' }).click();
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as any).__FISH_DEBUG__?.state?.();
    return state?.endlessWorld?.loadedChunks?.length ?? 0;
  })).toBe(25);
  return pageErrors;
};

test.describe('ENDLESS 无限海域', () => {
  for (const renderer of ['canvas', 'pixi'] as const) {
    test(`${renderer} 可进入无限海域并跨 10 万单位远航`, async ({ page }) => {
      const pageErrors = await startEndless(page, renderer);
      const initial = await page.evaluate(() => {
        const state = (window as any).__FISH_DEBUG__.state();
        return {
          worldMode: state.worldMode,
          seed: state.endlessWorld.seed,
          chunks: state.endlessWorld.loadedChunks.length,
          obstacles: state.obstacles.length,
          portals: state.portals.length,
          originX: state.endlessWorld.originChunkX,
          originY: state.endlessWorld.originChunkY,
        };
      });
      expect(initial).toMatchObject({
        worldMode: 'ENDLESS',
        seed: 20260925,
        chunks: 25,
        portals: 0,
        originX: '0',
        originY: '0',
      });
      expect(initial.obstacles).toBeGreaterThan(0);

      const renderErrorsBefore = renderer === 'pixi'
        ? await page.evaluate(() => (window as any).__PIXI_PROBE__?.renderErrorCount ?? 0)
        : 0;
      await page.evaluate(() => {
        const state = (window as any).__FISH_DEBUG__.state();
        state.player.x = 100_000;
        state.player.y = -100_000;
        state.camera.x = state.player.x;
        state.camera.y = state.player.y;
      });

      await expect.poll(async () => page.evaluate(() => {
        const state = (window as any).__FISH_DEBUG__.state();
        return state.endlessWorld.originChunkX;
      })).not.toBe('0');
      const after = await page.evaluate(() => {
        const state = (window as any).__FISH_DEBUG__.state();
        return {
          x: state.player.x,
          y: state.player.y,
          chunks: state.endlessWorld.loadedChunks.length,
          originX: state.endlessWorld.originChunkX,
          originY: state.endlessWorld.originChunkY,
          globalX: BigInt(state.endlessWorld.originChunkX) * 1800n + BigInt(Math.round(state.player.x)),
          globalY: BigInt(state.endlessWorld.originChunkY) * 1800n + BigInt(Math.round(state.player.y)),
        };
      });
      expect(Math.abs(after.x)).toBeLessThan(1800);
      expect(Math.abs(after.y)).toBeLessThan(1800);
      expect(after.chunks).toBe(25);
      expect(after.globalX).toBeGreaterThan(99_000n);
      expect(after.globalY).toBeLessThan(-99_000n);

      if (renderer === 'pixi') {
        await expect.poll(async () => page.evaluate(() => (window as any).__PIXI_PROBE__?.renderCount ?? 0)).toBeGreaterThan(5);
        const renderErrorsAfter = await page.evaluate(() => (window as any).__PIXI_PROBE__?.renderErrorCount ?? 0);
        expect(renderErrorsAfter).toBe(renderErrorsBefore);
      }
      expect(pageErrors).toEqual([]);
    });
  }
});
