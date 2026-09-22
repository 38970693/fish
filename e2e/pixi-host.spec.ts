import { expect, test } from '@playwright/test';

test.describe('PXR-00～06 Pixi 世界渲染', () => {
  test('默认入口使用 Pixi 渲染器', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas[data-renderer="pixi"]')).toBeVisible();
    await expect(page.locator('canvas[data-renderer="canvas"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __FISH_DEBUG__?: { renderer: () => unknown } }).__FISH_DEBUG__?.renderer())).toMatchObject({ kind: 'pixi', source: 'default' });
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.renderCount ?? 0)).toBeGreaterThan(1);
  });

  test('URL 选择可在 Canvas 与 Pixi 间切换并持久化', async ({ page }) => {
    await page.goto('/?renderer=pixi');
    await expect(page.locator('canvas[data-renderer="pixi"]')).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => (window as unknown as { __FISH_DEBUG__?: { renderer: () => unknown } }).__FISH_DEBUG__?.renderer())).toMatchObject({ kind: 'pixi', source: 'query' });

    await page.goto('/?renderer=canvas');
    await expect(page.locator('canvas[data-renderer="canvas"]')).toBeVisible();
    await expect(page.locator('canvas[data-renderer="pixi"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__PIXI_PROBE__)).toBeUndefined();

    await page.goto('/');
    await expect(page.locator('canvas[data-renderer="canvas"]')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __FISH_DEBUG__?: { renderer: () => unknown } }).__FISH_DEBUG__?.renderer())).toMatchObject({ kind: 'canvas', source: 'storage' });
  });

  test('使用 WebGL 显式渲染，保持 ticker 停止并响应 resize', async ({ page }) => {
    await page.goto('/?renderer=pixi');
    const canvas = page.locator('canvas[data-renderer="pixi"]');
    await expect(canvas).toBeVisible();

    const initial = await page.evaluate(() => window.__PIXI_PROBE__);
    expect(initial).toMatchObject({
      tickerStarted: false,
      width: 1280,
      height: 720,
      contextLostCount: 0,
      contextRestoredCount: 0,
      layerCount: 7,
    });
    expect(initial?.renderer).toContain('WebGL');
    expect(initial?.renderCount).toBeGreaterThan(0);
    expect(initial?.visibleStaticObjects).toBeGreaterThan(0);
    expect(initial?.displayObjects).toBeGreaterThanOrEqual(11);
    expect(initial?.creatureObjects).toBeGreaterThan(0);
    expect(initial?.visibleCreatures).toBeGreaterThan(0);
    expect(initial?.standardFish).toBeGreaterThan(0);
    expect(initial?.creaturePoolCapacity).toBe(96);
    expect(initial?.appearanceCacheCapacity).toBe(128);
    expect(initial?.appearanceCacheSize).toBeLessThanOrEqual(128);

    await page.setViewportSize({ width: 1024, height: 640 });
    await expect.poll(async () => page.evaluate(() => {
      const rect = document.querySelector('[data-testid="pixi-game-host"]')?.getBoundingClientRect();
      return {
        width: window.__PIXI_PROBE__?.width,
        matchesHost: window.__PIXI_PROBE__?.width === Math.round(rect?.width ?? 0)
          && window.__PIXI_PROBE__?.height === Math.round(rect?.height ?? 0),
      };
    })).toEqual({ width: 1024, matchesHost: true });
    expect(await page.evaluate(() => window.__PIXI_PROBE__)).toMatchObject({
      tickerStarted: false,
      width: 1024,
    });

    await page.evaluate(() => window.__PIXI_PROBE__?.forceContextLoss());
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.contextLostCount)).toBe(1);
    await expect
      .poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.contextRestoredCount), { timeout: 10_000 })
      .toBe(1);
    expect(await page.evaluate(() => window.__PIXI_PROBE__)).toMatchObject({
      tickerStarted: false,
      contextLostCount: 1,
      contextRestoredCount: 1,
    });
  });

  test('直接读取共享相机状态并持续渲染静态世界', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/?renderer=pixi');
    await expect(page.locator('canvas[data-renderer="pixi"]')).toBeVisible({ timeout: 15_000 });
    const before = await page.evaluate(() => window.__PIXI_PROBE__);
    await page.evaluate(() => {
      const debug = (window as unknown as { __FISH_DEBUG__?: { state: () => { camera: { x: number } } } }).__FISH_DEBUG__;
      if (debug) debug.state().camera.x += 120;
    });
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.cameraX), { timeout: 15_000 }).not.toBe(before?.cameraX);
    const after = await page.evaluate(() => window.__PIXI_PROBE__);

    expect(after?.renderCount).toBeGreaterThan(before?.renderCount ?? 0);
    expect(after?.cameraX).not.toBe(before?.cameraX);
    expect(after?.layerCount).toBe(7);
    expect(after?.visibleStaticObjects).toBeGreaterThan(0);
    expect(after?.tickerStarted).toBe(false);
    expect(pageErrors).toEqual([]);
  });

  test('完整渲染 20 类生物形状且切换后持续出帧', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/?renderer=pixi');
    await expect(page.locator('canvas[data-renderer="pixi"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.renderCount ?? 0)).toBeGreaterThanOrEqual(8);

    const gallery = await page.evaluate(() => {
      const debug = (window as unknown as {
        __FISH_DEBUG__?: { shapeGallery: () => Array<{ name: string; shape: string }> };
      }).__FISH_DEBUG__;
      return debug?.shapeGallery() ?? [];
    });
    expect(gallery).toHaveLength(20);
    expect(new Set(gallery.map(entry => entry.shape)).size).toBe(20);

    const before = await page.evaluate(() => window.__PIXI_PROBE__?.renderCount ?? 0);
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.visibleCreatures ?? 0)).toBeGreaterThanOrEqual(20);
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.riggedAppendageCreatures ?? 0)).toBeGreaterThanOrEqual(4);
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.segmentedBodyCreatures ?? 0)).toBeGreaterThanOrEqual(2);
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.renderCount ?? 0)).toBeGreaterThan(before + 12);
    await page.evaluate(() => {
      const debug = (window as unknown as { __FISH_DEBUG__?: { shapeGallery: () => unknown } }).__FISH_DEBUG__;
      debug?.shapeGallery();
    });
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.creatureDisplaysReused ?? 0)).toBeGreaterThan(0);
    const resources = await page.evaluate(() => window.__PIXI_PROBE__);
    expect(resources?.creaturePoolSize).toBeLessThanOrEqual(resources?.creaturePoolCapacity ?? 0);
    expect(resources?.appearanceCacheSize).toBeLessThanOrEqual(resources?.appearanceCacheCapacity ?? 0);
    expect(resources?.creatureDisplaysCreated).toBeGreaterThan(0);
    expect(resources?.creatureDisplaysReused).toBeGreaterThan(0);
    expect((resources?.appearanceCacheHits ?? 0) + (resources?.appearanceCacheMisses ?? 0)).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });

  test('渲染投食、宝藏、道具、敌队标记与反击预告', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/?renderer=pixi');
    await expect(page.locator('canvas[data-renderer="pixi"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.renderCount ?? 0)).toBeGreaterThanOrEqual(8);
    const fixture = await page.evaluate(() => {
      const debug = (window as unknown as {
        __FISH_DEBUG__?: { pixiFeedbackGallery: () => Record<string, number> };
      }).__FISH_DEBUG__;
      return debug?.pixiFeedbackGallery();
    });
    expect(fixture).toEqual({ treasures: 5, drops: 5, powerUps: 5, rivals: 2, telegraphs: 2 });
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.visibleWorldItems ?? 0)).toBeGreaterThanOrEqual(12);
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.visibleRivalMarkers ?? 0)).toBeGreaterThanOrEqual(2);
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.visibleCombatTelegraphs ?? 0)).toBeGreaterThanOrEqual(2);
    expect(pageErrors).toEqual([]);
  });

  test('渲染粒子、浮字、气泡、队伍标记和危险标签', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/?renderer=pixi');
    await expect(page.locator('canvas[data-renderer="pixi"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.renderCount ?? 0)).toBeGreaterThanOrEqual(8);
    const fixture = await page.evaluate(() => {
      const debug = (window as unknown as {
        __FISH_DEBUG__?: {
          pixiFeedbackGallery: () => unknown;
          pixiLabelsGallery: () => Record<string, number>;
        };
      }).__FISH_DEBUG__;
      debug?.pixiFeedbackGallery();
      return debug?.pixiLabelsGallery();
    });
    expect(fixture).toEqual({ particles: 10, labels: 2, speechBubbles: 3, squadMarkers: 1, hazards: 1 });
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.visibleParticles ?? 0)).toBeGreaterThanOrEqual(8);
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.visibleWorldLabels ?? 0)).toBeGreaterThanOrEqual(3);
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.visibleSpeechBubbles ?? 0)).toBeGreaterThanOrEqual(3);
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.visibleSquadMarkers ?? 0)).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => page.evaluate(() => window.__PIXI_PROBE__?.visibleHazards ?? 0)).toBeGreaterThanOrEqual(1);
    expect(pageErrors).toEqual([]);
  });
});
