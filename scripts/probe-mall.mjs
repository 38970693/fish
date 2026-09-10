/**
 * 商场提示气泡探针。
 *
 * 验证：游进商场交互圈后，「按 E 进入商场换装」画在**商场头顶**（b.prompt），
 *      不再占用 player.speechBubble（那个槽位战斗也在用，互相顶掉 —— 路线图遗留 bug）。
 *      顺带验证 speechBubble 渲染是否真的恢复了（v2 重构把它弄丢过，全库没有渲染方）。
 *
 * 用法：先起 dev server（vite --port 3000），再 node scripts/probe-mall.mjs
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
// 选双髻鲨：速度快，长途奔袭到商场省时间
await page.click('button:has-text("双髻鲨")');
await page.waitForTimeout(300);
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(600);

// 开无敌，专心赶路
await page.keyboard.press('g');

const hookReady = await page.evaluate(() => typeof window.__FISH_DEBUG__ === 'object');
if (!hookReady) {
  log('❌ 调试钩子缺失（只有 DEV 构建才有）');
  await browser.close();
  process.exit(1);
}

const readAll = () => page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  return {
    p: window.__FISH_DEBUG__.player(),
    status: s.status,
    // 建筑交互提示（本次修的就是它：从 player.speechBubble 挪到建筑头顶）
    prompts: s.buildings.map((b) => ({ type: b.type, x: b.x, y: b.y, prompt: b.prompt ?? null })),
    // 玩家身上的气泡（战斗/生态区在用的那个槽）
    playerBubble: s.player.speechBubble ?? null,
  };
});

let st = await readAll();
log(`[1] 出生点 (${st.p.x},${st.p.y}) 状态=${st.status}`);

// 找商场
const mall = st.prompts.find((b) => b.type === 'SHOP');
if (!mall) {
  log('❌ 没找到商场建筑');
  await browser.close();
  process.exit(1);
}
log(`[2] 商场在 (${mall.x},${mall.y})，开始赶路（长按加速）`);

// 朝商场游：世界方向≈屏幕方向（相机跟随玩家）。按住 Space 加速赶路。
await page.keyboard.down(' ');
let lastLog = { x: 0, y: 0 };
for (let i = 0; i < 300; i++) {
  st = await readAll();
  const dx = mall.x - st.p.x;
  const dy = mall.y - st.p.y;
  const d = Math.hypot(dx, dy);
  if (d < 200) break; // 进入 1.5 倍交互圈（radius 200 * 1.5 = 300，留余量）
  await page.mouse.move(W / 2 + (dx / d) * 380, H / 2 + (dy / d) * 380);
  await page.waitForTimeout(60);
  if (i % 20 === 0) {
    const moved = Math.hypot(st.p.x - lastLog.x, st.p.y - lastLog.y);
    log(`    i=${i} 玩家=(${st.p.x},${st.p.y}) 距商场=${Math.round(d)} 本段位移=${Math.round(moved)}px`);
    lastLog = { x: st.p.x, y: st.p.y };
  }
}
await page.keyboard.up(' ');

st = await readAll();
const dist = Math.hypot(mall.x - st.p.x, mall.y - st.p.y);
log(`[3] 到达：距商场 ${Math.round(dist)}px 状态=${st.status}`);
log(`    商场 prompt = ${JSON.stringify(st.prompts.find((b) => b.type === 'SHOP')?.prompt)}`);
log(`    玩家 speechBubble = ${JSON.stringify(st.playerBubble)}`);

const okPrompt = !!st.prompts.find((b) => b.type === 'SHOP')?.prompt?.text?.includes('按 E');
const okSlot = !(st.playerBubble?.text ?? '').includes('按 E');
log(`    -> 提示画在商场头顶: ${okPrompt ? '✅' : '❌'}`);
log(`    -> 不再占用玩家气泡槽: ${okSlot ? '✅' : '❌'}`);

// ── speechBubble 渲染验证 ──
// v2 重构把 speechBubble 的渲染弄丢过（全库没有绘制方，只写不画）。
// G 键开关无敌会写 player.speechBubble，气泡寿命 60 帧（1 秒）—— 按 G 后立刻截屏。
await page.keyboard.press('g'); // 关无敌 → 气泡「无敌模式 关」
await page.waitForTimeout(120);
st = await readAll();
const bubbleText = st.playerBubble?.text ?? '';
log(`[4] 按 G 后玩家气泡 = "${bubbleText}"（应含"无敌模式"）`);
await page.screenshot({ path: 'scripts/mall-probe-bubble.png' });
await page.waitForTimeout(1200); // 等气泡过期
st = await readAll();
const bubbleGone = !st.playerBubble || (st.playerBubble?.timer ?? 0) <= 0;
log(`    -> 1.2s 后气泡过期: ${bubbleGone ? '✅' : '⚠️ 仍在（timer=${st.playerBubble?.timer}）'}`);
await page.keyboard.press('g'); // 把无敌开回来，别让鱼裸奔

log('[5] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));

await browser.close();
const ok = okPrompt && okSlot && errors.length === 0 && bubbleText.includes('无敌模式');
log(ok ? '✅ 探针通过' : '❌ 探针失败');
process.exit(ok ? 0 : 1);
