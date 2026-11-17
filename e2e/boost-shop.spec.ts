import { expect, test } from '@playwright/test';
import type { GameState } from '../src/types';

for (const renderer of ['canvas', 'pixi']) {
  test(`${renderer}：商店搭配与预览可用，装备到游戏并可关闭`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/?renderer=${renderer}`);
    await page.getByRole('button', { name: '装扮我的鱼' }).click();
    await expect(page.getByRole('heading', { name: '装扮定制' })).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.getByRole('button', { name: '加速效果', exact: true }).click();
    const styles = page.locator('[data-cosmetic-key="boostStyle"]');
    await expect(styles).toHaveCount(4);
    const previews = await styles.locator('canvas').evaluateAll(canvases => canvases.map(c => (c as HTMLCanvasElement).toDataURL()));
    expect(new Set(previews).size).toBe(4);
    await page.locator('[data-cosmetic-key="boostStyle"][data-cosmetic-value="FLAME"]').click();
    await page.locator('[data-cosmetic-key="boostColor"][data-cosmetic-value="#fb923c"]').click();
    await page.getByRole('slider', { name: '拖尾长度' }).fill('1.4');
    await page.getByRole('slider', { name: '效果粗细' }).fill('1.2');
    await page.getByRole('checkbox', { name: '附加气泡' }).uncheck();
    await page.getByRole('button', { name: '常速预览', exact: true }).click();
    await expect(page.getByRole('button', { name: '常速预览', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '加速预览', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('boost-shop.png') });
    await page.getByRole('button', { name: '完成', exact: true }).click();
    // 关闭再打开，配置没有被组件卸载丢掉。
    await page.getByRole('button', { name: '装扮我的鱼' }).click();
    await page.getByRole('button', { name: '加速效果', exact: true }).click();
    await expect(page.locator('[data-cosmetic-key="boostStyle"][data-cosmetic-value="FLAME"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('slider', { name: '拖尾长度' })).toHaveValue('1.4');
    // 整套鱼外观预设也保留已经搭配的加速效果。
    await page.locator('[data-tab="ai-presets"]').click();
    await page.locator('[data-cosmetic-key="preset"]').first().click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByRole('button', { name: /驶入/ }).click();
    await expect(page.locator(`canvas[data-renderer="${renderer}"]`)).toBeVisible();
    if (renderer === 'pixi') {
      await expect.poll(() => page.evaluate(() => window.__PIXI_PROBE__?.renderCount ?? 0)).toBeGreaterThan(8);
    }
    const renderErrors = await page.evaluate(() => window.__PIXI_PROBE__?.renderErrorCount ?? 0);
    await page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      state.entities = []; state.obstacles = []; state.buildings = []; state.treasures = [];
      state.powerUps = []; state.hazards = []; state.currents = []; state.portals = [];
      state.player.x = 3100; state.player.y = 1800; state.player.angle = 0;
      state.player.invulnerableTimer = 600; state.player.boost.current = state.player.boost.max;
      state.camera.x = 3100; state.camera.y = 1800; state.camera.zoom = 1;
    });
    await page.mouse.move(1150, 400);
    await page.keyboard.down('Space');
    await expect.poll(() => page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      const particles = state.particles.filter(p => p.sourceId === 'player');
      return particles.length > 0 && particles.every(p => p.shape === 'BOOST_JET' && p.boostStyle === 'FLAME' && p.color === '#fb923c');
    })).toBe(true);
    await page.keyboard.up('Space');
    // 游戏中的深海商场走同一个页签，关闭特效后加速也不产生尾迹。
    await page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      state.status = 'SHOP' as GameState['status'];
    });
    await page.getByRole('button', { name: '加速效果', exact: true }).click();
    await page.locator('[data-cosmetic-key="boostStyle"][data-cosmetic-value="NONE"]').click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.keyboard.down('Space');
    await expect.poll(() => page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      return { accelerating: (state.player.accelerationMult ?? 1) > 1, particles: state.particles.filter(p => p.sourceId === 'player').length };
    })).toEqual({ accelerating: true, particles: 0 });
    await page.keyboard.up('Space');
    if (renderer === 'pixi') expect(await page.evaluate(() => window.__PIXI_PROBE__?.renderErrorCount ?? 0)).toBe(renderErrors);
    expect(errors).toEqual([]);
  });
}
