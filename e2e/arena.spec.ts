import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const renderer of ['canvas', 'pixi'] as const) {
  test(`${renderer} 短局入口、移动、缩圈提示、淘汰、重开和限时结算`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 940 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && message.text().includes('系统异常')) errors.push(message.text());
    });
    await page.goto(`/?renderer=${renderer}&mode=legacy`);
    await page.getByRole('button', { name: '四分钟短局竞技 · 1 人 + 5 AI' }).click();
    await expect(page.getByRole('region', { name: '竞技状态' })).toBeVisible();
    await expect(page.getByTestId('arena-alive')).toContainText('存活 6 / 6');
    const initial = await page.evaluate(() => {
      const s = (window as any).__FISH_DEBUG__.state();
      return { type: s.player.type, level: s.player.level, skillLevel: s.player.skillLevel,
        x: s.player.x, y: s.player.y, mode: s.run.mode, quests: !!s.quests };
    });
    expect(initial).toMatchObject({ type: 'CLOWN_FISH', level: 2, skillLevel: 1, mode: 'ARENA', quests: false });
    await expect(page.getByRole('region', { name: '当前目标' })).toContainText('吃磷虾，解锁技能');
    const foodCount = await page.evaluate(() => (window as any).__FISH_DEBUG__.state().entities.filter((e: any) => !e.arenaStats).length);
    expect(foodCount).toBeLessThanOrEqual(36); expect(foodCount).toBeGreaterThan(0);
    await mkdir('previews', { recursive: true });
    await page.screenshot({ path: `previews/arena-readable-start-${renderer}.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await page.evaluate(() => {
      const goal = document.querySelector('[aria-label="当前目标"]')!.getBoundingClientRect();
      const controls = document.querySelector('[aria-label="生命与操作"]')!.getBoundingClientRect();
      return { goalRight: goal.right, controlsRight: controls.right, goalBottom: goal.bottom, controlsTop: controls.top };
    });
    expect(layout.goalRight).toBeLessThanOrEqual(390); expect(layout.controlsRight).toBeLessThanOrEqual(390);
    expect(layout.goalBottom).toBeLessThan(layout.controlsTop);
    await expect(page.getByRole('region', { name: '竞技雷达' })).toBeHidden();
    await page.screenshot({ path: `previews/arena-readable-narrow-${renderer}.png` });
    await page.setViewportSize({ width: 1440, height: 940 });
    await page.mouse.move(720, 200); await page.keyboard.down('Space');
    await expect.poll(() => page.evaluate(() => (window as any).__FISH_DEBUG__.state().player.boost.current)).toBeLessThan(85);
    await page.keyboard.up('Space');
    expect(await page.evaluate(() => (window as any).__FISH_DEBUG__.state().player.y)).not.toBe(initial.y);
    await page.evaluate(() => {
      const s = (window as any).__FISH_DEBUG__.state();
      s.run.clock = 35 * 60; s.player.x = 3000; s.player.y = 3000;
      s.camera.x = 3000; s.camera.y = 3000; s.camera.zoom = 0.45;
      for (const c of s.arena.contestants) { c.body.speed = 0; c.body.invulnerableTimer = 60 * 60; }
    });
    await expect(page.getByRole('status')).toContainText('秒后缩圈');
    await expect(page.getByLabel('安全区边界')).toBeVisible();
    await mkdir('previews', { recursive: true });
    await page.screenshot({ path: `previews/arena-${renderer}.png` });
    await page.evaluate(() => { (window as any).__FISH_DEBUG__.state().player.health = 0; });
    await expect(page.getByRole('region', { name: '短局结算' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /本局结束 · 第 6 名/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '复活', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '再战一局' }).click();
    await expect(page.getByTestId('arena-clock')).toContainText('3:');
    await expect(page.getByTestId('arena-alive')).toContainText('存活 6 / 6');
    await page.evaluate(() => {
      const s = (window as any).__FISH_DEBUG__.state(); s.run.clock = 240 * 60 - 1;
      s.player.arenaStats.score = 100;
      s.arena.contestants.forEach((c: any, i: number) => {
        c.body.x = 3000 + Math.cos(i) * 120; c.body.y = 3000 + Math.sin(i) * 120;
        c.body.invulnerableTimer = 100;
      });
    });
    await expect(page.getByRole('heading', { name: '竞技胜利 · 第 1 名' })).toBeVisible();
    await expect(page.getByRole('region', { name: '短局结算' })).toContainText('四分钟到时');
    const clock = await page.evaluate(() => (window as any).__FISH_DEBUG__.state().run.clock);
    await expect.poll(() => page.evaluate(() => (window as any).__FISH_DEBUG__.state().run.clock)).toBe(clock);
    await page.screenshot({ path: `previews/arena-result-${renderer}.png` });
    await page.getByRole('button', { name: '返回主界面' }).click();
    await page.getByRole('button', { name: /^驶入/ }).click();
    await expect(page.getByRole('region', { name: '冒险任务', exact: true })).toBeVisible();
    expect(await page.evaluate(() => !!(window as any).__FISH_DEBUG__.state().arena)).toBe(false);
    expect(errors).toEqual([]);
  });
}
