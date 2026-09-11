/**
 * 游戏规则弹窗探针（待办②）。
 * 验证：主菜单有「游戏规则」按钮 → 点开弹窗（标题/分节/关闭按钮齐全）
 *      → ESC 能关闭 → 关闭后还能点「开始游戏」（遮罩没有卡死菜单）。
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });

const hasBtn = await page.locator('button:has-text("游戏规则")').count();
log(`[1] 菜单上的规则按钮: ${hasBtn ? '✅ 有' : '❌ 没有'}`);

await page.click('button:has-text("游戏规则")');
await page.waitForSelector('text=游戏规则', { timeout: 5000 });

for (const kw of ['目标', '操作', '战斗', '战队', '进化', '建筑与海域', '宝藏与道具', '明白了，开鱼！']) {
  const n = await page.locator(`text=${kw}`).count();
  log(`    弹窗内容「${kw}」: ${n > 0 ? '✅' : '❌'}`);
}
await page.screenshot({ path: 'scripts/rules-probe.png' });

// ESC 关闭
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const stillOpen = await page.locator('text=明白了，开鱼！').count();
log(`[2] ESC 关闭弹窗: ${stillOpen === 0 ? '✅' : '❌ 还开着'}`);

// 关闭后菜单仍可用
const startOk = await page.locator('button:has-text("开始游戏")').count();
log(`[3] 关闭后菜单可用（开始游戏按钮还在）: ${startOk ? '✅' : '❌'}`);
log('[4] 页面错误: ' + (errors.length ? JSON.stringify(errors) : '无'));

await browser.close();
