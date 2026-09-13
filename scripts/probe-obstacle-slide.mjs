/**
 * 障碍物「顿挫」修复的浏览器端证据探针。
 *
 * 复现的坏行为：目标在岩石另一侧时，实体朝里推进 → 被推回表面 → 顶死在石头上，
 * 位置一动不动、只有尾巴在摆 —— 看着就是「撞上去顿挫」。
 * 修复后应当**顺着岩石边缘滑走**（切向持续位移），而不是原地进退。
 *
 * 做法（确定性，不靠随机）：
 *   1. 只留一块最大的岩石当靶子，其它障碍 / 鱼 / 危险物全部挪出画面（保持 PLAYING，
 *      不能切 MENU —— 那会把 GameCanvas 整个卸载）
 *   2. 把玩家贴在岩石左侧表面、朝向朝右，鼠标一直指向岩石圆心（＝一直朝石头里挤）
 *   3. 逐帧采样：切向位移（Δy，切向就是竖直方向）、贴面帧数、径向漂移
 *
 * 判据：贴面帧数要多（说明真的顶在石头上），同时切向位移要显著（说明在滑、没冻住）。
 *
 * 用法：先起 dev server（vite，端口 3000；钩子只在 DEV 构建才有），再
 *       node scripts/probe-obstacle-slide.mjs
 * 截图：scripts/obstacle-slide.png（描述性命名 = 功能证据，会进版本库）
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const W = 1280;
const H = 800;
const log = (...a) => console.log(...a);

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

// 选个体型小的，撞石头时几何更干净（可选步骤，选不到就直接开始）
const pick = page.locator('button:has-text("双髻鲨")');
if (await pick.count()) {
  await pick.first().click();
  await page.waitForTimeout(250);
}
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(600);
await page.keyboard.press('g'); // 无敌，防止采样途中被野怪打断

// 等 PLAYING
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

// ── 1. 布置场景：一块岩石 + 贴面的玩家 ──
const setup = await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  const p = s.player;
  const rocks = s.obstacles.filter((o) => o.type === 'ROCK').sort((a, b) => b.radius - a.radius);
  if (!rocks.length) return { ok: false, why: '本局没有 ROCK 障碍物' };
  const rock = rocks[0];

  // 干扰源物理挪走（不是清空数组 —— 数量不变就不会触发补刷）
  s.obstacles.forEach((o) => { if (o.id !== rock.id) { o.x += 60000; o.y += 60000; } });
  s.entities.forEach((e) => { e.x += 60000; e.y += 60000; e.speed = 0; e.semiGhostTimer = 999999; });
  s.hazards.length = 0;
  s.powerUps.length = 0;
  s.treasures = [];

  // 玩家贴在岩石左侧表面，朝向朝右（正对石头）
  p.x = rock.x - (rock.radius + p.radius + 2);
  p.y = rock.y;
  p.angle = 0;
  p.vx = 0;
  p.vy = 0;
  p.health = 1e9;
  p.maxHealth = 1e9;

  // 相机吸到玩家身上，屏幕换算才稳
  s.camera.x = p.x;
  s.camera.y = p.y;

  window.__SLIDE_ROCK__ = { id: rock.id, x: rock.x, y: rock.y, radius: rock.radius };
  return {
    ok: true,
    rock: { x: Math.round(rock.x), y: Math.round(rock.y), radius: Math.round(rock.radius) },
    playerRadius: p.radius,
    need: rock.radius + p.radius,
  };
});

if (!setup.ok) {
  log(`❌ 布置失败：${setup.why}`);
  await browser.close();
  process.exit(1);
}
log(`[2] 靶子岩石 r=${setup.rock.radius} @ (${setup.rock.x}, ${setup.rock.y})，`
  + `玩家 r=${setup.playerRadius}，贴合距离应为 ${setup.need.toFixed(1)}`);

// 鼠标指到岩石圆心的屏幕位置（＝一直往石头里挤）
const aimToRock = () => page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  const r = window.__SLIDE_ROCK__;
  const c = s.camera;
  return {
    sx: (r.x - c.x) * c.zoom + 640,
    sy: (r.y - c.y) * c.zoom + 400,
  };
});

const sample = () => page.evaluate(() => {
  const st = window.__FISH_DEBUG__.state();
  const p = st.player;
  const r = window.__SLIDE_ROCK__;
  const d = Math.hypot(p.x - r.x, p.y - r.y);
  let nearest = Infinity;
  for (const e of st.entities) {
    const de = Math.hypot(e.x - p.x, e.y - p.y);
    if (de < nearest) nearest = de;
  }
  return {
    x: p.x, y: p.y, angle: p.angle,
    gap: d - (r.radius + p.radius),   // 0 = 正好贴面，<0 = 嵌进去
    status: st.status,
    nearest,
  };
});

// 围绕「玩家 + 岩石」裁一张近景：全屏图里玩家被压在灰岩上同色糊住，看不出在贴面
const croppedShot = async (path) => {
  const box = await page.evaluate(({ vw, vh }) => {
    const st = window.__FISH_DEBUG__.state();
    const p = st.player;
    const r = window.__SLIDE_ROCK__;
    const c = st.camera;
    return {
      psx: (p.x - c.x) * c.zoom + vw / 2,
      psy: (p.y - c.y) * c.zoom + vh / 2,
      rsx: (r.x - c.x) * c.zoom + vw / 2,
      rsy: (r.y - c.y) * c.zoom + vh / 2,
      zoom: c.zoom,
      angle: p.angle,
      x: p.x,
      y: p.y,
    };
  }, { vw: W, vh: H });
  const w = 520;
  const h = 400;
  const x = Math.max(0, Math.min(W - w, Math.round((box.psx + box.rsx) / 2 - w / 2)));
  const y = Math.max(0, Math.min(H - h, Math.round((box.psy + box.rsy) / 2 - h / 2)));
  log(`     截图 ${path}｜玩家屏幕=(${box.psx.toFixed(0)},${box.psy.toFixed(0)}) `
    + `世界=(${box.x.toFixed(0)},${box.y.toFixed(0)}) 朝向=${box.angle.toFixed(2)}rad`);
  await page.screenshot({ path, clip: { x, y, width: w, height: h } });
};

const start = await sample();
const track = [];
log('[3] 开始采样：鼠标持续指向岩石圆心，共 90 帧');
for (let i = 0; i < 90; i++) {
  const { sx, sy } = await aimToRock();
  await page.mouse.move(sx, sy);
  await page.waitForTimeout(33);

  const s = await sample();
  if (s.status !== 'PLAYING') {
    // 进化遮罩会暂停世界 —— 自动点掉，别让探针卡死
    if (s.status === 'EVOLVING') {
      const opt = page.locator('button:has-text("右键技能")').first();
      if (await opt.count()) { await opt.click(); await page.waitForTimeout(250); continue; }
    }
    log(`   ⚠️ 状态变为 ${s.status}，提前结束采样`);
    break;
  }
  track.push(s);
  // 弧上前 / 后两个位置各拍一张 —— 同一块岩石、不同接触点 = 「在滑走」的可视证据
  if (i === 30) await croppedShot('scripts/obstacle-slide.png');
  if (i === 70) await croppedShot('scripts/obstacle-slide-end.png');
}

// ── 2. 指标 ──
const last = track[track.length - 1];
const contactFrames = track.filter((t) => Math.abs(t.gap) < 4).length;
const tangential = Math.abs(last.y - start.y);
const radialDrift = Math.abs(last.x - start.x);
const minGap = Math.min(...track.map((t) => t.gap));
const minNearest = Math.min(...track.map((t) => t.nearest));
let path = 0;
for (let i = 1; i < track.length; i++) {
  path += Math.hypot(track[i].x - track[i - 1].x, track[i].y - track[i - 1].y);
}

log('[4] 结果：');
log(`   采样帧数        ${track.length}`);
log(`   贴面帧数        ${contactFrames}  （|间隙| < 4px）`);
log(`   最小间隙        ${minGap.toFixed(2)}px  （<0 表示嵌进去了，正常会有轻微穿透后推回）`);
log(`   切向位移 Δy     ${tangential.toFixed(1)}px   ← 关键：>0 且显著 = 在滑，不是冻住`);
log(`   径向位移 Δx     ${radialDrift.toFixed(1)}px`);
log(`   累计路程        ${path.toFixed(1)}px`);
log(`   最近其它实体    ${minNearest === Infinity ? 'n/a' : minNearest.toFixed(0) + 'px'}`);
log('[5] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 6)) : '无'));

const pass = contactFrames >= 20 && tangential >= 30 && path >= 60;
if (pass) {
  log(`[6] ✅ 通过：顶在岩石上 ${contactFrames} 帧，切向滑走 ${tangential.toFixed(1)}px（未原地顿挫）`);
} else {
  log(`[6] ❌ 未通过：贴面 ${contactFrames} 帧 / 切向 ${tangential.toFixed(1)}px / 路程 ${path.toFixed(1)}px`);
}

await browser.close();
process.exit(pass ? 0 : 1);
