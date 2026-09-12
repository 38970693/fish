// 生物形状真机探针：把全部 20 种形状的生物摆在玩家周围一排排截图，
// 验收「水母像水母、蟹像蟹」——指纹单测守「画得出区别」，这里守「长得像不像」。
//
// 手法：state() 是可写引用 → 清场后 push 20 条手工实体（config 只带渲染层要读的
// shape/color 等字段），分 3 排各 7/7/6 条；相机跟玩家走，所以鱼摆玩家上方；
// 每张截图前重钉位置 + 清 hazards（陨石会砸死测试鱼）+ 拉满血。
//
// 跑法（⚠️ 必须先清代理）：
//   $env:http_proxy=$null; $env:https_proxy=$null; $env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null
//   node scripts/probe-creature-shapes.mjs
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const log = (...a) => console.log(...a);

const SHAPES = [
  'FISH', 'TURTLE', 'JELLY', 'SEAHORSE', 'CRAB', 'PUFFER', 'CEPHALOPOD',
  'OCTOPUS', 'EEL', 'RAY', 'BILLFISH', 'ANGLER', 'HAMMERHEAD', 'SEAL',
  'SHARK', 'ORCA', 'NARWHAL', 'MERMAID', 'KRAKEN', 'OARFISH',
];

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console.error: ' + m.text());
});

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await page.waitForSelector('button:has-text("开始游戏")', { timeout: 15000 });
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(900);

let failed = 0;
const check = (ok, label, detail) => {
  log(`   ${ok ? '✅' : '❌'} ${label}${detail ? ' —— ' + detail : ''}`);
  if (!ok) failed++;
};

log('[1] 开局 + 清场 + 撒 20 条形状测试鱼');
await page.evaluate((shapes) => {
  const s = window.__FISH_DEBUG__.state();
  // 钉死玩家：不漂移、不被砸、不被吃
  s.player.speed = 0;
  s.player.vx = 0; s.player.vy = 0;
  s.player.invulnerableTimer = 999999;
  s.player.biteCooldown = 999999;
  // 清野场
  s.entities.length = 0;
  s.obstacles.length = 0;
  s.powerUps.length = 0;
  s.treasures.length = 0;
  s.hazards.length = 0;
  s.fountains.length = 0;
  s.labels.length = 0;
  // 撒测试鱼：3 排网格摆在玩家上方（相机跟玩家 → 鱼要在玩家周围取景内）
  const cols = 7, gapX = 205, gapY = 260;
  const baseX = s.player.x - ((Math.min(cols, shapes.length) - 1) * gapX) / 2;
  window.__SHAPE_PROBES__ = shapes.map((shape, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return {
      shape,
      x: baseX + col * gapX,
      y: s.player.y - 420 + row * gapY,
    };
  });
  for (const p of window.__SHAPE_PROBES__) {
    s.entities.push({
      id: 'shape-' + p.shape,
      type: 'SHAPE_PROBE',
      x: p.x, y: p.y, vx: 0, vy: 0,
      radius: 62, angle: 0,
      health: 10, maxHealth: 10, speed: 0, level: 1,
      animOffset: 1, renderScale: 1,
      isIdle: false, lureActive: false, camoActive: false, ambushTimer: 0,
      mouthOpenValue: 0.4, semiGhostTimer: 0,
      config: {
        type: 'SHAPE_PROBE', name: p.shape, baseRadius: 62,
        color: '#38bdf8', shape: p.shape,
        behavior: 'PASSIVE', tier: 1, speed: 0, health: 10, damage: 0,
        weightValue: 1, special: 'NONE',
        description: p.shape,
      },
      moodId: 'CALM', moodTimer: 1e9,
    });
  }
}, SHAPES);
await page.waitForTimeout(400);

/** 截图前重钉：AI/边界/陨石每帧都在折腾实体，拍前一瞬间摆正 + 满血 + 清灾 */
const pinAndCount = () =>
  page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    s.hazards.length = 0;
    let n = 0;
    for (const p of window.__SHAPE_PROBES__) {
      const e = s.entities.find((en) => en.id === 'shape-' + p.shape);
      if (!e) continue;
      e.x = p.x; e.y = p.y; e.vx = 0; e.vy = 0; e.angle = 0;
      e.health = e.maxHealth; e.speed = 0;
      n += 1;
    }
    return n;
  });

const rows = [
  { name: 'row1', from: 0, to: 7, file: 'scripts/shapes-row1.png' },
  { name: 'row2', from: 7, to: 14, file: 'scripts/shapes-row2.png' },
  { name: 'row3', from: 14, to: 20, file: 'scripts/shapes-row3.png' },
];

for (const row of rows) {
  log(`[${row.name}] ${SHAPES.slice(row.from, row.to).join(' · ')}`);
  const alive = await pinAndCount();
  check(alive === SHAPES.length, '20 条测试鱼全部存活', `${alive}/20`);
  // 只看本排：临时把其它排的鱼挪出取景（相机在玩家中心，y 方向排距 260 > 半屏 450?）
  // —— 相机视野高约 900/zoom。zoom 未知，稳妥做法：每排截图前把非本排的鱼挪到 +60000
  await page.evaluate((row) => {
    const s = window.__FISH_DEBUG__.state();
    for (const p of window.__SHAPE_PROBES__) {
      const e = s.entities.find((en) => en.id === 'shape-' + p.shape);
      if (!e) continue;
      const inRow = window.__SHAPE_PROBES__.indexOf(p) >= row.from && window.__SHAPE_PROBES__.indexOf(p) < row.to;
      if (!inRow) { e.x = 60000; e.y = 60000; }
      else { e.x = p.x; e.y = p.y; }
    }
    // 本排居中：把玩家瞬移到本排中央下方（相机跟玩家 → 排居中）
    const mid = window.__SHAPE_PROBES__[Math.floor((row.from + row.to - 1) / 2)];
    s.player.x = mid.x;
    s.player.y = mid.y + 0; // 玩家与同排重叠会挡鱼 —— 挪到排下方一点
    s.player.y = mid.y + 330;
  }, row);
  await page.waitForTimeout(260);
  const stillAlive = await pinAndCount();
  check(stillAlive === SHAPES.length, '截圖前再点一次名（防陨石/吞咬减员）', `${stillAlive}/20`);
  await page.screenshot({ path: row.file });
  log(`   📸 ${row.file}`);
}

/* ── 深海新物种单独验收：皇带鱼 / 吸血鬼乌贼 / 哥布林鲨 用真 CREATURES config 渲染 ── */
log('[N] 深海新物种（真实注册表 config）');
await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  s.entities.length = 0;
  const trio = ['OARFISH', 'VAMPIRE_SQUID', 'GOBLIN_SHARK'];
  window.__NEW_SPOTS__ = trio.map((type, i) => ({ type, x: s.player.x + (i - 1) * 460, y: s.player.y - 240 }));
  // 从生成池里真刷不出来就手搓 —— config 全字段抄注册表（探针内嵌最小版）
  const CONFIGS = {
    OARFISH: { color: '#cbd5e1', shape: 'OARFISH', baseRadius: 55, name: '皇带鱼', behavior: 'PASSIVE', tier: 3, speed: 0, health: 160, damage: 14, weightValue: 75, special: 'NONE', type: 'OARFISH', description: '龙宫使者' },
    VAMPIRE_SQUID: { color: '#9f1239', shape: 'CEPHALOPOD', baseRadius: 27, name: '吸血鬼乌贼', behavior: 'AMBUSH', tier: 2, speed: 0, health: 60, damage: 8, weightValue: 24, special: 'CAMO', type: 'VAMPIRE_SQUID', description: '深渊幽影' },
    GOBLIN_SHARK: { color: '#e8a0a0', shape: 'SHARK', baseRadius: 48, name: '哥布林鲨', behavior: 'AGGRESSIVE', tier: 3, speed: 0, health: 170, damage: 22, weightValue: 72, special: 'NONE', type: 'GOBLIN_SHARK', description: '活化石' },
  };
  for (const p of window.__NEW_SPOTS__) {
    s.entities.push({
      id: 'new-' + p.type,
      type: p.type,
      x: p.x, y: p.y, vx: 0, vy: 0,
      radius: CONFIGS[p.type].baseRadius, angle: 0,
      health: 100, maxHealth: 100, speed: 0, level: 1,
      animOffset: 1, renderScale: 1,
      isIdle: false, lureActive: false, camoActive: false, ambushTimer: 0,
      mouthOpenValue: 0.4, semiGhostTimer: 0,
      config: CONFIGS[p.type],
      moodId: 'CALM', moodTimer: 1e9,
    });
  }
});
await page.waitForTimeout(200);
await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  s.hazards.length = 0;
  for (const p of window.__NEW_SPOTS__) {
    const e = s.entities.find((en) => en.id === 'new-' + p.type);
    if (e) { e.x = p.x; e.y = p.y; e.vx = 0; e.vy = 0; e.angle = 0; e.health = e.maxHealth; }
  }
  const mid = window.__NEW_SPOTS__[1];
  s.player.x = mid.x;
  s.player.y = mid.y + 300;
});
await page.waitForTimeout(260);
await page.screenshot({ path: 'scripts/shapes-newspecies.png' });
log('   📸 scripts/shapes-newspecies.png');

log('[F] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
log(failed === 0 ? '\n🎉 全部断言通过' : `\n💥 ${failed} 条断言失败`);

await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
