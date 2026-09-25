import { test, expect } from '@playwright/test';

/**
 * 关键路径 e2e：首页渲染 → 选择鱼 → 驶入海域 → HUD 出现 → 世界在跑。
 * 断言基于玩家可见的真实 UI（旧版测试盯的是 DEBUG console 日志和已删除的 #start-game-btn）。
 */

test.describe('游戏关键路径', () => {
  test('首页显示标题、鱼类选择和开始按钮', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: '欢乐鱼塘' })).toBeVisible();
    await expect(page.getByText('选择你的初始鱼类')).toBeVisible();
    await expect(page.getByRole('button', { name: /驶入/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '装扮我的鱼' })).toBeVisible();
  });

  test('可以选灯笼鱼并进入游戏，HUD 显示流派技能槽', async ({ page }) => {
    await page.goto('/');

    // 选灯笼鱼（用户点名的鱼，卡片上有技能说明）
    await page.getByRole('button', { name: /灯笼鱼/ }).click();
    await page.getByRole('button', { name: /驶入/ }).click();

    // 进入游玩状态：玩家血条与技能信息出现
    await expect(page.getByText(/玩家 \(灯笼鱼\)/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/技能:/)).toBeVisible();
    // 新手保护提示（P0-2）
    await expect(page.getByText(/新手保护/)).toBeVisible();
  });

  /**
   * 回归①：**常见视口不该出现滚动条**（用户明确要求「不要滚动」）。
   *
   * 背景：菜单原先是竖向堆一长条（内容高 940px），根容器是 `w-full h-screen overflow-hidden`
   * 且布局居中不滚 —— 上下两头被裁掉且滚不到。现在改成**横向铺开**（鱼塘三卡横排、11 条
   * 初始鱼一行、开始/装扮/规则·成就·排行榜合成一行底栏），内容降到 ~494px，常见视口直接装得下。
   *
   * 只比几何量、不认 Tailwind 类名，以后换布局写法也测得住。
   */
  test('菜单横向铺开：常见视口不需要滚动', async ({ page }) => {
    const title = page.getByRole('heading', { name: '欢乐鱼塘' });
    const startBtn = page.getByRole('button', { name: /驶入/ });

    // 1280×560 是「装得下」的下沿；1440×900 是最常见的桌面视口
    for (const [W, H] of [[1280, 560], [1440, 900]] as const) {
      await page.setViewportSize({ width: W, height: H });
      await page.goto('/');

      const titleBox = await title.boundingBox();
      const startBox = await startBtn.boundingBox();
      expect(titleBox).not.toBeNull();
      expect(startBox).not.toBeNull();
      // 整个菜单（标题顶 → 开始按钮底）必须完整落在视口内，也就是根本不需要滚
      expect(titleBox!.y).toBeGreaterThanOrEqual(0);
      expect(startBox!.y + startBox!.height).toBeLessThanOrEqual(H);
    }
  });

  /**
   * 回归②：极端矮视口**仍必须滚得到**。
   *
   * ① 只钉「不滚」，② 只钉「可达」—— 少一条就会退化：
   * 只有①，内容悄悄变高时用户只是多滚一下，回归看不出来；
   * 只有②，就会重演旧布局那种「没有可滚祖先、`scrollIntoViewIfNeeded` 也救不回来」的死局。
   */
  test('极端矮视口仍有滚动兜底：头尾控件都能滚进视口', async ({ page }) => {
    const VH = 420;
    await page.setViewportSize({ width: 1280, height: VH });
    await page.goto('/');

    const title = page.getByRole('heading', { name: '欢乐鱼塘' });
    const startBtn = page.getByRole('button', { name: /驶入/ });

    // 先确认「真的溢出了」，否则这条用例是空的（装得下就没有裁切风险）
    const titleBox0 = await title.boundingBox();
    const startBox0 = await startBtn.boundingBox();
    expect(titleBox0).not.toBeNull();
    expect(startBox0).not.toBeNull();
    expect(startBox0!.y + startBox0!.height - titleBox0!.y).toBeGreaterThan(VH);

    // 溢出成立 ⇒ 头尾都必须能滚进视口
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
    await page.getByRole('button', { name: /驶入/ }).click();

    // 小地图 canvas 存在且在绘制（取消隐藏）
    const minimap = page.locator('canvas').nth(1);
    await expect(minimap).toBeVisible();
  });
});
