/**
 * 排行榜端到端探针（P3 排行榜本地版）。
 *
 * 链路：菜单「排行榜」空榜 → 开局 →（调试钩子把血量归零，稳定触发死亡）
 *      → 结算界面显示「本局位列名人堂第 1 名」→ 重试 → 菜单排行榜里出现记录。
 *
 * 用法：先起 dev server（vite --port 3000），再 node scripts/probe-leaderboard.mjs
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push('console.error: ' + m.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });

// 清档，保证从 0 开始
await page.evaluate(() => localStorage.removeItem('fish.leaderboard.v1'));

// ── 1. 空榜 ──
await page.click('button:has-text("排行榜")');
await page.waitForSelector('text=名人堂', { timeout: 5000 });
const emptyTip = await page.locator('text=还没有记录').count();
log(`[1] 空榜提示: ${emptyTip > 0 ? '✅' : '❌'}`);
await page.screenshot({ path: 'scripts/leaderboard-empty.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ── 2. 开局 → 触发死亡 ──
await page.click('button:has-text("双髻鲨")');
await page.waitForTimeout(300);
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(800);
// 调试钩子的 state() 返回真实引用，可以直接改血量（不走伤害管线，绕开夺舍/无敌帧）
await page.evaluate(() => { window.__FISH_DEBUG__.state().player.health = 0; });
await page.waitForTimeout(600);

const failScreen = await page.locator('text=战斗失败').count();
const rankText = await page.locator('text=本局位列名人堂').count();
log(`[2] 结算界面: ${failScreen > 0 ? '✅ 出现' : '❌ 没出现'}；名次文案: ${rankText > 0 ? '✅ 有' : '❌ 无'}`);
await page.screenshot({ path: 'scripts/leaderboard-gameover.png' });

// ── 3. 落盘 + 榜单回显 ──
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem('fish.leaderboard.v1');
  return raw ? JSON.parse(raw) : null;
});
log(`[3] localStorage 记录数: ${Array.isArray(saved) ? saved.length : 0}（应为 1）`);

await page.click('button:has-text("重试")');
await page.waitForSelector('text=开始游戏', { timeout: 10000 });
await page.click('button:has-text("排行榜")');
await page.waitForSelector('text=名人堂', { timeout: 5000 });
const rows = await page.locator('text=得分').count();
log(`[4] 重开后榜单条目: ${rows}（应为 1）`);
await page.screenshot({ path: 'scripts/leaderboard-panel.png' });

log('[5] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
await browser.close();
const ok = emptyTip > 0 && failScreen > 0 && rankText > 0 && Array.isArray(saved) && saved.length === 1 && rows === 1 && errors.length === 0;
log(ok ? '✅ 探针通过' : '❌ 探针失败');
process.exit(ok ? 0 : 1);
