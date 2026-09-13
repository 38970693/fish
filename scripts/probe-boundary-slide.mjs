/**
 * 地图边界「反弹」修复的浏览器端证据探针。
 *
 * 复现的坏行为：玩家贴着花瓣边界往外挤 → `clampToMap` 硬分支把它**往内多拉一截**
 * （`max(limit - buffer, limit*0.95)`，实测拉回 159px）再把朝向朝圆心压缩 30%，
 * 于是一帧甩头 1.257 rad（72°）＋被弹回边界内侧 —— 观感就是「碰到边缘会反弹」。
 * 修复后应当**只推回表面**，然后顺着边界滑走，单帧转角不超过 `SLIDE_TURN_PER_FRAME`。
 *
 * 做法（确定性，不靠随机）：
 *   1. 先把所有干扰（障碍 / 鱼 / 危险物 / 道具）挪出画面（保持 PLAYING，不能切 MENU ——
 *      那会把 GameCanvas 整个卸载）
 *   2. 把玩家丢到边界**外**，让世界自己把它压回约束面 —— 顺便量出真实的
 *      「约束面半径」，跟探针里按公式算的值交叉校验（防止公式漂移）
 *   3. 鼠标每帧指向**当前径向朝外**方向（＝持续往边界里挤），逐帧采样
 *
 * 判据：贴边帧数要多（说明真的顶在边上）、**最深入内侧的深度要小**（没有被反弹回去）、
 *       沿边路程要显著（说明在滑不是顶住）、单帧转角要小（没有甩头）。
 * ⚠️ 别用「本地角位移」当滑走判据 —— 花瓣边在 30° 处很陡（dr/dθ ≈ 1236px/rad），
 *    贴边滑 184px 也只折合 0.06rad，看着像没动。见文件末的注释。
 *
 * 用法：先起 dev server（vite，端口 3000；钩子只在 DEV 构建才有），再
 *       node scripts/probe-boundary-slide.mjs
 * 截图：scripts/boundary-slide.png / boundary-slide-end.png（描述性命名 = 功能证据，会进版本库）
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const W = 1280;
const H = 800;
const log = (...a) => console.log(...a);

// 与 src/data/world.ts 的 MAP_SHAPE_CONFIG / terrain.ts 的 getMapBoundaryRadius 一致。
// 下面第 [2] 步会拿「世界真实压出来的约束面」交叉校验，公式漂了会当场报错。
const CENTER = { x: 3000, y: 3000 };
const BASE_RADIUS = 2000;
const PETAL_VARIANCE = 1200;
const boundaryRadius = (a) => BASE_RADIUS + PETAL_VARIANCE * Math.abs(Math.sin(2 * a));

/** 30°：花瓣腰(0°)与尖(45°)之间，曲面是斜的，径向往外挤才会沿边滑走 */
const START_ANGLE = Math.PI / 6;
/** 先丢到边界外，让 clampToMap 自己压回表面 */
const SPAWN_OUTSIDE = 6000;
const SAMPLES = 90;
const FRAME_MS = 20;

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push('console.error: ' + m.text());
});

// ── 0. 进游戏 ──
await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('button:has-text("开始游戏")', { timeout: 20000 });

if (!(await page.evaluate(() => typeof window.__FISH_DEBUG__ === 'object'))) {
  log('❌ 调试钩子缺失（只有 DEV 构建才有 window.__FISH_DEBUG__）');
  await browser.close();
  process.exit(1);
}

await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(600);
await page.keyboard.press('g'); // 无敌，防止采样途中被野怪打断

let status = null;
for (let i = 0; i < 40; i++) {
  status = await page.evaluate(() => window.__FISH_DEBUG__.state().status);
  if (status === 'PLAYING') break;
  await page.waitForTimeout(200);
}
log(`[1] 状态 = ${status}`);
if (status !== 'PLAYING') {
  log('❌ 没能进入 PLAYING');
  await browser.close();
  process.exit(1);
}

// ── 1. 清场 + 把玩家丢到边界外 ──
const placed = await page.evaluate(({ ang, outside }) => {
  const s = window.__FISH_DEBUG__.state();
  const p = s.player;

  // 干扰源物理挪走（不是清空数组 —— 数量不变就不会触发补刷）
  s.obstacles.forEach((o) => { o.x += 60000; o.y += 60000; });
  s.entities.forEach((e) => { e.x += 60000; e.y += 60000; e.speed = 0; e.semiGhostTimer = 999999; });
  s.hazards.length = 0;
  s.powerUps.length = 0;
  s.treasures = [];

  p.x = 3000 + Math.cos(ang) * outside;
  p.y = 3000 + Math.sin(ang) * outside;
  p.angle = ang; // 朝外 —— 与「往边界外挤」一致
  p.vx = 0;
  p.vy = 0;
  p.health = 1e9;
  p.maxHealth = 1e9;

  s.camera.x = p.x;
  s.camera.y = p.y;
  return { radius: p.radius };
}, { ang: START_ANGLE, outside: SPAWN_OUTSIDE });

log(`[2] 玩家 r=${placed.radius}，先丢到 ${SPAWN_OUTSIDE}px 处（边界外），等世界把它压回约束面…`);
await page.waitForTimeout(300);

const contact = await page.evaluate(() => {
  const p = window.__FISH_DEBUG__.state().player;
  const dx = p.x - 3000;
  const dy = p.y - 3000;
  const d = Math.hypot(dx, dy);
  const la = Math.atan2(dy, dx);
  return { d, la, radius: p.radius };
});
const predicted = boundaryRadius(contact.la) - contact.radius;
const formulaDelta = contact.d - predicted;
log(`    实测约束面 = ${contact.d.toFixed(1)}px @ 本地角 ${(contact.la * 180 / Math.PI).toFixed(1)}°`);
log(`    公式预测   = ${predicted.toFixed(1)}px（差 ${formulaDelta.toFixed(1)}px）`);
if (Math.abs(formulaDelta) > 2) {
  log('❌ 公式与真实约束面对不上 —— MAP_SHAPE_CONFIG 可能改了，先修探针里的常量');
  await browser.close();
  process.exit(1);
}

// 鼠标按「当前径向朝外」摆放：playerControl 的 targetAngle = atan2(my-H/2, mx-W/2)，
// 所以屏幕向量方向 == 世界方向（相机不旋转），直接把鼠标放在屏幕中心 + 单位向量*300。
const aimOutward = () => page.evaluate(() => {
  const p = window.__FISH_DEBUG__.state().player;
  const a = Math.atan2(p.y - 3000, p.x - 3000);
  return { sx: 640 + Math.cos(a) * 300, sy: 400 + Math.sin(a) * 300 };
});

const sample = () => page.evaluate(() => {
  const st = window.__FISH_DEBUG__.state();
  const p = st.player;
  const dx = p.x - 3000;
  const dy = p.y - 3000;
  const d = Math.hypot(dx, dy);
  const la = Math.atan2(dy, dx);
  const limit = 2000 + 1200 * Math.abs(Math.sin(2 * la)) - p.radius;
  return { x: p.x, y: p.y, angle: p.angle, dist: d, local: la, gap: d - limit, status: st.status };
});

const croppedShot = async (path) => {
  const box = await page.evaluate(({ vw, vh }) => {
    const st = window.__FISH_DEBUG__.state();
    const p = st.player;
    const c = st.camera;
    return {
      psx: (p.x - c.x) * c.zoom + vw / 2,
      psy: (p.y - c.y) * c.zoom + vh / 2,
      zoom: c.zoom,
      angle: p.angle,
    };
  }, { vw: W, vh: H });
  const w = 560;
  const h = 420;
  const x = Math.max(0, Math.min(W - w, Math.round(box.psx - w / 2)));
  const y = Math.max(0, Math.min(H - h, Math.round(box.psy - h / 2)));
  log(`     截图 ${path}｜玩家屏幕=(${box.psx.toFixed(0)},${box.psy.toFixed(0)}) `
    + `朝向=${box.angle.toFixed(2)}rad zoom=${box.zoom.toFixed(2)}`);
  await page.screenshot({ path, clip: { x, y, width: w, height: h } });
};

// ── 2. 采样 ──
const start = await sample();
const track = [];
log(`[3] 开始采样：鼠标每帧指向径向朝外，共 ${SAMPLES} 帧`);
for (let i = 0; i < SAMPLES; i++) {
  const { sx, sy } = await aimOutward();
  await page.mouse.move(sx, sy);
  await page.waitForTimeout(FRAME_MS);

  const s = await sample();
  if (s.status !== 'PLAYING') {
    if (s.status === 'EVOLVING') {
      const opt = page.locator('button:has-text("右键技能")').first();
      if (await opt.count()) { await opt.click(); await page.waitForTimeout(250); continue; }
    }
    log(`   ⚠️ 状态变为 ${s.status}，提前结束采样`);
    break;
  }
  track.push(s);
  if (i === 25) await croppedShot('scripts/boundary-slide.png');
  if (i === 70) await croppedShot('scripts/boundary-slide-end.png');
}

// ── 3. 指标 ──
const contactFrames = track.filter((t) => Math.abs(t.gap) < 4).length;
let maxInward = 0;
for (const t of track) maxInward = Math.max(maxInward, -t.gap); // >0 = 被弹回边界内侧多深
let angularTravel = 0;
for (let i = 1; i < track.length; i++) {
  let d = track[i].local - track[i - 1].local;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  angularTravel += Math.abs(d);
}
let maxTurn = 0;
for (let i = 1; i < track.length; i++) {
  let d = track[i].angle - track[i - 1].angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  maxTurn = Math.max(maxTurn, Math.abs(d));
}
let path = 0;
for (let i = 1; i < track.length; i++) {
  path += Math.hypot(track[i].x - track[i - 1].x, track[i].y - track[i - 1].y);
}
const netRadial = Math.abs(track[track.length - 1].dist - start.dist);

log('[4] 结果：');
log(`   采样帧数        ${track.length}`);
log(`   贴边帧数        ${contactFrames}  （|离面距离| < 4px）`);
log(`   最深入内侧      ${maxInward.toFixed(1)}px   ← 关键：修复前被往里拉一大截（单测同场景 159.2px）`);
log(`   沿边路程        ${path.toFixed(1)}px  ← 关键：全程贴面还走了这么远 = 在滑，不是原地顶住`);
log(`   本地角位移      ${angularTravel.toFixed(2)}rad（边界在 30° 处很陡，dr/dθ≈1236px/rad，`
  + `${path.toFixed(0)}px 弧只折合这么多，正常；仅作参考，不作判据）`);
log(`   单帧最大转角    ${maxTurn.toFixed(3)}rad  ← 关键：修复前 1.257rad（72° 甩头）`);
log(`   径向净变化      ${netRadial.toFixed(1)}px（贴着同一条花瓣边滑，径向随边界起伏，属正常）`);
log('[5] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 6)) : '无'));

const pass =
  track.length >= 60 &&
  contactFrames >= 50 &&
  maxInward < 12 &&
  path >= 60 &&
  maxTurn <= 0.85;
if (pass) {
  log(`[6] ✅ 通过：贴边 ${contactFrames} 帧、最深入内侧仅 ${maxInward.toFixed(1)}px、`
    + `沿边滑走 ${path.toFixed(1)}px、单帧转角 ≤ ${maxTurn.toFixed(3)}rad（没反弹也没甩头）`);
} else {
  log(`[6] ❌ 未通过：贴边 ${contactFrames} 帧 / 最深入内侧 ${maxInward.toFixed(1)}px / `
    + `沿边路程 ${path.toFixed(1)}px / 单帧最大转角 ${maxTurn.toFixed(3)}rad`);
}

await browser.close();
process.exit(pass ? 0 : 1);
