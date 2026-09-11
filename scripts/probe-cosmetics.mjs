// 装扮预览探针：真机验证「每个选项都把穿着它的鱼画出来了」+「左侧大预览会跟着变」
//
// 为什么值得单独测：
//   加预览之前，面板摆了 10 个花纹按钮、drawPattern 只实现了 3 个，
//   剩下 7 个点了没反应 —— 而**单测和 e2e 都发现不了**，因为按钮、状态、点击全是对的，
//   错的只是「画不出来」。所以这里必须真的去比较**画布像素**：
//     · 同一类别的选项缩略图，两两必须不一样（toDataURL 去重）
//     · 左侧大预览在换色之后，平均色必须真的变了（getImageData 采样）
//
// 跑法（⚠️ 必须先清代理，否则 page.goto 到 localhost 会无限超时）：
//   $env:http_proxy=$null; $env:https_proxy=$null; $env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null
//   node scripts/probe-cosmetics.mjs
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

// ⚠️ 必须从**菜单**进面板：一点「开始游戏」菜单就整个卸载掉，
//    「装扮我的鱼」按钮也会跟着消失（第一版就是这么挂的）
log('[1] 在菜单里打开装扮面板');
await page.click('button:has-text("装扮我的鱼")');
await page.waitForSelector('[data-testid="cosmetics-preview"] canvas', { timeout: 8000 });

let failed = 0;
const check = (ok, label, detail) => {
  log(`   ${ok ? '✅' : '❌'} ${label}${detail ? ' —— ' + detail : ''}`);
  if (!ok) failed++;
};

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

/** 当前标签页里某类选项的缩略图像素指纹 */
const thumbPrints = (key) =>
  page.$$eval(`[data-cosmetic-key="${key}"] canvas`, (els) => els.map((c) => c.toDataURL()));

const clickOption = async (key, value) => {
  await page.click(`[data-cosmetic-key="${key}"][data-cosmetic-value="${value}"]`);
  await page.waitForTimeout(180);
};

const cosmetics = () => page.evaluate(() => window.__FISH_DEBUG__.state().player.cosmetics);

/* ── A. 大预览真的在画 ── */
log('[A] 左侧大预览');
await page.waitForTimeout(300); // 给动画预览留出首帧
const base = await samplePreview();
log(`   默认装扮平均色 = ${JSON.stringify(base)}`);
check(!!base && base.px > 500, '预览画布上真的画了鱼（不透明像素够多）', base ? `${base.px} px` : 'null');

/* ── B. 换色 → 大预览跟着变（像素级） ── */
log('[B] 换皮肤颜色，大预览必须跟着变');
await clickOption('skinColor', '#22c55e');
const green = await samplePreview();
const cGreen = await cosmetics();
log(`   选绿(#22c55e) → 平均色 ${JSON.stringify(green)}, state.skinColor=${cGreen.skinColor}`);
check(cGreen.skinColor === '#22c55e', '点击已写回 gameState', String(cGreen.skinColor));
check(!!green && green.g > green.r, '预览变绿了（g > r）', green ? `r=${green.r} g=${green.g}` : 'null');

await clickOption('skinColor', '#ef4444');
const red = await samplePreview();
log(`   选红(#ef4444) → 平均色 ${JSON.stringify(red)}`);
check(!!red && red.r > red.g && red.r > red.b, '预览变红了（r > g 且 r > b）', red ? `r=${red.r} g=${red.g} b=${red.b}` : 'null');
check(!!green && !!red && Math.abs(green.r - red.r) > 15, '红绿两次的平均色差异明显（不是没重绘）');

await page.screenshot({ path: 'scripts/cosmetics-mirror.png' });

/* ── C. 每类选项的缩略图必须两两不同 ── */
log('[C] 每个选项的缩略图必须张张不同（这是「选了个寂寞」的唯一有效检测）');
await page.click('[data-tab="color"]');
await page.waitForTimeout(200);
const teeth = await thumbPrints('teeth');
check(new Set(teeth).size === teeth.length, `牙齿 ${teeth.length} 张两两不同`, `distinct=${new Set(teeth).size}`);
check(teeth.length === 8, '牙齿有 8 个选项', `实到 ${teeth.length}`);

const skin = await thumbPrints('skinColor');
// DEFAULT（本鱼本色）可能正好等于调色板里的某一种，所以允许少 1 张
check(new Set(skin).size >= skin.length - 1, `皮肤 ${skin.length} 张基本两两不同`, `distinct=${new Set(skin).size}`);
await page.screenshot({ path: 'scripts/cosmetics-tab-color.png' });

await page.click('[data-tab="pattern"]');
await page.waitForTimeout(200);
const pattern = await thumbPrints('pattern');
const scale = await thumbPrints('scaleType');
log(`   花纹 ${pattern.length} 张 / 鳞片 ${scale.length} 张`);
check(pattern.length === 10, '花纹有 10 个选项', `实到 ${pattern.length}`);
check(new Set(pattern).size === pattern.length, `花纹 ${pattern.length} 张两两不同`, `distinct=${new Set(pattern).size}`);
check(scale.length === 7, '鳞片有 7 个选项', `实到 ${scale.length}`);
check(new Set(scale).size === scale.length, `鳞片 ${scale.length} 张两两不同`, `distinct=${new Set(scale).size}`);
await page.screenshot({ path: 'scripts/cosmetics-tab-pattern.png' });

await page.click('[data-tab="accessory"]');
await page.waitForTimeout(200);
const acc = await thumbPrints('accessory');
check(acc.length === 8, '配饰有 8 个选项', `实到 ${acc.length}`);
check(new Set(acc).size === acc.length, `配饰 ${acc.length} 张两两不同`, `distinct=${new Set(acc).size}`);
await page.screenshot({ path: 'scripts/cosmetics-tab-accessory.png' });

await page.click('[data-tab="eyes"]');
await page.waitForTimeout(200);
const eyes = await thumbPrints('eyeType');
check(eyes.length === 8, '眼睛有 8 个选项', `实到 ${eyes.length}`);
check(new Set(eyes).size === eyes.length, `眼睛 ${eyes.length} 张两两不同`, `distinct=${new Set(eyes).size}`);
await page.screenshot({ path: 'scripts/cosmetics-tab-eyes.png' });

await page.click('[data-tab="ai-presets"]');
await page.waitForTimeout(300);
const presets = await thumbPrints('preset');
check(presets.length === 8, 'AI 预设 8 套', `实到 ${presets.length}`);
check(new Set(presets).size === presets.length, `AI 预设 ${presets.length} 张两两不同`, `distinct=${new Set(presets).size}`);
check(!!(await page.$('[data-testid="cosmetics-preview"] canvas')), '切到 AI 预设后大预览仍在');
await page.screenshot({ path: 'scripts/cosmetics-tab-presets.png' });

/* ── D. 选中态与关闭 ── */
log('[D] 选中态高亮 + 完成关闭');
await clickOption('preset', '👑 国王');
const kingCos = await cosmetics();
log(`   应用「国王」预设 → accessory=${kingCos.accessory} skinColor=${kingCos.skinColor}`);
check(kingCos.accessory === 'CROWN', '整套预设已写回 state', String(kingCos.accessory));

await page.click('button:has-text("完成")');
await page.waitForTimeout(400);
check(!(await page.$('[data-testid="cosmetics-preview"]')), '点「完成」后面板已关闭');
check(!!(await page.$('button:has-text("装扮我的鱼")')), '回到菜单，按钮还在');

/* ── E. 菜单里改的装扮要带进游戏 ── */
log('[E] 带着新装扮开局');
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(1000);
const inGame = await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  return { status: s.status, type: s.player.type, accessory: s.player.cosmetics.accessory, skin: s.player.cosmetics.skinColor, time: s.time };
});
log(`   status=${inGame.status} fish=${inGame.type} accessory=${inGame.accessory} skin=${inGame.skin}`);
check(inGame.status !== 'MENU', '已经离开菜单进入游戏', String(inGame.status));
check(!!inGame.type, '玩家鱼种有值（预览靠它，不能是 undefined）', String(inGame.type));
check(inGame.accessory === 'CROWN', '菜单里选的装扮被带进了游戏', String(inGame.accessory));
await page.screenshot({ path: 'scripts/cosmetics-ingame.png' });

log('[F] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
log(failed === 0 ? '\n🎉 全部断言通过' : `\n💥 ${failed} 条断言失败`);

await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
