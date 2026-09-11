/**
 * 收尾整理探针 —— 专补「多鱼塘阶段 2a · 排行榜分塘筛选」的视觉证据。
 *
 * 阶段 1 / 2a 的功能截图（选塘菜单、塘 HUD、塘际门、换塘后）已由
 * probe-pond.mjs / probe-pond-travel.mjs 产在 scripts/pond-*.png，
 * 唯独「分塘筛选」没有图，这里补一张。
 *
 * 要点：排行榜数据在**模块导入时**就从 localStorage 读进内存，
 * 所以必须用 addInitScript 在页面脚本跑之前把档写好，之后再写就不生效了。
 *
 * 用法：先起 dev server（vite --port 3000），再 node scripts/probe-wrapup.mjs
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const STORAGE_KEY = 'fish.leaderboard.v1';
const log = (...a) => console.log(...a);

// 预置跨三塘的榜单，制造出「多塘」才有筛选按钮
const seed = [
  { score: 4200, weight: 180, level: 6, survivedSec: 214, recruits: 4, pond: '深渊塘', date: '2026-09-11' },
  { score: 3100, weight: 150, level: 5, survivedSec: 176, recruits: 3, pond: '珊瑚塘', date: '2026-09-11' },
  { score: 2600, weight: 130, level: 5, survivedSec: 150, recruits: 2, pond: '清水塘', date: '2026-09-10' },
  { score: 1900, weight: 110, level: 4, survivedSec: 121, recruits: 1, pond: '珊瑚塘', date: '2026-09-10' },
  { score: 1200, weight: 90, level: 3, survivedSec: 88, recruits: 0, pond: '清水塘', date: '2026-09-09' },
];

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push('console.error: ' + m.text());
});

await page.addInitScript(
  ([key, data]) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* 隐私模式忽略 */
    }
  },
  [STORAGE_KEY, seed]
);

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });

// 统计口径必须**限定在名人堂弹窗内**：
// 弹窗背后「选择鱼塘」的三张卡片里也有「得分 ×1 / ×1.5 / ×2.5」文案，
// 全文 count('text=得分') 会恒定多算 6 条（踩过）。行容器的稳定特征是 rounded-2xl。
const modal = page.locator('div.rounded-3xl').filter({ hasText: '名人堂' });
const rows = () => modal.locator('div.rounded-2xl').count();

// ── 1. 全部榜单（应出现 4 个筛选按钮：全部 / 深渊塘 / 珊瑚塘 / 清水塘） ──
await page.click('button:has-text("排行榜")');
await page.waitForSelector('text=名人堂', { timeout: 5000 });
const modalCount = await modal.count();
const allCount = await modal.locator('button:text-is("全部")').count();
const clearBtn = await modal.locator('button:text-is("清水塘")').count();
const coralBtn = await modal.locator('button:text-is("珊瑚塘")').count();
const abyssBtn = await modal.locator('button:text-is("深渊塘")').count();
log(`[0] 名人堂弹窗数: ${modalCount}（应为 1）`);
log(`[1] 筛选按钮: 全部=${allCount} 清水塘=${clearBtn} 珊瑚塘=${coralBtn} 深渊塘=${abyssBtn}（应各 1）`);
const shownAll = await rows();
log(`[2] 全部视图条目数: ${shownAll}（应为 5）`);
await page.screenshot({ path: 'scripts/leaderboard-pond-all.png' });

// ── 2. 切到深渊塘：只应剩 1 条 ──
await modal.locator('button:text-is("深渊塘")').click();
await page.waitForTimeout(250);
const shownAbyss = await rows();
log(`[3] 深渊塘视图条目数: ${shownAbyss}（应为 1）`);
await page.screenshot({ path: 'scripts/leaderboard-pond-filter.png' });

// ── 3. 切到珊瑚塘：应剩 2 条 ──
await modal.locator('button:text-is("珊瑚塘")').click();
await page.waitForTimeout(250);
const shownCoral = await rows();
log(`[4] 珊瑚塘视图条目数: ${shownCoral}（应为 2）`);

log('[5] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
await browser.close();

const ok =
  modalCount === 1 &&
  allCount === 1 && clearBtn === 1 && coralBtn === 1 && abyssBtn === 1 &&
  shownAll === 5 && shownAbyss === 1 && shownCoral === 2 && errors.length === 0;
log(ok ? '✅ 探针通过' : '❌ 探针失败');
process.exit(ok ? 0 : 1);
