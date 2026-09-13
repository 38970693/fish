/**
 * 「加速冲刺倍率提高一倍」的浏览器端证据探针。
 *
 * 背景：用户反馈「游动速度太慢了，可以把加速提高一倍」→ 只把**爆发段**倍率翻倍
 * （`BOOST_CONFIG.SPEED_MULTIPLIER` 2.2 → 4.4），常速（`player.speed`）与体力
 * （MAX_ENERGY / DRAIN_RATE）都刻意没动。
 *
 * 为什么单测不够：单测直接造一个 GameState 调 `playerControlSystem`，证明的是
 * 「函数照着常量算」；真实的游戏循环里，`playerControl` 后面还跟着
 * skills / concealment / ai / squad / **world**（边界+障碍+建筑）/ items / combat
 * 等一串系统，任何一个都可能动 `player.x/y`。所以必须回到浏览器里验证
 * 「按住空格，玩家**在世界上**确实跑这么快」。
 *
 * 判据（源码常量是唯一真值，本探针一个数字都不写死）：
 *   [1] 从 src/data/world.ts 的 BOOST_CONFIG 里解析出期望值
 *   [2] 实测「按住 Space 每帧位移 ÷ 松开 Space 每帧位移」== SPEED_MULTIPLIER
 *   [3] 该期望值必须 ≥ 4.4（用户诉求「提高一倍」= 原值 2.2 的两倍，这条是硬底线）
 *   [4] 位移速度（px/s）的比 ≈ 每帧速度的比（自洽，防「看起来快其实有一步被吞」）
 *   [5] 两轮速度方差都极小（没有忽快忽慢 / 没有 0 步帧）
 *   [6] 体力仍按 MAX_ENERGY / DRAIN_RATE 消耗、按 REGEN_RATE 回复
 *       → 满体力冲刺步数 == MAX_ENERGY / DRAIN_RATE（「冲刺更快」≠「能一直快」）
 *   [7] 全程没被边界夹（两轮终点离地图中心都还很远）
 *
 * 做法（确定性，不靠随机）：
 *   1. 清场：把障碍 / 鱼 / 危险物 / 道具 / 传送门 / 建筑全挪出画面
 *      （挪走而不是清空数组 —— 数量不变就不会触发补刷），全程保持 PLAYING
 *      （不能切 MENU，那会把 GameCanvas 整个卸载）
 *   2. 每轮开始把玩家按回地图中心 (3000,3000)、`angle=0`、鼠标摆到屏幕中心右侧
 *      → `targetAngle` 也是 0，当帧不转向，位移纯粹由速度决定
 *   3. 清零 `speedBoostTimer` / `lureActive`，排除道具加速与诱惑状态的额外位移
 *   4. 两轮采样：松手 90 帧 / 按住 90 帧；再单独「按住到体力耗光」量消耗速率，
 *      最后松手量回复速率
 *
 * ⚠️ 生态区加成（浅滩对 tier ≤ 1 的鱼 +20%）与 `stats.speedMult` 会**同时**乘在
 *    两轮上，比例里约掉 —— 所以不必切生态区，但探针会把绝对值打出来供肉眼核对。
 * ⚠️ `input.space` 只认 `keysRef.current.space`（App.tsx 里单独传的），
 *    鼠标左键是另一个参数（`isMouseDown`），不会误触发加速。
 *
 * 用法：先起 dev server（vite，端口 3000；钩子只在 DEV 构建才有），再
 *       node scripts/probe-boost-speed.mjs
 * 退出码：0 通过 / 1 未通过（可直接塞进 CI 或手动跑）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'http://localhost:3000/';
const W = 1280;
const H = 800;
const CENTER = { x: 3000, y: 3000 };
/** 每轮采样帧数：90 帧 @60fps = 1.5s；4.4 倍速下走 784px，离 2000px 的边界还很远 */
const PHASE_FRAMES = 90;
/** 「按住到耗光」上限：满体力理论 200 步，留 4.5 倍余量 */
const MAX_HOLD_FRAMES = 900;
/** 终点离地图中心超过这个距离就说明已经被边界夹过，数据不可信 */
const CLAMP_GUARD = 1900;
const log = (...a) => console.log(...a);

/* ── [1] 从源码解析期望值（唯一真值，探针不写死数字） ── */
const worldSrc = fs.readFileSync(path.join(ROOT, 'src/data/world.ts'), 'utf8');
const boostAt = worldSrc.indexOf('export const BOOST_CONFIG');
if (boostAt < 0) {
  log('❌ src/data/world.ts 里找不到 BOOST_CONFIG');
  process.exit(1);
}
const boostBlock = worldSrc.slice(boostAt, worldSrc.indexOf('};', boostAt)).replace(/\/\*[\s\S]*?\*\//g, '');
const pick = (key) => {
  const m = boostBlock.match(new RegExp(`\\b${key}:\\s*([\\d.]+)`));
  if (!m) {
    log(`❌ 解析不到 BOOST_CONFIG.${key}`);
    process.exit(1);
  }
  return Number(m[1]);
};
const EXPECT = {
  mult: pick('SPEED_MULTIPLIER'),
  maxEnergy: pick('MAX_ENERGY'),
  drain: pick('DRAIN_RATE'),
  regen: pick('REGEN_RATE'),
};
const MIN_MULT = 4.4; // 用户诉求「加速提高一倍」的底线：原 2.2 的两倍
log(`[0] 源码 BOOST_CONFIG：SPEED_MULTIPLIER=${EXPECT.mult} MAX_ENERGY=${EXPECT.maxEnergy} `
  + `DRAIN_RATE=${EXPECT.drain} REGEN_RATE=${EXPECT.regen}`);

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push('console.error: ' + m.text());
});

/* ── 0. 进游戏 ── */
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

/* ── 1. 清场 + 摆好鼠标 ── */
await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  s.obstacles.forEach((o) => { o.x += 60000; o.y += 60000; });
  s.entities.forEach((e) => { e.x += 60000; e.y += 60000; e.speed = 0; e.semiGhostTimer = 999999; });
  s.hazards.length = 0;
  s.powerUps.length = 0;
  s.treasures = [];
  if (Array.isArray(s.portals)) s.portals.forEach((o) => { o.x += 60000; o.y += 60000; });
  if (Array.isArray(s.buildings)) s.buildings.forEach((o) => { o.x += 60000; o.y += 60000; });
  // 焦点从按钮上挪开：不然按 Space 可能当成「点按钮」
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
});
const view = await page.evaluate(() => ({
  w: window.innerWidth,
  h: window.innerHeight,
  scrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
}));
log(`[1b] 视口 ${view.w}×${view.h}，页面可滚动=${view.scrollable}`);
// 鼠标摆到屏幕中心正右方：targetAngle = atan2(0, +) = 0，与 player.angle=0 一致 → 不转向
await page.mouse.move(Math.round(view.w / 2 + 400), Math.round(view.h / 2));

const resetPlayer = (energy) => page.evaluate((energy) => {
  const s = window.__FISH_DEBUG__.state();
  const p = s.player;
  p.x = 3000;
  p.y = 3000;
  p.angle = 0;
  p.vx = 0;
  p.vy = 0;
  p.speedBoostTimer = 0;
  p.lureActive = false;
  p.health = 1e9;
  p.maxHealth = 1e9;
  p.boost.current = energy;
  s.camera.x = p.x;
  s.camera.y = p.y;
  return {
    radius: p.radius,
    speed: p.speed,
    speedMult: p.stats.speedMult,
    biome: p.currentBiome,
    boostMax: p.boost.max,
  };
}, energy);

const sample = (frames, stopWhenEmpty = false) => page.evaluate(async ({ frames, stopWhenEmpty }) => {
  const out = [];
  for (let i = 0; i < frames; i++) {
    await new Promise((r) => requestAnimationFrame(() => r()));
    const st = window.__FISH_DEBUG__.state();
    const p = st.player;
    out.push({
      t: performance.now(),
      x: p.x,
      y: p.y,
      spd: Math.hypot(p.vx, p.vy),
      energy: p.boost.current,
      active: !!p.boost.active,
      status: st.status,
    });
    if (stopWhenEmpty && i > 0 && p.boost.current <= 0) break;
  }
  return out;
}, { frames, stopWhenEmpty });

/** 把一串采样压成指标：每帧速度、方差、位移、px/s、隐含步数、步率 */
const analyze = (samples) => {
  const spds = samples.map((s) => s.spd);
  const mean = spds.reduce((a, b) => a + b, 0) / spds.length;
  const min = Math.min(...spds);
  const max = Math.max(...spds);
  let dist = 0;
  for (let i = 1; i < samples.length; i++) {
    dist += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
  }
  const secs = (samples[samples.length - 1].t - samples[0].t) / 1000;
  const steps = mean > 0 ? dist / mean : 0;
  return {
    mean,
    min,
    max,
    spread: mean > 0 ? (max - min) / mean : 0,
    dist,
    secs,
    pxPerSec: secs > 0 ? dist / secs : 0,
    steps,
    stepRate: secs > 0 ? steps / secs : 0,
    energyDrop: samples[0].energy - samples[samples.length - 1].energy,
    energyRise: samples[samples.length - 1].energy - samples[0].energy,
    activeRatio: samples.filter((s) => s.active).length / samples.length,
    badStatus: samples.filter((s) => s.status !== 'PLAYING').length,
    endDist: Math.hypot(samples[samples.length - 1].x - CENTER.x, samples[samples.length - 1].y - CENTER.y),
  };
};

/* ── 2. A 轮：松开 Space（常速基线） ── */
await page.keyboard.up('Space');
const info = await resetPlayer(EXPECT.maxEnergy);
log(`[2] 玩家：r=${info.radius} 常速=${info.speed}px/帧 stats.speedMult=${info.speedMult} `
  + `生态区=${info.biome}（生态区/道具加成同时乘在两轮上，比例里约掉）`);
await page.waitForTimeout(60);
const baseSamples = await sample(PHASE_FRAMES);
const base = analyze(baseSamples);
log(`[3] A 轮 松开 Space：${baseSamples.length} 帧 / ${base.secs.toFixed(2)}s → `
  + `每帧 ${base.mean.toFixed(3)}px（min ${base.min.toFixed(3)} max ${base.max.toFixed(3)}）`
  + ` 位移 ${base.dist.toFixed(1)}px ≈ ${base.pxPerSec.toFixed(0)}px/s`);

/* ── 3. B 轮：按住 Space（冲刺） ── */
await page.keyboard.down('Space');
await resetPlayer(EXPECT.maxEnergy);
await page.waitForTimeout(60);
const boostSamples = await sample(PHASE_FRAMES);
const boost = analyze(boostSamples);
log(`[4] B 轮 按住 Space：${boostSamples.length} 帧 / ${boost.secs.toFixed(2)}s → `
  + `每帧 ${boost.mean.toFixed(3)}px（min ${boost.min.toFixed(3)} max ${boost.max.toFixed(3)}）`
  + ` 位移 ${boost.dist.toFixed(1)}px ≈ ${boost.pxPerSec.toFixed(0)}px/s`);

/* ── 4. C 轮：按住到体力耗光（量消耗速率 + 满体力续航） ── */
// ⚠️ 这里**不能**插 waitForTimeout：那几帧照样在扣体力，但扣在采样窗口之外，
//    于是「满体力续航」会少算几帧（实测少 5 步 → 整条判据误判）。
//    keydown 在 page.keyboard.down 里就已经派发完毕，本来也不需要再等。
await resetPlayer(EXPECT.maxEnergy);
const drainSamples = await sample(MAX_HOLD_FRAMES, true);
const drainPhase = analyze(drainSamples);
await page.keyboard.up('Space');
const drainPerStep = drainPhase.steps > 0 ? drainPhase.energyDrop / drainPhase.steps : 0;
log(`[5] C 轮 按住到耗光：${drainSamples.length} 帧，走 ${drainPhase.steps.toFixed(1)} 步 `
  + `（每帧 ${drainPhase.mean.toFixed(3)}px，spread ${(drainPhase.spread * 100).toFixed(2)}%），`
  + `体力 ${drainSamples[0].energy.toFixed(1)} → 0，消耗 ${drainPerStep.toFixed(3)}/步，`
  + `续航 ${(drainPhase.steps / 60).toFixed(2)}s（理论 ${(EXPECT.maxEnergy / EXPECT.drain / 60).toFixed(2)}s）`);

/* ── 5. D 轮：松手回体力量回复速率 ── */
const regenSamples = await sample(30);
const regenPhase = analyze(regenSamples);
const regenPerStep = regenPhase.steps > 0 ? regenPhase.energyRise / regenPhase.steps : 0;
log(`[6] D 轮 松手 ${regenSamples.length} 帧：回复 ${regenPerStep.toFixed(3)}/步（理论 ${EXPECT.regen}）`);

/* ── 6. 判定 ── */
const ratioStep = base.mean > 0 ? boost.mean / base.mean : 0;
const ratioSpeed = base.pxPerSec > 0 ? boost.pxPerSec / base.pxPerSec : 0;
const multErr = EXPECT.mult > 0 ? Math.abs(ratioStep - EXPECT.mult) / EXPECT.mult : 1;
const ratioGap = ratioStep > 0 ? Math.abs(ratioSpeed - ratioStep) / ratioStep : 1;
const fullBoostErr = Math.abs(drainPhase.steps - EXPECT.maxEnergy / EXPECT.drain);

log('[7] 结果：');
log(`   冲刺 / 常速（每帧速度比）  ${ratioStep.toFixed(4)}   ← 期望 ${EXPECT.mult}（差 ${(multErr * 100).toFixed(2)}%）`);
log(`   冲刺 / 常速（px/s 比）     ${ratioSpeed.toFixed(4)}   ← 与上一行差 ${(ratioGap * 100).toFixed(2)}%`);
log(`   上限校验                   期望倍率 ${EXPECT.mult} ${EXPECT.mult >= MIN_MULT ? '≥' : '<'} 底线 ${MIN_MULT}（原值 2.2 的两倍）`);
log(`   速度稳定性                 松手 spread ${(base.spread * 100).toFixed(2)}% / 按住 spread ${(boost.spread * 100).toFixed(2)}%`);
log(`   隐含步率                   松手 ${base.stepRate.toFixed(1)}Hz / 按住 ${boost.stepRate.toFixed(1)}Hz（理论 60Hz）`);
log(`   冲刺态标记                 松手 active=${base.activeRatio} / 按住 active=${boost.activeRatio}`);
log(`   体力                       消耗 ${drainPerStep.toFixed(3)}/步（期望 ${EXPECT.drain}） `
  + `回复 ${regenPerStep.toFixed(3)}/步（期望 ${EXPECT.regen}）`);
log(`   满体力续航                 ${drainPhase.steps.toFixed(1)} 步（期望 ${(EXPECT.maxEnergy / EXPECT.drain).toFixed(1)}，差 ${fullBoostErr.toFixed(2)}）`);
log(`   终点离中心                 松手 ${base.endDist.toFixed(0)}px / 按住 ${boost.endDist.toFixed(0)}px（<${CLAMP_GUARD} 表示没被边界夹）`);
log(`   非 PLAYING 采样           松手 ${base.badStatus} / 按住 ${boost.badStatus}`);
log(`[8] 页面错误: ${errors.length ? JSON.stringify(errors.slice(0, 6)) : '无'}`);

const checks = [
  ['按住空格真的提速到源码常量', multErr < 0.02],
  ['期望倍率达标（≥ 4.4，即比原来快一倍）', EXPECT.mult >= MIN_MULT],
  ['位移速度与每帧速度自洽', ratioGap < 0.03],
  ['冲刺确实明显快于常速（≥ 2×）', ratioStep >= 2],
  ['两轮速度都稳定（spread < 2%）', base.spread < 0.02 && boost.spread < 0.02],
  ['位移全部发生在冲刺态', base.activeRatio === 0 && boost.activeRatio === 1],
  ['体力仍按 DRAIN_RATE 消耗', Math.abs(drainPerStep - EXPECT.drain) < 0.05],
  ['体力仍按 REGEN_RATE 回复', Math.abs(regenPerStep - EXPECT.regen) < 0.05],
  ['满体力续航 == MAX_ENERGY / DRAIN_RATE（±4 步）', fullBoostErr <= 4],
  ['全程未被边界夹', base.endDist < CLAMP_GUARD && boost.endDist < CLAMP_GUARD],
  ['全程 PLAYING、无页面错误', base.badStatus === 0 && boost.badStatus === 0 && errors.length === 0],
];
const failed = checks.filter(([, ok]) => !ok);
log('[9] 判据：');
for (const [name, ok] of checks) log(`   ${ok ? '✅' : '❌'} ${name}`);

if (failed.length === 0) {
  log(`[10] ✅ 通过：按住空格每帧 ${boost.mean.toFixed(2)}px = 常速 ${base.mean.toFixed(2)}px × `
    + `${ratioStep.toFixed(2)}（源码常量 ${EXPECT.mult}），体力仍是 ${(drainPhase.steps / 60).toFixed(2)}s 用光`);
} else {
  log(`[10] ❌ 未通过：${failed.map(([n]) => n).join('、')}`);
}

await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
