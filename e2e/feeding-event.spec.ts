import { test, expect } from '@playwright/test';

test.describe('FQ-07 投食事件接线', () => {
  test('RIVALS HUD 展示日程，并能进入带方向提示的争夺阶段', async ({ page }) => {
    await page.goto('/?mode=rivals');
    await page.getByRole('button', { name: /开始游戏/ }).click();
    await expect(page.getByText(/玩家 \(/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('首次投食准备')).toBeVisible();

    await page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__.state();
      // 落点算法的障碍/无解分支由单测覆盖；接线 e2e 固定空地，避免随机世界合法地延迟事件。
      state.obstacles = [];
      state.buildings = [];
      state.feedingEvent.timer = 1;
    });

    await expect(page.getByText('投食即将开始')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/[→↘↓↙←↖↑↗] \d+m/)).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__.state();
      return state.entities.filter((entity: { ownerId?: string }) => entity.ownerId === 'rival-scavengers').length;
    })).toBe(4);
    await expect.poll(async () => page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__.state();
      return state.entities.filter((entity: { ownerId?: string }) => entity.ownerId === 'rival-ambushers').length;
    })).toBe(3);
    await expect(page.getByText(/抢食帮 · 抢食 · 4人/)).toBeVisible();
    await expect(page.getByText(/伏击帮 · 伏击 · 3人/)).toBeVisible();

    await page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__.state();
      state.feedingEvent.timer = 1;
    });
    await expect(page.getByText('投食争夺中')).toBeVisible({ timeout: 3000 });
    await expect.poll(async () => page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__.state();
      return state.feedingEvent.totalSpawned;
    })).toBeGreaterThan(0);
  });
});
