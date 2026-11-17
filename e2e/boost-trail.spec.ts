import { expect, test } from '@playwright/test';
import type { GameState } from '../src/types';

for (const renderer of ['pixi', 'canvas']) {
  test(`${renderer}：玩家和 AI 共用加速尾迹，常速立即隐藏`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/?renderer=${renderer}`);
    await page.getByRole('button', { name: /驶入/ }).click();
    await expect(page.locator(`canvas[data-renderer="${renderer}"]`)).toBeVisible();
    if (renderer === 'pixi') {
      await expect.poll(() => page.evaluate(() => window.__PIXI_PROBE__?.renderCount ?? 0)).toBeGreaterThan(8);
    }
    const renderErrors = await page.evaluate(() => window.__PIXI_PROBE__?.renderErrorCount ?? 0);
    await page.evaluate(async () => {
      const moduleUrl = '/src/systems/spawn.ts';
      const { createEntity } = await import(moduleUrl);
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      state.player.x = 3100; state.player.y = 1800; state.player.angle = 0;
      state.player.level = 10; state.player.speed = 2; state.player.invulnerableTimer = 600;
      state.player.boost.current = state.player.boost.max;
      state.camera.x = 3100; state.camera.y = 1800; state.camera.zoom = 1;
      state.obstacles = []; state.buildings = []; state.portals = []; state.hazards = [];
      state.treasures = []; state.powerUps = []; state.currents = []; state.particles = [];
      const npc = createEntity('BLUE_TANG', 3380, 1835, { moodId: 'CALM' });
      npc.id = 'trail-npc'; npc.level = 2; npc.semiGhostTimer = 0; npc.moodTimer = 600;
      state.entities = [npc];
    });
    await page.mouse.move(1150, 400);
    await page.keyboard.down('Space');
    await expect.poll(() => page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      return ['player', 'trail-npc'].every(id => state.particles.some(p => p.shape === 'BOOST_JET' && p.sourceId === id));
    })).toBe(true);
    // 等尾迹铺开并经过 UI 状态同步，再保存实际渲染结果。
    await expect.poll(() => page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      return state.particles.filter(p => p.sourceId === 'player').length;
    })).toBeGreaterThanOrEqual(12);
    if (renderer === 'pixi') {
      await expect.poll(() => page.evaluate(() => window.__PIXI_PROBE__?.visibleParticles ?? 0)).toBeGreaterThan(10);
    }
    await page.screenshot({ path: testInfo.outputPath('boost-trail.png'), clip: { x: 340, y: 240, width: 650, height: 350 } });
    // 在真实帧循环里松开油门并解除 AI 逃跑条件。
    await page.keyboard.up('Space');
    await page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      state.player.level = 1;
      state.entities = state.entities.filter(e => e.id === 'trail-npc');
    });
    await expect.poll(() => page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
      return state.particles.filter(p => p.sourceId === 'player' || p.sourceId === 'trail-npc').length;
    })).toBe(0);
    if (renderer === 'pixi') {
      expect(await page.evaluate(() => window.__PIXI_PROBE__?.renderErrorCount ?? 0)).toBe(renderErrors);
    }
    expect(errors).toEqual([]);
  });
}
