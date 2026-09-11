/**
 * 塘际传送门端到端探针（「多鱼塘」阶段 2a）。
 *
 * 链路：清水塘开局 → 从调试钩子读到一扇塘际门 → 把玩家挪到门上 →
 *      确认换了塘（pondId / HUD 塘名 / 玩家回中心 / 地形按新塘重建 / 新塘有鱼 / 闪屏闪过）
 *      → 塘内门仍然只在本塘内随机传送 → 规则面板有塘际门说明。
 *
 * 用法：先起 dev server（vite --port 3000），再 node scripts/probe-pond-travel.mjs
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

/** 只取基本类型，别把整个 GameState 序列化回去 */
const snap = () =>
  page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    const pondPortals = (s.portals || []).filter((p) => p.kind === 'POND');
    const locals = (s.portals || []).filter((p) => (p.kind || 'LOCAL') === 'LOCAL');
    return {
      pondId: s.pondId,
      playerX: Math.round(s.player.x),
      playerY: Math.round(s.player.y),
      obstacles: s.obstacles.length,
      entities: s.entities.length,
      pondPortals: pondPortals.map((p) => ({ x: p.x, y: p.y, r: p.radius, target: p.targetPond, name: p.name })),
      localCount: locals.length,
      flash: s.screenFlash ? s.screenFlash.timer : null,
      status: s.status,
    };
  });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });

// ── 1. 清水塘开局 ──
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(900);
const before = await snap();
log(`[1] 开局: pondId=${before.pondId} 障碍=${before.obstacles} 塘内门=${before.localCount} 塘际门=${before.pondPortals.length}`);
log(`[1b] 塘际门: ${JSON.stringify(before.pondPortals.map((p) => `${p.name}->${p.target}`))}`);

if (before.pondPortals.length === 0) {
  log('❌ 没有生成塘际门，探针失败');
  await browser.close();
  process.exit(1);
}

// ── 2. 把玩家挪到第一扇塘际门上，等换塘 ──
const gate = before.pondPortals[0];
await page.evaluate(({ x, y }) => {
  const s = window.__FISH_DEBUG__.state();
  s.player.x = x;
  s.player.y = y;
  s.player.vx = 0;
  s.player.vy = 0;
}, gate);

// 闪屏只闪 40 帧（约 0.67s），用轮询抓它
let sawFlash = false;
let after = null;
for (let i = 0; i < 30; i += 1) {
  const s = await snap();
  if (s.flash !== null && s.flash > 0) sawFlash = true;
  if (s.pondId !== before.pondId) {
    after = s;
    if (!sawFlash) {
      // 已经换塘，再采样几帧看闪屏
      for (let k = 0; k < 5; k += 1) {
        await page.waitForTimeout(40);
        const s2 = await snap();
        if (s2.flash !== null && s2.flash > 0) sawFlash = true;
      }
    }
    break;
  }
  await page.waitForTimeout(60);
}

log(`[2] 换塘结果: pondId=${after ? after.pondId : '(未换塘)'}（目标 ${gate.target}）`);
if (!after) {
  log('❌ 走过塘际门没有换塘');
  await page.screenshot({ path: 'scripts/pond-travel-fail.png' });
  await browser.close();
  process.exit(1);
}

// ⚠️ 不能要求严格等于 (3000,3000)：换塘后世界继续跑，鼠标转向会把鱼推走几像素
const centerDist = Math.hypot(after.playerX - 3000, after.playerY - 3000);
const backAtCenter = centerDist < 200;
const obstaclesChanged = after.obstacles !== before.obstacles;
const seeded = after.entities > 0;
const pondLabel = after.pondId === 'ABYSS' ? '深渊塘' : after.pondId === 'CORAL' ? '珊瑚塘' : '清水塘';
// ⚠️ HUD 的 uiState 是每 100ms 同步一次的：即时 count() 会读到过期快照（老坑），
// 所以这里用 waitForSelector 轮询等它出现。
let hudSwitched = true;
try {
  await page.waitForSelector(`text=${pondLabel}`, { timeout: 3000 });
} catch {
  hudSwitched = false;
}
log(`[3] 玩家回中心: ${backAtCenter ? '✅' : '❌'} (${after.playerX},${after.playerY}) 距中心 ${Math.round(centerDist)}px`);
log(`[3b] 地形按塘重建: ${obstaclesChanged ? '✅' : '❌'}（${before.obstacles} → ${after.obstacles}）`);
log(`[3c] 新塘铺底有鱼: ${seeded ? '✅' : '❌'}（${after.entities} 条）`);
log(`[3d] HUD 塘名切换: ${hudSwitched ? '✅' : '❌'}`);
log(`[3e] 闪屏出现过: ${sawFlash ? '✅' : '❌'}`);
await page.screenshot({ path: 'scripts/pond-travel-after.png' });

// ── 3. 塘内门：仍只在本塘内传送（不会被丢到塘际门上） ──
const cur = await snap();
const local = await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  const p = (s.portals || []).find((x) => (x.kind || 'LOCAL') === 'LOCAL');
  if (!p) return null;
  s.player.x = p.x;
  s.player.y = p.y;
  s.player.vx = 0;
  s.player.vy = 0;
  return { x: p.x, y: p.y };
});
await page.waitForTimeout(500);
const afterLocal = await snap();
log(`[4] 塘内门传送: pondId=${cur.pondId} → ${afterLocal.pondId}（应不变）；玩家 ${afterLocal.playerX},${afterLocal.playerY}（进门点 ${Math.round(local?.x ?? 0)},${Math.round(local?.y ?? 0)}）`);

// ── 4. 规则面板说明 ──
await page.keyboard.press('Escape');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });
await page.click('button:has-text("游戏规则")');
const ruleText = await page.locator('text=塘际门').count();
log(`[5] 规则面板提到塘际门: ${ruleText > 0 ? '✅' : '❌'}`);
await page.screenshot({ path: 'scripts/pond-rules-travel.png' });

// ── 5. 给塘际门拍个特写（站在门外侧，让相机跟过去） ──
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  const p = (s.portals || []).find((x) => x.kind === 'POND');
  if (p) {
    // 站在门外 260px（半径 112，不会被吸进去）
    s.player.x = p.x - 260;
    s.player.y = p.y;
    s.player.vx = 0;
    s.player.vy = 0;
    s.camera.x = p.x - 260;
    s.camera.y = p.y;
  }
});
await page.waitForTimeout(700);
const portalShot = await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  const p = (s.portals || []).find((x) => x.kind === 'POND');
  return p ? { x: Math.round(p.x), y: Math.round(p.y), name: p.name, target: p.targetPond } : null;
});
log(`[7] 塘际门特写: ${JSON.stringify(portalShot)}`);
await page.screenshot({ path: 'scripts/pond-portal-closeup.png' });

log('[6] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
await browser.close();

const ok =
  after.pondId === gate.target &&
  backAtCenter &&
  seeded &&
  hudSwitched &&
  sawFlash &&
  afterLocal.pondId === cur.pondId &&
  ruleText > 0 &&
  errors.length === 0;
log(ok ? '✅ 探针通过' : '❌ 探针失败');
process.exit(ok ? 0 : 1);
