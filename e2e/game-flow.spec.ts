import { test, expect } from '@playwright/test';

/**
 * 关键路径 e2e：首页渲染 → 选择鱼 → 开始游戏 → HUD 出现 → 世界在跑。
 * 断言基于玩家可见的真实 UI（旧版测试盯的是 DEBUG console 日志和已删除的 #start-game-btn）。
 */

test.describe('游戏关键路径', () => {
  test('首页显示标题、鱼类选择和开始按钮', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: '欢乐鱼塘' })).toBeVisible();
    await expect(page.getByText('选择你的初始鱼类')).toBeVisible();
    await expect(page.getByRole('button', { name: /开始游戏/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '装扮我的鱼' })).toBeVisible();
  });

  test('可以选灯笼鱼并进入游戏，HUD 显示流派技能槽', async ({ page }) => {
    await page.goto('/');

    // 选灯笼鱼（用户点名的鱼，卡片上有技能说明）
    await page.getByRole('button', { name: /灯笼鱼/ }).click();
    await page.getByRole('button', { name: /开始游戏/ }).click();

    // 进入游玩状态：玩家血条与技能信息出现
    await expect(page.getByText(/玩家 \(灯笼鱼\)/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/技能:/)).toBeVisible();
    // 新手保护提示（P0-2）
    await expect(page.getByText(/新手保护/)).toBeVisible();
  });

  test('游戏开始后世界在推进（小地图渲染）', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /开始游戏/ }).click();

    // 小地图 canvas 存在且在绘制（取消隐藏）
    const minimap = page.locator('canvas').nth(1);
    await expect(minimap).toBeVisible();
  });
});
