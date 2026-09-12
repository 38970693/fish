// 装扮新标签页探针：真机验证「五官 / 身形」两个新 tab + 5 类新上架装扮真的画得出来。
//
// 背景：眉毛/嘴型/体型/尾巴/拖尾 5 类装扮一直没面板入口（体型/尾巴/拖尾渲染早已齐，
// 眉毛 SAD/CONFUSED/TIERED 与嘴型 FLAT/BEAK/CURVE 是本次补的渲染分支）。
// 单测（cosmetics-render.test.ts）守「指纹两两不同」，这里守「真机像素 + 交互链路」：
//   · 新 tab 的缩略图张张不同（toDataURL 去重）
//   · 鸟喙真的有橙色像素（#f59e0b 的喙是 FLAT/BEAK/CURVE 里唯一的大色块，采样最稳）
//   · 点击写回 gameState，带着新装扮进游戏后 state 一路都在
//
// 跑法（⚠️ 必须先清代理，否则 page.goto 到 localhost 会无限超时）：
//   $env:http_proxy=$null; $env:https_proxy=$null; $env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null
//   node scripts/probe-cosmetics-newtabs.mjs
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console.error: ' + m.text());
});

await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
await page.waitForSelector('button:has-text("开始游戏")', { timeout: 15000 });

log('[1] 在菜单里打开装扮面板');
await page.click('button:has-text("装扮我的鱼")');
await page.waitForSelector('[data-testid="cosmetics-preview"] canvas', { timeout: 8000 });

let failed = 0;
const check = (ok, label, detail) => {
  log(`   ${ok ? '✅' : '❌'} ${label}${detail ? ' —— ' + detail : ''}`);
  if (!ok) failed++;
};

/** 当前标签页里某类选项的缩略图像素指纹 */
const thumbPrints = (key) =>
  page.$$eval(`[data-cosmetic-key="${key}"] canvas`, (els) => els.map((c) => c.toDataURL()));

/** 某类第 value 个选项缩略图里「接近某颜色」的像素数 */
const thumbColorPixels = (key, value, r, g, b, tol = 28) =>
  page.$eval(`[data-cosmetic-key="${key}"][data-cosmetic-value="${value}"] canvas`, (c, ref) => {
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 30) continue;
      if (
        Math.abs(data[i] - ref.r) <= ref.tol &&
        Math.abs(data[i + 1] - ref.g) <= ref.tol &&
        Math.abs(data[i + 2] - ref.b) <= ref.tol
      ) n += 1;
    }
    return n;
  }, { r, g, b, tol });

/** 左侧大预览画布的平均色（只统计不透明像素） */
const samplePreview = () =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="cosmetics-preview"] canvas');
    if (!c) return null;
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 30) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
    }
    return n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), px: n } : null;
  });

const clickOption = async (key, value) => {
  await page.click(`[data-cosmetic-key="${key}"][data-cosmetic-value="${value}"]`);
  await page.waitForTimeout(180);
};

const cosmetics = () => page.evaluate(() => window.__FISH_DEBUG__.state().player.cosmetics);

const openTab = async (id) => {
  await page.click(`[data-tab="${id}"]`);
  await page.waitForTimeout(250);
};

/* ── A. 五官 tab：嘴型 + 眉毛 ── */
log('[A] 五官 tab（嘴型 6 + 眉毛 7）');
await openTab('face');
const mouths = await thumbPrints('mouthType');
check(mouths.length === 6, '嘴型有 6 个选项', `实到 ${mouths.length}`);
check(new Set(mouths).size === mouths.length, `嘴型 ${mouths.length} 张两两不同`, `distinct=${new Set(mouths).size}`);
const brows = await thumbPrints('eyebrowType');
check(brows.length === 7, '眉毛有 7 个选项', `实到 ${brows.length}`);
check(new Set(brows).size === brows.length, `眉毛 ${brows.length} 张两两不同`, `distinct=${new Set(brows).size}`);

// 鸟喙：橙色 #f59e0b 的喙是三个新嘴型里唯一的大色块，像素采样最稳
const beakOrange = await thumbColorPixels('mouthType', 'BEAK', 245, 158, 11);
check(beakOrange > 15, '鸟喙缩略图里有成片橙色喙像素', `${beakOrange}px`);
await page.screenshot({ path: 'scripts/cosmetics-tab-face.png' });

/* ── B. 点击写回 state + 大预览跟着变 ── */
log('[B] 选鸟喙 + 忧愁眉，写回 state 且预览变色');
const beforeBeak = await samplePreview();
await clickOption('mouthType', 'BEAK');
await clickOption('eyebrowType', 'SAD');
const cosB = await cosmetics();
check(cosB.mouthType === 'BEAK' && cosB.eyebrowType === 'SAD', '点击已写回 gameState', `mouth=${cosB.mouthType} brow=${cosB.eyebrowType}`);
const afterBeak = await samplePreview();
check(
  !!beforeBeak && !!afterBeak && afterBeak.r > beforeBeak.r + 6,
  '换上橙色鸟喙后大预览平均色 r 分量上升',
  `r: ${beforeBeak?.r} → ${afterBeak?.r}`
);
await page.screenshot({ path: 'scripts/cosmetics-beak-sad.png' });

/* ── C. 身形 tab：体型 + 尾巴 + 拖尾 ── */
log('[C] 身形 tab（体型 8 + 尾巴 9 + 拖尾 8）');
await openTab('body');
const bodies = await thumbPrints('bodyType');
check(bodies.length === 8, '体型有 8 个选项', `实到 ${bodies.length}`);
check(new Set(bodies).size === bodies.length, `体型 ${bodies.length} 张两两不同`, `distinct=${new Set(bodies).size}`);
const tails = await thumbPrints('tailType');
check(tails.length === 9, '尾巴有 9 个选项', `实到 ${tails.length}`);
check(new Set(tails).size === tails.length, `尾巴 ${tails.length} 张两两不同`, `distinct=${new Set(tails).size}`);
const trails = await thumbPrints('trailType');
check(trails.length === 8, '拖尾有 8 个选项', `实到 ${trails.length}`);
// NONE 是空尾迹，可能正好和其他某张撞不了 —— 它必然唯一（没 drawTrail 调用），直接要求全不同
check(new Set(trails).size === trails.length, `拖尾 ${trails.length} 张两两不同`, `distinct=${new Set(trails).size}`);
await page.screenshot({ path: 'scripts/cosmetics-tab-body.png' });

/* ── D. 一键穿上一整套：鳗鱼形 + 幽灵尾 + 彩虹拖尾 ── */
log('[D] 鳗鱼形 + 幽灵尾 + 彩虹拖尾');
await clickOption('bodyType', 'EEL');
await clickOption('tailType', 'GHOST');
await clickOption('trailType', 'RAINBOW');
const cosD = await cosmetics();
check(
  cosD.bodyType === 'EEL' && cosD.tailType === 'GHOST' && cosD.trailType === 'RAINBOW',
  '三项全部写回 gameState',
  `body=${cosD.bodyType} tail=${cosD.tailType} trail=${cosD.trailType}`
);
await page.screenshot({ path: 'scripts/cosmetics-eel-ghost-rainbow.png' });

/* ── E. 带着新装扮进游戏 ── */
log('[E] 关面板开局，新装扮跟进来');
await page.click('button:has-text("完成")');
await page.waitForTimeout(400);
check(!(await page.$('[data-testid="cosmetics-preview"]')), '点「完成」后面板已关闭');
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(1200);
const inGame = await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  return {
    status: s.status,
    mouth: s.player.cosmetics.mouthType,
    brow: s.player.cosmetics.eyebrowType,
    body: s.player.cosmetics.bodyType,
    tail: s.player.cosmetics.tailType,
    trail: s.player.cosmetics.trailType,
  };
});
check(inGame.status !== 'MENU', '已经离开菜单进入游戏', String(inGame.status));
check(
  inGame.mouth === 'BEAK' && inGame.body === 'EEL' && inGame.trail === 'RAINBOW',
  '新装扮五件套带进了游戏',
  JSON.stringify(inGame)
);
await page.screenshot({ path: 'scripts/cosmetics-ingame-newlooks.png' });

log('[F] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
log(failed === 0 ? '\n🎉 全部断言通过' : `\n💥 ${failed} 条断言失败`);

await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
