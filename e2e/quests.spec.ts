import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const evolveIfNeeded = async (page: Page) => {
  if (await page.getByRole('heading', { name: '选择进化方向' }).isVisible()) {
    await page.getByRole('heading', { name: '选择进化方向' }).locator('..').getByRole('button').first().click();
  }
};
const addSnack = async (page: Page, type = 'PLANKTON') => {
  await page.evaluate(async type => {
    const source = await fetch('/src/App.tsx').then(r => r.text());
    const path = source.match(/from "(\/src\/gameEngine\.ts[^"]*)"/)![1];
    const { createEntity } = await import(/* @vite-ignore */ path);
    const s = (window as any).__FISH_DEBUG__.state(), p = s.player;
    const food = createEntity(type, p.x + Math.cos(p.angle) * 10, p.y + Math.sin(p.angle) * 10);
    food.speed = 0; food.semiGhostTimer = 0; food.health = 1;
    // Isolate the player's meal from ambient AI feeding, while using real collision settlement.
    s.entities = [food]; p.biteCooldown = 0;
  }, type);
};

for (const renderer of ['canvas', 'pixi'] as const) {
  for (const world of ['finite', 'endless'] as const) {
    test(`${renderer} ${world} 真实行动完成任务、自动到账并接续远航`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 940 });
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && m.text().includes('系统异常')) errors.push(m.text()); });
      await page.goto(`/?renderer=${renderer}&mode=legacy&world=${world}&worldSeed=42`);
      await page.getByRole('button', { name: /^驶入/ }).click();
      await expect(page.getByRole('region', { name: '冒险任务', exact: true })).toBeVisible();
      await expect(page.locator('[data-quest="first-meal"]')).toContainText('成长 +4');
      await page.evaluate(() => {
        const s = (window as any).__FISH_DEBUG__.state();
        s.player.isGodMode = true; s.player.speed = 0;
      });
      for (let i = 1; i <= 3; i++) {
        await addSnack(page);
        await expect.poll(() => page.evaluate(() => (window as any).__FISH_DEBUG__.state().quests.stats.eaten)).toBeGreaterThanOrEqual(i);
      }
      await expect(page.locator('[data-quest="first-meal"]')).toContainText('已领奖');
      await expect(page.getByRole('status')).toContainText('已到账：');
      const paid = await page.evaluate(() => {
        const s = (window as any).__FISH_DEBUG__.state(); return { weight: s.player.weight, count: s.quests.completedTotal };
      });
      await page.waitForTimeout(350);
      expect(await page.evaluate(() => (window as any).__FISH_DEBUG__.state().player.weight)).toBe(paid.weight);
      expect(paid.count).toBe(1);
      await mkdir('previews', { recursive: true });
      await page.screenshot({ path: `previews/quests-${renderer}-${world}.png` });
      const panel = await page.getByRole('region', { name: '冒险任务', exact: true }).boundingBox();
      expect(panel!.y + panel!.height).toBeLessThan(940 - 300); // Leaves the minimap visible.

      await page.getByRole('button', { name: '收起冒险任务' }).click();
      await expect(page.getByRole('button', { name: '展开冒险任务' })).toHaveAttribute('aria-expanded', 'false');
      await page.getByRole('button', { name: '展开冒险任务' }).click();
      // A clear test lane isolates controls from walls; the tasks still consume live physics.
      await page.evaluate(() => {
        const s = (window as any).__FISH_DEBUG__.state();
        s.obstacles = []; s.portals = []; s.player.speed = 3.6; s.player.angle = 0;
      });
      await page.mouse.move(900, 470); await page.keyboard.down('Space');
      await expect.poll(() => page.evaluate(() => (window as any).__FISH_DEBUG__.state().quests.chapter), { timeout: 10_000 }).toBe(1);
      await page.keyboard.up('Space');
      await page.evaluate(() => { (window as any).__FISH_DEBUG__.state().player.speed = 0; });
      await evolveIfNeeded(page);
      await expect(page.getByRole('region', { name: '冒险任务', exact: true })).toContainText('寻宝小队');
      await page.evaluate(() => {
        const s = (window as any).__FISH_DEBUG__.state();
        s.powerUps = Array.from({ length: 3 }, (_, i) => ({ id: `quest-coin-${i}`, x: s.player.x, y: s.player.y, type: 'COIN', radius: 18 }));
      });
      await expect.poll(() => page.evaluate(() => (window as any).__FISH_DEBUG__.state().quests.stats.pickups)).toBeGreaterThanOrEqual(3);
      await page.waitForTimeout(150); await evolveIfNeeded(page);
      await expect(page.locator('[data-quest="little-treasures"]')).toContainText('已领奖');
      for (let i = 1; i <= 3; i++) {
        await addSnack(page, 'CLOWN_FISH');
        await expect.poll(() => page.evaluate(() => (window as any).__FISH_DEBUG__.state().squad.recruitedTotal)).toBeGreaterThanOrEqual(i);
        await page.waitForTimeout(150); await evolveIfNeeded(page);
      }
      await page.keyboard.down('q'); await page.waitForTimeout(100); await page.keyboard.up('q');
      await page.mouse.move(900, 470); await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(100); await page.mouse.up({ button: 'right' });
      await expect.poll(() => page.evaluate(() => (window as any).__FISH_DEBUG__.state().quests.chapter)).toBe(2);
      await expect(page.getByRole('region', { name: '冒险任务', exact: true })).toContainText('海洋探险家');
      // Fast-forward only earlier exploration, then make a real final meal settle the main route.
      await page.evaluate(() => {
        const s = (window as any).__FISH_DEBUG__.state();
        s.quests.stats.biomes = ['SHALLOWS', 'REEF']; s.quests.stats.eaten = 19;
        s.player.level = Math.max(s.player.level, s.quests.stats.startingLevel + 3);
      });
      await addSnack(page);
      await expect.poll(() => page.evaluate(() => (window as any).__FISH_DEBUG__.state().quests.round)).toBe(1);
      await expect(page.getByRole('region', { name: '冒险任务', exact: true })).toContainText('远航委托 · 1');
      const voyage = await page.evaluate(() => {
        const s = (window as any).__FISH_DEBUG__.state(); return { total: s.quests.completedTotal, goals: s.quests.quests.map((q: any) => q.baseline), eaten: s.quests.stats.eaten };
      });
      expect(voyage.total).toBe(9); expect(voyage.goals[0]).toBe(voyage.eaten);
      if (renderer === 'pixi') expect(await page.evaluate(() => (window as any).__PIXI_PROBE__.renderErrorCount)).toBe(0);
      expect(errors).toEqual([]);
      await page.getByRole('button', { name: '返回主界面', exact: true }).click();
      await page.getByRole('button', { name: /^驶入/ }).click();
      expect(await page.evaluate(() => (window as any).__FISH_DEBUG__.state().quests.completedTotal)).toBe(0);
    });
  }
}
