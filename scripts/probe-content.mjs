/**
 * 内容扩充探针（待办④⑤）：金币收集 + 传送门特效。
 *
 * 链路：等 COIN 成簇投放 → 朝最近金币游 → 靠近截图（验证翻转渲染）
 *      → 拾取后 score +15、coin 事件入成就统计 → 奔袭传送门截图（验证漩涡/星尘）。
 *
 * 用法：先起 dev server（vite --port 3000），再 node scripts/probe-content.mjs
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
// 清档：保证「守财奴」进度从 0 开始可重复验证
await page.evaluate(() => localStorage.removeItem('fish.achievements.v1'));
await page.click('button:has-text("双髻鲨")');
await page.waitForTimeout(300);
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(600);
await page.keyboard.press('g');

if (!(await page.evaluate(() => typeof window.__FISH_DEBUG__ === 'object'))) {
  log('❌ 调试钩子缺失');
  await browser.close();
  process.exit(1);
}

const readAll = () => page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  return {
    p: window.__FISH_DEBUG__.player(),
    score: s.score,
    coins: s.powerUps.filter((u) => u.type === 'COIN').map((u) => ({ id: u.id, x: u.x, y: u.y, r: u.radius })),
    portals: s.portals.map((t) => ({ x: t.x, y: t.y, r: t.radius })),
  };
});

const steerTo = async (tx, ty) => {
  const st = await readAll();
  const dx = tx - st.p.x, dy = ty - st.p.y, d = Math.hypot(dx, dy) || 1;
  await page.mouse.move(W / 2 + (dx / d) * 380, H / 2 + (dy / d) * 380);
};

// ── 1. 等 COIN 投放（每 8 秒一滩）──
let coins = [];
for (let i = 0; i < 60; i++) {
  coins = (await readAll()).coins;
  if (coins.length > 0) break;
  // 等待期间照常游动，避免挂机被判 idle
  const ang = i * 0.5;
  await page.mouse.move(W / 2 + Math.cos(ang) * 300, H / 2 + Math.sin(ang) * 300);
  await page.waitForTimeout(500);
}
log(`[1] 金币投放: ${coins.length > 0 ? `✅ 已出现 ${coins.length} 枚` : '❌ 30 秒内没投'}`);

// ── 2. 追最近的金币并拾取 ──
const scoreBefore = (await readAll()).score;
let picked = false;
let nearShot = false;
for (let i = 0; i < 400 && !picked; i++) {
  const st = await readAll();
  if (st.coins.length === 0) { // 可能全被捡完了
    picked = st.score > scoreBefore;
    break;
  }
  const target = st.coins
    .map((c) => ({ ...c, d: Math.hypot(c.x - st.p.x, c.y - st.p.y) }))
    .sort((a, b) => a.d - b.d)[0];

  if (target.d < 420 && !nearShot) {
    await page.screenshot({ path: 'scripts/content-coin.png' });
    nearShot = true;
    log(`[2] 距金币 ${Math.round(target.d)}px，已截图（验证翻转渲染）`);
  }
  if (target.d < 40) {
    // 贴脸了还没判定拾取：再等两帧读分
    await page.waitForTimeout(120);
    picked = (await readAll()).score > scoreBefore;
    break;
  }
  await steerTo(target.x, target.y);
  await page.waitForTimeout(55);
  if (i % 40 === 39) log(`    还在追：距金币 ${Math.round(target.d)}px score=${(await readAll()).score}`);
}
await page.waitForTimeout(200);
const after = await readAll();
log(`[3] 拾取判定: score ${scoreBefore} → ${after.score} ${after.score > scoreBefore ? '✅ 加分了' : '❌ 没加分'}`);

// ── 3. 成就侧：coin 事件应已计入（本地读取 UI 不可见，读 localStorage）──
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem('fish.achievements.v1');
  return raw ? JSON.parse(raw) : null;
});
log(`[4] 成就统计 coins: ${saved?.stats?.coins ?? 0} 枚 ${saved?.stats?.coins > 0 ? '✅' : '❌'}`);

// ── 4. 传送门特效 ──
const portal = after.portals[0];
if (portal) {
  for (let i = 0; i < 400; i++) {
    const st = await readAll();
    const d = Math.hypot(portal.x - st.p.x, portal.y - st.p.y);
    if (d < portal.r * 2.2) {
      log(`[5] 传送门接近（距 ${Math.round(d)}px），截图`);
      break;
    }
    await steerTo(portal.x, portal.y);
    await page.waitForTimeout(55);
  }
  await page.screenshot({ path: 'scripts/content-portal.png' });
} else {
  log('[5] 当前没有传送门（跳过截图）');
}

log('[6] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
await browser.close();
const ok = coins.length > 0 && after.score > scoreBefore && saved?.stats?.coins > 0 && errors.length === 0;
log(ok ? '✅ 探针通过' : '❌ 探针失败');
process.exit(ok ? 0 : 1);
