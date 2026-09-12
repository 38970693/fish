/**
 * 每塘独有内容端到端探针（「多鱼塘」阶段 3a）。
 *
 * 链路：菜单三张塘卡都有「特产」行 → 清水塘开局（世界里有许愿池、没有沉船/珍珠场）→
 *      把玩家挪上许愿池（稳定金币，进冷却）→ 走塘际门去深渊塘 →
 *      世界重建后只有沉船 → 挪上沉船（金币 + 惊出吸血鬼乌贼）→
 *      把 time 推到 2400 的倍数触发「星光鱼群潮」→ 各步截图。
 *
 * 用法：先起 dev server（vite --port 3000），再 node scripts/probe-pond-content.mjs
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

const snap = () =>
  page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    return {
      pondId: s.pondId,
      score: s.score,
      time: s.time,
      buildings: (s.buildings || []).map((b) => b.type),
      entities: (s.entities || []).map((e) => e.type),
      powerUps: (s.powerUps || []).map((p) => p.type),
      playerX: Math.round(s.player.x),
      playerY: Math.round(s.player.y),
      cooldowns: (s.buildings || []).map((b) => b.cooldown),
      pondPortals: (s.portals || [])
        .filter((p) => p.kind === 'POND')
        .map((p) => ({ x: p.x, y: p.y, target: p.targetPond })),
    };
  });

/** 把玩家瞬移到某点（世界在跑，挪过去后世界继续推着走几像素，判定要留容差） */
const movePlayer = ({ x, y }) =>
  page.evaluate(({ x, y }) => {
    const s = window.__FISH_DEBUG__.state();
    s.player.x = x;
    s.player.y = y;
    s.player.vx = 0;
    s.player.vy = 0;
    s.player.invulnerableTimer = 300; // 路上别被野鱼咬死干扰断言
  }, { x, y });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });

// ── 1. 菜单：三张塘卡都有「特产」行 ──
const cardCount = await page.locator('text=特产：').count();
log(`[1] 菜单塘卡特产行: ${cardCount} 张（应 3）`);
await page.screenshot({ path: 'scripts/pond-content-menu.png' });

// ── 2. 清水塘开局：世界里有许愿池，没有沉船/珍珠场 ──
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(900);
const clear = await snap();
const hasWell = clear.buildings.includes('WISHING_WELL');
const noWreck = !clear.buildings.includes('SHIPWRECK') && !clear.buildings.includes('PEARL_FARM');
log(`[2] 清水塘建筑: ${clear.buildings.join(',')} | 许愿池${hasWell ? '✅' : '❌'} 无他塘特产${noWreck ? '✅' : '❌'}`);
const abyssGate = clear.pondPortals.find((p) => p.target === 'ABYSS');
log(`[2b] 深渊塘际门: ${abyssGate ? '✅' : '❌'}`);

// ── 3. 许愿池：挪上去 → 分数上涨 + 进冷却 ──
const well = await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  const b = s.buildings.find((x) => x.type === 'WISHING_WELL');
  return b ? { x: b.x, y: b.y } : null;
});
let wellScored = false;
let wellCooldown = false;
if (well) {
  await movePlayer(well);
  await page.waitForTimeout(400);
  const s3 = await snap();
  wellScored = s3.score >= 15;
  const idx = s3.buildings.indexOf('WISHING_WELL');
  wellCooldown = idx >= 0 && s3.cooldowns[idx] > 0;
}
log(`[3] 许愿池触发: 分数${wellScored ? '✅' : '❌'} 冷却${wellCooldown ? '✅' : '❌'}`);

// ── 4. 走塘际门去深渊塘 ──
if (!abyssGate) {
  log('❌ 没有深渊塘际门，探针失败');
  await browser.close();
  process.exit(1);
}
await movePlayer(abyssGate);
let abyss = null;
for (let i = 0; i < 30; i += 1) {
  const s = await snap();
  if (s.pondId === 'ABYSS') { abyss = s; break; }
  await page.waitForTimeout(60);
}
const traveled = !!abyss;
const wreckOnly = traveled && abyss.buildings.includes('SHIPWRECK')
  && !abyss.buildings.includes('WISHING_WELL') && !abyss.buildings.includes('PEARL_FARM');
log(`[4] 换到深渊塘: ${traveled ? '✅' : '❌'} | 沉船在场/许愿池退场: ${wreckOnly ? '✅' : '❌'}`);

// ── 5. 沉船惊魂：挪上去 → 金币 + 吸血鬼乌贼 ──
let wreckScored = false;
let squidOut = false;
if (traveled) {
  const scoreBefore = abyss.score;
  const wreck = await page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    const b = s.buildings.find((x) => x.type === 'SHIPWRECK');
    return b ? { x: b.x, y: b.y } : null;
  });
  if (wreck) {
    await movePlayer(wreck);
    await page.waitForTimeout(600);
    const s5 = await snap();
    wreckScored = s5.score - scoreBefore >= 75;
    squidOut = s5.entities.includes('VAMPIRE_SQUID');
  }
  log(`[5] 沉船触发: 金币${wreckScored ? '✅' : '❌'} 吸血鬼乌贼${squidOut ? '✅' : '❌'}`);
}

// ── 6. 星光鱼群潮：把 time 推到 2400 的倍数，等系统自己踩点 ──
let schoolSeen = false;
if (traveled) {
  await page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    s.time = Math.ceil((s.time + 2) / 2400) * 2400;
  });
  for (let i = 0; i < 40; i += 1) {
    const s = await snap();
    if (s.entities.filter((t) => t === 'STARLIGHT_FISH').length >= 1) { schoolSeen = true; break; }
    await page.waitForTimeout(50);
  }
}
log(`[6] 星光鱼群潮过境: ${schoolSeen ? '✅' : '❌'}`);
await page.screenshot({ path: 'scripts/pond-content-abyss.png' });

log('[7] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
await browser.close();

const ok = cardCount === 3 && hasWell && noWreck && abyssGate && wellScored && wellCooldown
  && traveled && wreckOnly && wreckScored && squidOut && schoolSeen && errors.length === 0;
log(ok ? '✅ 探针通过' : '❌ 探针失败');
process.exit(ok ? 0 : 1);
