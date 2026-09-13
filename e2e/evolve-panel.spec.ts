import { test, expect, type Page } from '@playwright/test';

/**
 * 「选择进化方向」面板：候选必须**稳定**（用户可见症状的浏览器级回归）。
 *
 * 回归的是 2026-09-13 的用户反馈「选择进化方向，后面两个选项一直在变化」。
 * 病灶：候选抽取写在 UIOverlay 的**渲染期**里、内部还带 Math.random 洗牌；
 * 而 UIOverlay 每 100ms 随 uiState 同步重渲染一次 → 后两个卡片每秒换脸 10 次。
 * 修法：抽取挪到进化触发那一刻（systems/progression.ts），结果存进 GameState.evolveOptions。
 *
 * 判据：真实浏览器 + 真实 100ms 同步节奏下，连采 15 次候选文字必须逐次完全一致。
 * 旧实现下这 15 次几乎必然是 15 个不同组合 —— 这条断言会当场变红。
 */

/** 读进化面板里的候选名（限定在「选择进化方向」那个弹窗内，避开页面其它 h3） */
const readOptionLabels = (page: Page) =>
  page.evaluate<string[] | null>(() => {
    const h2 = Array.from(document.querySelectorAll('h2')).find((el) =>
      (el.textContent ?? '').includes('选择进化方向')
    );
    if (!h2 || !h2.parentElement) return null;
    return Array.from(h2.parentElement.querySelectorAll('h3')).map((el) => el.textContent);
  });

test.describe('进化面板：候选不再抖动', () => {
  test('强制触发进化后，连采 15 次候选文字完全一致', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/');
    await page.getByRole('button', { name: /开始游戏/ }).first().click();

    // 调试钩子只有 DEV 构建才有（生产会被摇掉）
    await page.waitForFunction(
      () => typeof (window as unknown as Record<string, unknown>).__FISH_DEBUG__ === 'object'
    );

    // 把进化点数顶到阈值以上 → 下一帧 progression 就会切到 EVOLVING
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __FISH_DEBUG__: { state: () => { player: { evolutionPoints: number } } };
        }
      ).__FISH_DEBUG__;
      dbg.state().player.evolutionPoints = 1e9;
    });

    await expect(page.getByRole('heading', { name: '选择进化方向' })).toBeVisible({
      timeout: 15000,
    });

    const first = await readOptionLabels(page);
    expect(first, '进化面板里应该有 3 个候选').not.toBeNull();
    expect(first?.length).toBe(3);

    // 采样间隔 120ms > 一次 100ms 的 uiState 同步，确保每采一次都跨过至少一次重渲染
    const samples: (string[] | null)[] = [first];
    for (let i = 0; i < 14; i += 1) {
      await page.waitForTimeout(120);
      samples.push(await readOptionLabels(page));
    }

    for (const sample of samples) {
      expect(sample).toEqual(first);
    }
    expect(pageErrors, `页面未捕获异常: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });
});
