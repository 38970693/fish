/**
 * 多鱼塘（阶段 1）端到端探针。
 *
 * 链路：菜单出现「选择鱼塘」三选一 → 选深渊塘开局 → 调试钩子确认 pondId / HUD 塘名 /
 *      得分倍率 / 开局报塘名气泡 → 死亡后排行榜记录带塘名 → 重载用缺省塘开局（应为清水塘）
 *      → 规则面板有「鱼塘」分节。
 *
 * 用法：先起 dev server（vite --port 3000），再 node scripts/probe-pond.mjs
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push('console.error: ' + m.text());
});

/** 只读回基本类型，别把整个 GameState 序列化回去（里面有循环引用） */
const readState = () =>
  page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    return {
      pondId: s.pondId,
      status: s.status,
      bubble: s.player.speechBubble ? s.player.speechBubble.text : null,
    };
  });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });
await page.evaluate(() => localStorage.removeItem('fish.leaderboard.v1'));

// ── 1. 菜单三个塘 ──
const names = ['清水塘', '珊瑚塘', '深渊塘'];
const found = {};
for (const n of names) found[n] = await page.locator(`button:has-text("${n}")`).count();
const sectionTitle = await page.locator('text=选择鱼塘').count();
log(`[1] 「选择鱼塘」标题: ${sectionTitle > 0 ? '✅' : '❌'}；按钮: ${JSON.stringify(found)}`);
await page.screenshot({ path: 'scripts/pond-menu.png' });

// ── 2. 选深渊塘开局 ──
await page.click('button:has-text("深渊塘")');
await page.waitForTimeout(150);
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(900);

const deep = await readState();
const deepHud = await page.locator('text=得分 ×2.5').count();
const deepChip = await page.locator('text=深渊塘').count();
log(`[2] 深渊塘开局: pondId=${deep.pondId} status=${deep.status}`);
log(`[2b] HUD: 得分×2.5=${deepHud > 0 ? '✅' : '❌'} 塘名=${deepChip > 0 ? '✅' : '❌'}`);
await page.screenshot({ path: 'scripts/pond-abyss-hud.png' });

// ── 3. 死亡结算 → 排行榜记录带塘名 ──
await page.evaluate(() => { window.__FISH_DEBUG__.state().player.health = 0; });
await page.waitForTimeout(800);
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem('fish.leaderboard.v1');
  return raw ? JSON.parse(raw) : null;
});
const pondTag = Array.isArray(saved) && saved[0] ? saved[0].pond : null;
log(`[3] 结算落盘: 条数=${Array.isArray(saved) ? saved.length : 0} pond=${JSON.stringify(pondTag)}`);

// ── 4. 重载 → 缺省塘（清水塘）开局 ──
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(900);
const clear = await readState();
const clearHud = await page.locator('text=得分 ×1').count();
log(`[4] 缺省开局: pondId=${clear.pondId} HUD得分×1=${clearHud > 0 ? '✅' : '❌'}`);
await page.screenshot({ path: 'scripts/pond-clear-hud.png' });

// ── 5. 规则面板「鱼塘」分节 ──
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });
await page.click('button:has-text("游戏规则")');
const rulePond = await page.locator('text=鱼塘（开局选）').count();
const ruleStars = await page.locator('text=主生态区').count();
log(`[5] 规则面板鱼塘分节: ${rulePond > 0 ? '✅' : '❌'}（主生态区提及 ${ruleStars} 处）`);
await page.screenshot({ path: 'scripts/pond-rules.png' });

log('[6] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
await browser.close();

const ok =
  sectionTitle > 0 &&
  names.every((n) => found[n] > 0) &&
  deep.pondId === 'ABYSS' &&
  deepHud > 0 &&
  deepChip > 0 &&
  pondTag === '深渊塘' &&
  clear.pondId === 'CLEAR' &&
  clearHud > 0 &&
  rulePond > 0 &&
  errors.length === 0;
log(ok ? '✅ 探针通过' : '❌ 探针失败');
process.exit(ok ? 0 : 1);
