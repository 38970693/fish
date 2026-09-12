// 形状 × 装扮组合真机探针：AI 鱼出生自带随机装扮（randomizeCosmetics），
// 形状模板上线后「水母戴皇冠、蟹壳上裁花纹、电鳗再拉长」这些组合从未真机看过。
// 验收三件事：
//   ① 花纹/鳞片 clip 是否贴着形状轮廓（不出界、不悬空）
//   ② 配饰（皇冠/墨镜/花）按 radius 锚定的位置在非鱼形上是否说得过去
//   ③ bodyType 缩放叠加在形状上（EEL 鱼配 EEL 体型）是否夸张到穿帮
// 断言只保「无页面错误 + 全员存活」，视觉结论看截图人工判。
//
// 跑法（⚠️ 先清代理）：node scripts/probe-shapes-cosmetics.mjs
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const log = (...a) => console.log(...a);

const SHAPES = [
  'FISH', 'TURTLE', 'JELLY', 'SEAHORSE', 'CRAB', 'PUFFER', 'CEPHALOPOD',
  'OCTOPUS', 'EEL', 'RAY', 'BILLFISH', 'ANGLER', 'HAMMERHEAD', 'SEAL',
  'SHARK', 'ORCA', 'NARWHAL', 'MERMAID', 'KRAKEN', 'OARFISH',
];

/** 三套极端装扮：全都有花纹+鳞片+配饰，第二套拉长体型、第三套满配 */
const OUTFITS = [
  { name: '宫廷', cosmetics: { teeth: 'GOLD', skinColor: '#fbbf24', pattern: 'STRIPES', scaleType: 'CRYSTAL', accessory: 'CROWN', tailType: 'FAN', bodyType: 'DEFAULT', mouthType: 'CURVE', eyeType: 'ANIME', eyebrowType: 'THICK', trailType: 'RAINBOW' } },
  { name: '长条', cosmetics: { teeth: 'SHARP', skinColor: '#38bdf8', pattern: 'SPOTS', scaleType: 'GLOW', accessory: 'SUNGLASSES', tailType: 'FORKED', bodyType: 'EEL', mouthType: 'TRIANGLE', eyeType: 'MAD', eyebrowType: 'ANGRY', trailType: 'BUBBLES' } },
  { name: '满配', cosmetics: { teeth: 'VAMPIRE', skinColor: '#f472b6', pattern: 'HEART', scaleType: 'SHINY', accessory: 'FLOWER', tailType: 'RIBBON', bodyType: 'CHUNKY', mouthType: 'CIRCLE', eyeType: 'LOVE', eyebrowType: 'SAD', trailType: 'HEARTS' } },
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

for (let round = 0; round < OUTFITS.length; round++) {
  const outfit = OUTFITS[round];
  log(`[${outfit.name}] 全部 20 形状穿上：纹${outfit.cosmetics.pattern} 鳞${outfit.cosmetics.scaleType} 饰${outfit.cosmetics.accessory} 体型${outfit.cosmetics.bodyType}`);
  await page.evaluate(({ shapes, cosmetics }) => {
    const s = window.__FISH_DEBUG__.state();
    s.player.speed = 0; s.player.vx = 0; s.player.vy = 0;
    s.player.invulnerableTimer = 999999; s.player.biteCooldown = 999999;
    s.entities.length = 0;
    s.obstacles.length = 0; s.powerUps.length = 0; s.treasures.length = 0;
    s.hazards.length = 0; s.fountains.length = 0; s.labels.length = 0;
    const cols = 5, gapX = 280, gapY = 300;
    window.__SHAPE_PROBES__ = shapes.map((shape, i) => ({
      shape,
      x: s.player.x - ((Math.min(cols, shapes.length) - 1) * gapX) / 2 + (i % cols) * gapX,
      y: s.player.y - 430 + Math.floor(i / cols) * gapY,
    }));
    for (const p of window.__SHAPE_PROBES__) {
      s.entities.push({
        id: 'sc-' + p.shape,
        type: 'SHAPE_PROBE',
        x: p.x, y: p.y, vx: 0, vy: 0,
        radius: 58, angle: 0,
        health: 10, maxHealth: 10, speed: 0, level: 1,
        animOffset: 1, renderScale: 1,
        isIdle: false, lureActive: false, camoActive: false, ambushTimer: 0,
        mouthOpenValue: 0.4, semiGhostTimer: 0,
        cosmetics: JSON.parse(JSON.stringify(cosmetics)),
        config: {
          type: 'SHAPE_PROBE', name: p.shape, baseRadius: 58,
          color: '#38bdf8', shape: p.shape,
          behavior: 'PASSIVE', tier: 1, speed: 0, health: 10, damage: 0,
          weightValue: 1, special: 'NONE', description: p.shape,
        },
        moodId: 'CALM', moodTimer: 1e9,
      });
    }
  }, { shapes: SHAPES, cosmetics: outfit.cosmetics });
  await page.waitForTimeout(350);

  // 本轮只留本排鱼在取景内（20 条分 4 排 × 5 列），逐排截图
  for (let rowIdx = 0; rowIdx < 4; rowIdx++) {
    await page.evaluate(({ rowIdx }) => {
      const s = window.__FISH_DEBUG__.state();
      s.hazards.length = 0;
      for (let i = 0; i < window.__SHAPE_PROBES__.length; i++) {
        const e = s.entities.find((en) => en.id === 'sc-' + window.__SHAPE_PROBES__[i].shape);
        if (!e) continue;
        const inRow = Math.floor(i / 5) === rowIdx;
        e.x = inRow ? window.__SHAPE_PROBES__[i].x : 60000;
        e.y = inRow ? window.__SHAPE_PROBES__[i].y : 60000;
        if (inRow) { e.vx = 0; e.vy = 0; e.angle = 0; e.health = e.maxHealth; }
      }
      const mid = window.__SHAPE_PROBES__[Math.min(rowIdx * 5 + 2, window.__SHAPE_PROBES__.length - 1)];
      s.player.x = mid.x; s.player.y = mid.y + 300;
    }, { rowIdx });
    await page.waitForTimeout(240);
    await page.screenshot({ path: `scripts/shapes-cosmetics-r${round}-row${rowIdx}.png` });
  }
  const alive = await page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    return s.entities.filter((e) => String(e.id).startsWith('sc-')).length;
  });
  check(alive === SHAPES.length, `${outfit.name} 轮 20 条测试鱼全程存活`, `${alive}/20`);
}

log('[F] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
log(failed === 0 ? '\n🎉 全部断言通过' : `\n💥 ${failed} 条断言失败`);

await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
