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

  /**
   * 回归：菜单比视口高时**上下两头都不能被裁掉、而且必须滚得到**。
   *
   * 背景：根容器是 `w-full h-screen overflow-hidden`（App.tsx），菜单原先写成
   * `flex items-center justify-center` 且**不滚** —— 内容一旦超过视口高度，居中布局会让
   * 子元素上下同时溢出，而 `overflow-hidden` 的祖先直接把它裁掉，用户既看不见也滚不到
   * （表现就是「第一个界面上下太高，被切掉」）。修法：外层 `overflow-y-auto` 负责滚、
   * 内层 `min-h-full` 包裹负责「矮时居中」。
   *
   * 这条用例特意把视口压到 560 高来制造溢出（否则测不到东西），然后要求标题与开始按钮
   * 都能被滚进视口内 —— 旧布局下 `scrollIntoViewIfNeeded` 救不回来（没有可滚祖先），
   * 标题的 y 会一直是负的。
   */
  test('矮视口下菜单不裁切：头尾控件都能滚进视口', async ({ page }) => {
    const VH = 560;
    await page.setViewportSize({ width: 1280, height: VH });
    await page.goto('/');

    const title = page.getByRole('heading', { name: '欢乐鱼塘' });
    const startBtn = page.getByRole('button', { name: /开始游戏/ });

    // 先确认「菜单真的比视口高」，否则这条用例是空的（装得下就没有裁切风险）。
    // 只比几何量、不认 Tailwind 类名，布局改写法也测得住。
    const titleBox0 = await title.boundingBox();
    const startBox0 = await startBtn.boundingBox();
    expect(titleBox0).not.toBeNull();
    expect(startBox0).not.toBeNull();
    expect(startBox0!.y + startBox0!.height - titleBox0!.y).toBeGreaterThan(VH);

    // 溢出成立 ⇒ 头尾都必须能滚进视口。旧布局（居中 + 不滚 + 祖先 overflow-hidden）
    // 下 scrollIntoViewIfNeeded 救不回来：没有可滚祖先，标题的 y 会一直是负的。
    for (const el of [title, startBtn]) {
      await el.scrollIntoViewIfNeeded();
      const box = await el.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(VH + 1);
    }
  });

  test('游戏开始后世界在推进（小地图渲染）', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /开始游戏/ }).click();

    // 小地图 canvas 存在且在绘制（取消隐藏）
    const minimap = page.locator('canvas').nth(1);
    await expect(minimap).toBeVisible();
  });
});
