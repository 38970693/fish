import { test, expect, type Page } from '@playwright/test';

type LayoutSnapshot = {
  seed: number;
  version: number;
  spawn: { x: number; y: number };
  shop: { x: number; y: number };
  landmarks: Array<{ id: string; kind: string; x: number; y: number; radius: number }>;
  routes: Array<{ id: string; points: Array<{ x: number; y: number }>; width: number }>;
};

const enterProcedural = async (page: Page, renderer: 'canvas' | 'pixi') => {
  await page.goto(`/?mode=rivals&pondLayout=procedural&pondSeed=20260925&renderer=${renderer}`);
  await expect(page.getByText(/程序化布局实验/)).toBeVisible();
  await page.getByRole('button', { name: /驶入/ }).click();
  await expect.poll(async () => page.evaluate(() => (window as any).__FISH_DEBUG__?.state()?.pondLayout?.seed)).toBe(20260925);
  return page.evaluate(() => {
    const state = (window as any).__FISH_DEBUG__.state();
    const shop = state.buildings.find((building: any) => building.type === 'SHOP');
    return {
      mode: state.pondLayoutMode,
      layout: state.pondLayout as LayoutSnapshot,
      player: { x: state.player.x, y: state.player.y },
      shop: shop && { x: shop.x, y: shop.y },
      discovered: state.discoveredLandmarks,
    };
  });
};

test.describe('程序化鱼塘浏览器入口', () => {
  test('Canvas 与 Pixi 对同 seed 消费同一布局，出生点和商店来自布局真值', async ({ browser }) => {
    const canvasPage = await browser.newPage();
    const pixiPage = await browser.newPage();
    try {
      const canvas = await enterProcedural(canvasPage, 'canvas');
      const pixi = await enterProcedural(pixiPage, 'pixi');
      expect(canvas.mode).toBe('PROCEDURAL');
      expect(pixi.mode).toBe('PROCEDURAL');
      expect(canvas.layout).toEqual(pixi.layout);
      expect(Math.hypot(
        canvas.player.x - canvas.layout.spawn.x,
        canvas.player.y - canvas.layout.spawn.y,
      )).toBeLessThan(120);
      expect(Math.hypot(
        pixi.player.x - pixi.layout.spawn.x,
        pixi.player.y - pixi.layout.spawn.y,
      )).toBeLessThan(120);
      expect(canvas.shop).toEqual(canvas.layout.shop);
      expect(canvas.discovered).toEqual([]);
    } finally {
      await canvasPage.close();
      await pixiPage.close();
    }
  });

  test('窄屏程序化布局仍能进入游戏并渲染小地图', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 480 });
    await page.goto('/?mode=rivals&pondLayout=procedural&pondSeed=99&renderer=canvas');
    await page.getByRole('button', { name: /驶入/ }).click();
    await expect.poll(async () => page.evaluate(() => (window as any).__FISH_DEBUG__?.state()?.pondLayout?.seed)).toBe(99);
    await expect(page.locator('canvas').nth(1)).toBeVisible();
    await expect(page.getByText(/seed 99/)).toBeVisible();
  });
});
