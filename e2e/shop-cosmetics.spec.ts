import { expect, test } from '@playwright/test';
import type { GameState } from '../src/types';

for (const renderer of ['pixi', 'canvas']) {
  test(`${renderer}：从深海商场换装后实际玩家保留装扮`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/?renderer=${renderer}`);
    await page.getByRole('button', { name: /驶入/ }).click();
    await expect(page.locator(`canvas[data-renderer="${renderer}"]`)).toBeVisible();
    if (renderer === 'pixi') await expect.poll(() => page.evaluate(() => window.__PIXI_PROBE__?.renderCount ?? 0)).toBeGreaterThan(8);
    const renderErrors = await page.evaluate(() => window.__PIXI_PROBE__?.renderErrorCount ?? 0);
    await page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      state.entities = []; state.obstacles = []; state.buildings = []; state.portals = [];
      state.treasures = []; state.powerUps = []; state.hazards = []; state.currents = []; state.labels = []; state.particles = [];
      state.player.x = 3100; state.player.y = 1800; state.player.angle = 0;
      state.player.radius = 50; state.player.invulnerableTimer = 600;
      state.camera.x = 3100; state.camera.y = 1800; state.camera.zoom = 1;
      state.status = 'SHOP' as GameState['status'];
    });
    await page.locator('[data-tab="color"]').click();
    await page.locator('[data-cosmetic-key="teeth"][data-cosmetic-value="GOLD"]').click();
    await page.locator('[data-cosmetic-key="skinColor"][data-cosmetic-value="#8b5cf6"]').click();
    await page.locator('[data-tab="pattern"]').click();
    await page.locator('[data-cosmetic-key="scaleType"][data-cosmetic-value="DRAGON"]').click();
    await page.locator('[data-cosmetic-key="pattern"][data-cosmetic-value="STAR"]').click();
    await page.locator('[data-tab="accessory"]').click();
    await page.locator('[data-cosmetic-key="accessory"][data-cosmetic-value="FLOWER"]').click();
    await page.locator('[data-tab="body"]').click();
    await page.locator('[data-cosmetic-key="tailType"][data-cosmetic-value="MECHANICAL"]').click();
    await page.locator('[data-cosmetic-key="trailType"][data-cosmetic-value="HEARTS"]').click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.mouse.move(1100, 400);
    await expect.poll(() => page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      return { status: state.status, ...state.player.cosmetics };
    })).toMatchObject({ status: 'PLAYING', teeth: 'GOLD', skinColor: '#8b5cf6', pattern: 'STAR', scaleType: 'DRAGON', accessory: 'FLOWER', tailType: 'MECHANICAL', trailType: 'HEARTS' });
    await expect(page.getByRole('heading', { name: '装扮定制' })).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('equipped-fish.png'), clip: { x: 390, y: 260, width: 500, height: 280 } });
    if (renderer === 'pixi') expect(await page.evaluate(() => window.__PIXI_PROBE__?.renderErrorCount ?? 0)).toBe(renderErrors);
    expect(errors).toEqual([]);
  });
}

test('Pixi 的每个商店选项都改变真实 GPU 像素', async ({ page }) => {
  await page.goto('/?renderer=canvas');
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const source = await (await fetch('/src/rendering/pixi/CreatureDisplay.ts')).text();
    const pixiUrl = source.match(/from\s*["']([^"']*pixi__js[^"']*)["']/)?.[1];
    if (!pixiUrl) throw new Error('Cannot find the game renderer Pixi module');
    const [{ Application, Rectangle }, { CreatureDisplay }, { createInitialState }, options, { DEFAULT_COSMETICS }] = await Promise.all([
      load(pixiUrl), load('/src/rendering/pixi/CreatureDisplay.ts'),
      load('/src/factories/initialState.ts'), load('/src/data/cosmeticsOptions.ts'), load('/src/types.ts'),
    ]);
    const app = new Application();
    await app.init({ width: 360, height: 240, backgroundAlpha: 0, autoStart: false, preference: 'webgl', antialias: true });
    const player = createInitialState({ skipWorldGen: true }).player;
    player.x = 220; player.y = 120; player.radius = 34;
    const display = new CreatureDisplay(player.id);
    app.stage.addChild(display.root);
    const duplicates: string[] = [];
    const categories = [
      ['skinColor', 'SKIN_COLOR_OPTIONS'], ['teeth', 'TEETH_OPTIONS'], ['pattern', 'PATTERN_OPTIONS'],
      ['scaleType', 'SCALE_OPTIONS'], ['accessory', 'ACCESSORY_OPTIONS'], ['tailType', 'TAIL_OPTIONS'],
      ['bodyType', 'BODY_OPTIONS'], ['mouthType', 'MOUTH_OPTIONS'], ['eyeType', 'EYE_OPTIONS'],
      ['eyebrowType', 'EYEBROW_OPTIONS'], ['trailType', 'TRAIL_OPTIONS'],
    ];
    for (const [key, list] of categories) {
      const seen = new Set<number>();
      for (const option of options[list]) {
        if (key === 'skinColor' && option.value === player.config.color) continue; // 本鱼本色与同一色值是同一效果。
        player.cosmetics = { ...DEFAULT_COSMETICS, [key]: option.value };
        display.update(player, 1000, true, 0);
        app.render();
        const { pixels } = app.renderer.extract.pixels({ target: app.stage, frame: new Rectangle(0, 0, 360, 240) });
        let hash = 2166136261;
        for (const pixel of pixels) hash = Math.imul(hash ^ pixel, 16777619) >>> 0;
        if (seen.has(hash)) duplicates.push(`${key}=${option.value}`);
        seen.add(hash);
      }
    }
    display.destroy(); app.destroy(true);
    return { duplicates };
  });
  expect(result.duplicates).toEqual([]);
});
