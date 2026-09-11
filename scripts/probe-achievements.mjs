/**
 * 成就系统端到端探针（待办③）。
 *
 * 链路：主菜单成就面板（初始 0/12）→ 开局捕食 → 吃到第一条鱼
 *      → 解锁「初次开饭」→ toast 弹出 → localStorage 已落盘。
 *
 * 用法：先起 dev server（vite --port 3000），再 node scripts/probe-achievements.mjs
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const log = (...a) => console.log(...a);
const W = 1280;
const H = 800;

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push('console.error: ' + m.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });

// ── 1. 主菜单：成就面板 ──
await page.click('button:has-text("成就")');
await page.waitForSelector('text=成就 0/', { timeout: 5000 });
const cards = await page.locator('text=已解锁').count();
log(`[1] 成就面板打开，已解锁数=${cards}（应为 0）`);
// 清掉上一次运行残留，保证「第一次吃鱼就解锁」这条链路可重复验证
await page.evaluate(() => localStorage.removeItem('fish.achievements.v1'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });
await page.click('button:has-text("成就")');
await page.waitForSelector('text=成就 0/', { timeout: 5000 });
log('[2] 清档重开：成就 0/12 ✅');
await page.screenshot({ path: 'scripts/achievements-panel.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ── 2. 开局捕食 ──
await page.click('button:has-text("双髻鲨")');
await page.waitForTimeout(300);
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(600);
await page.keyboard.press('g'); // 无敌

if (!(await page.evaluate(() => typeof window.__FISH_DEBUG__ === 'object'))) {
  log('❌ 调试钩子缺失');
  await browser.close();
  process.exit(1);
}

const readAll = () => page.evaluate(() => ({
  p: window.__FISH_DEBUG__.player(),
  // ⚠️ player() 钩子不带 weight，体重从完整 state 里取（踩过：undefined > x 恒 false，白等 14 秒）
  weight: window.__FISH_DEBUG__.state().player.weight,
  entities: window.__FISH_DEBUG__.state().entities
    .filter((e) => e.ownerId !== 'player' && e.health > 0)
    .map((e) => ({ x: e.x, y: e.y, r: e.radius })),
}));

let st = await readAll();
const startWeight = st.weight;
log(`[3] 出生体重 ${Math.round(startWeight)}，开始追猎`);

let eaten = false;
for (let i = 0; i < 250 && !eaten; i++) {
  st = await readAll();
  if (st.weight > startWeight) { eaten = true; break; }
  const prey = st.entities
    .filter((e) => e.r < st.p.radius)
    .sort((a, b) => Math.hypot(a.x - st.p.x, a.y - st.p.y) - Math.hypot(b.x - st.p.x, b.y - st.p.y))[0];
  if (prey) {
    const dx = prey.x - st.p.x, dy = prey.y - st.p.y, d = Math.hypot(dx, dy) || 1;
    await page.mouse.move(W / 2 + (dx / d) * 380, H / 2 + (dy / d) * 380);
  } else {
    const ang = i * 0.9;
    await page.mouse.move(W / 2 + Math.cos(ang) * 380, H / 2 + Math.sin(ang) * 380);
  }
  await page.waitForTimeout(55);
}
log(`[4] 吃到鱼了: ${eaten ? '✅' : '❌ 60 秒内没吃到'}`);

// 等解锁事件传播 + toast 渲染
await page.waitForTimeout(300);
const toastText = await page.locator('text=成就解锁').count();
log(`[5] 解锁 toast: ${toastText > 0 ? '✅ 弹出' : '❌ 没弹'}`);
await page.screenshot({ path: 'scripts/achievements-toast.png' });

// ── 3. localStorage 落盘 ──
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem('fish.achievements.v1');
  return raw ? JSON.parse(raw) : null;
});
const unlockedOk = !!saved?.unlocked?.['first-blood'];
log(`[6] localStorage: ${unlockedOk ? '✅ first-blood 已解锁落盘' : `❌ ${JSON.stringify(saved)}`}`);

log('[7] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
await browser.close();
const ok = eaten && toastText > 0 && unlockedOk && errors.length === 0;
log(ok ? '✅ 探针通过' : '❌ 探针失败');
process.exit(ok ? 0 : 1);
