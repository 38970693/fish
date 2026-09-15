/**
 * 性能基线探针 —— 「有点卡顿」这句话必须先变成数字，才谈得上优化。
 *
 * ─────────────────────────────────────────────────────────────
 * 为什么需要它（而不是「凭感觉优化」）
 * ─────────────────────────────────────────────────────────────
 * 一帧 = **逻辑**（systems/index.ts 里 13 个系统）+ **渲染**（GameCanvas 的一个
 * rAF 回调）+ 浏览器合成。三者混在一个数字里，看到「帧耗时 12ms」根本不知道该动哪边，
 * 所以本探针把三者**分开量**：
 *
 *   [A] 逻辑耗时    →  __FISH_DEBUG__.profile(n)：同步连跑 n 步，按系统拆开
 *   [B] 渲染帧耗时  →  rAF 间隔的 p50/p95/p99/max（**必须关 vsync**，见下）
 *   [C] 绘制调用数  →  直接给 CanvasRenderingContext2D 打点，按渲染帧归一化
 *   [D] 堆抖动      →  每帧采 usedJSHeapSize，锯齿的锯齿高/落差 ≈ 分配速率与 GC 频次
 *
 * ─────────────────────────────────────────────────────────────
 * 三个必须守住的测量纪律（都是踩过的坑）
 * ─────────────────────────────────────────────────────────────
 * ① **必须关 vsync**：开着 vsync 时只要一帧干得完（<16.67ms），帧耗时恒等于 16.67ms，
 *    改造前后一模一样 —— 数字看着没问题，其实把差异全吃掉了。所以加
 *    `--disable-frame-rate-limit --disable-gpu-vsync`，让 rAF 跑满。
 *    代价是绝对帧率不代表真机 → 结论只看**同场景的前后相对变化**，不看绝对值。
 *
 * ② **打点必须在独立的窗口里做（[C] 单独一个阶段，最后跑）**。第一版把打点装在
 *    `addInitScript` 里，于是「量帧耗时」的那几轮也被包了一层代理函数 —— 帧耗时被
 *    人为抬高，而且下面第 ③ 条让阴影根本没画出来，两个错误方向相反、互相掩盖。
 *
 * ③ **shadowBlur 是状态不是调用，且必须透传给原生 setter**。第一版自己存了个变量当
 *    `shadowBlur`，结果：原生阴影再也没被打开过（canvas 变便宜了），而且 `save/restore`
 *    不会还原我那个变量 —— 一次 `shadowBlur = 30` 之后，后面**每一笔** fill 都被记成
 *    「带阴影」，2292 次/帧这个数是假的。现在改成：setter 仍调用原生 setter，
 *    读的时候也从原生读，并按实例维护 save/restore 栈。
 *
 * ─────────────────────────────────────────────────────────────
 * 两个压力场景（固定，可复现）
 * ─────────────────────────────────────────────────────────────
 * 默认世界是「摊开的」：障碍物散在 6000×6000 的图里、鱼也散着，屏幕上其实没几个东西 ——
 * 用它测性能等于什么都没测。所以先把世界**攒起来**（只改位置和数量，不改系统行为）：
 *
 *   场景 A「cluster」：玩家在地图中心，障碍物铺 300px 网格、鱼排 120px 网格，
 *                      400 颗粒子 + 12 条标签 + 宝藏/道具/建筑全推进视野。
 *                      → 压 AI 邻近查询 + 障碍物推挤 + 实体渲染。
 *   场景 B「edge」   ：同一堆东西整体搬到花瓣边界上（玩家贴边）。
 *                      → 额外把**花瓣边界**拉进画面。它是 5 层 × 126 段的宽描边路径、
 *                        每帧重画一次，只有贴边才看得见它的开销。
 *
 * 场景由同一段代码生成，唯一变量是中心点，所以 A / B 的 workload 可比。
 * 另外进游戏后先 `profile(2400)` **快进 ~40 秒**，把刷怪池填满到上限 ——
 * 否则两个场景的实体数不一样（实测 47 vs 180），前后对比直接失效。
 *
 * ─────────────────────────────────────────────────────────────
 * 用法
 * ─────────────────────────────────────────────────────────────
 *   node scripts/probe-perf.mjs <label> [baselineLabel]
 *        # label 例：baseline / quadtree / dc；baselineLabel 缺省 'baseline'
 *   → 打印表格，快照写进 scripts/perf-<label>.json
 *   → 若 scripts/perf-<baselineLabel>.json 已存在且 label ≠ baselineLabel，自动打对比表
 *     （含 workload 一致性校验：实体数/障碍数对不上就标「不可比」）
 *
 *   ⚠️ 对照基线**必须**指明 epoch：实体上限 180 → 300 之后旧的 perf-baseline.json 会被
 *      判「不可比」（实体数 300≠180），此时用 `probe-perf.mjs fq04 g0-baseline`
 *      直接对 perf-g0-baseline.json，别再手动改文件名。
 *
 * 前置：dev server 在 3000 端口（性能钩子只在 DEV 构建里），
 *       且必须先清掉 http_proxy / https_proxy，否则 Chromium 连 localhost 都会超时。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'http://localhost:3000/';
const LABEL = process.argv[2] ?? 'run';
// 对照基线可换（第 2 个参数）：实体上限提到 300 之后，180 实体时代的 perf-baseline.json
// 会因为 workload 不一致被标「不可比」—— 与其每次手动改名，不如直接点名基线。
const BASE_LABEL = process.argv[3] ?? 'baseline';
const OUT = path.join(ROOT, 'scripts', `perf-${LABEL}.json`);
const BASE = path.join(ROOT, 'scripts', `perf-${BASE_LABEL}.json`);

const W = 1280;
const H = 800;
const ROUNDS = 3;
const FRAMES = 180;
const PROFILE_STEPS = 180;
/** 进游戏后快进的帧数：约 40 秒游戏时间，足够把刷怪池填满到 MAX_ENTITIES */
const WARMUP_STEPS = 2400;
/** 全局随机性用一个固定种子铺底（探针自身不掷骰子，但世界里的 AI 会） */
const SCENES = [
  // 全部塞进 AI 活跃半径内 + 全部在屏幕上：压 AI 邻近查询 + 障碍物推挤 + 实体渲染（最坏情况）
  ['cluster', { cx: 3000, cy: 3000 }],
  // 同一堆东西搬到花瓣边界上：额外把「5 层 × 126 段」的花瓣边界拉进画面
  ['edge', { cx: 3000, cy: 4900 }],
  // 同样多的物件，但玩家站到 1100px 外：绝大多数在屏幕外 → 量「视口裁剪」的收益。
  // 物件离玩家 < 2600（AI 活跃半径），所以 AI 的工作量不减，只有渲染在省。
  ['far', { cx: 3000, cy: 3000, px: 3000, py: 1900 }],
];

const log = (...a) => console.log(...a);

/* ══════════════ 默认世界的「攒堆」脚本（在页面里执行，必须自包含） ══════════════ */
const buildScene = ({ cx, cy, px = cx, py = cy }) => {
  const D = window.__FISH_DEBUG__;
  const s = D.state();
  const p = s.player;

  // 玩家与「物件堆」的中心可以分开（far 场景用）：玩家在 px,py，物件堆在 cx,cy。
  // 这样 workload 的**组成**完全一样（同样多的鱼/障碍/粒子），
  // 但大部分在屏幕外 —— 正好用来量「视口裁剪」这一类优化的收益。
  p.x = px; p.y = py; p.angle = 0; p.vx = 0; p.vy = 0;
  p.isGodMode = true;                    // 别被吃：workload 才稳定
  p.health = 1e9; p.maxHealth = 1e9;
  p.boost.current = 0; p.speedBoostTimer = 0; p.lureActive = false;
  p.invulnerableTimer = 999999;
  // 玩家物种/装扮/等级也钉死：warmup 后玩家可能已升级变身，玩家是画得最细的对象，
  // 物种随机漂移同样会让两轮渲染对比失真。
  p.type = 'CLOWN_FISH';
  p.config = D.spec('CLOWN_FISH');
  p.cosmetics = D.defaultCosmetics();
  p.level = 1;
  p.radius = p.config.radius;
  s.camera.x = px; s.camera.y = py; s.camera.zoom = 1;

  // ① 障碍物：300px 网格。原来 80 个散在 6000×6000，屏幕里 0~1 个，
  //    障碍物推挤（每帧 2 遍 × 全部障碍）的开销完全测不到。
  // ⚠️ 数量也钉死：createObstacles 随机撒点 → 每轮 42~57 个不等，两轮 workload 对不上。
  //    先补齐再截断到固定值（补的石头下面统一重摆位置，只凑数）。
  const FIXED_OBSTACLES = 48;
  while (s.obstacles.length > 0 && s.obstacles.length < FIXED_OBSTACLES) {
    s.obstacles.push({ ...s.obstacles[0], id: `perf-obs-${s.obstacles.length}` });
  }
  if (s.obstacles.length > FIXED_OBSTACLES) s.obstacles.length = FIXED_OBSTACLES;
  const obs = s.obstacles;
  const ocols = Math.max(1, Math.ceil(Math.sqrt(obs.length)));
  for (let i = 0; i < obs.length; i += 1) {
    obs[i].x = cx + ((i % ocols) - (ocols - 1) / 2) * 300;
    obs[i].y = cy + (Math.floor(i / ocols) - (ocols - 1) / 2) * 300;
    obs[i].radius = 50;
  }

  // ② 鱼：120px 网格，全在 AI 活跃半径（2600）以内 → 每条都在思考
  const ents = s.entities;
  const ecols = Math.max(1, Math.ceil(Math.sqrt(ents.length)));
  for (let i = 0; i < ents.length; i += 1) {
    const e = ents[i];
    e.x = cx + ((i % ecols) - (ecols - 1) / 2) * 120;
    e.y = cy + (Math.floor(i / ecols) - (ecols - 1) / 2) * 120;
    e.vx = 0; e.vy = 0;
    e.health = 1e9; e.maxHealth = 1e9;   // 不死 → 数量不变 → 两轮可比
    e.speed = 1.2;
  }

  // ⚠️ 状态必须回到 PLAYING：热身快进可能让玩家升级、弹出「选择进化方向」（EVOLVING），
  //    而 updateGame 在非 PLAYING 状态**直接 return** —— 逻辑耗时会量出 0，整场白测。
  s.status = 'PLAYING';
  s.evolveOptions = [];

  // ⚠️ 物种构成必须钉死：20 种形状 + 11 类装扮的渲染成本天差地别，
  //    两次运行同样「180 条鱼」，绘制调用数能差 50%，前后对比直接失真。
  //    固定参考物种（旧写法「取任意一条非战队鱼」依赖 warmup 后的随机状态，
  //    两轮 ref 物种不同 → fill/arc 假涨 50%），每条鱼的成本变成确定值；
  //    心境与状态计时器一并钉住（警觉/狂躁会改感知半径与速度，也是变量）。
  //    战队成员清空（ownerId = null）：它们不走 AI，留着会让「180 条鱼」缩水。
  if (ents.length > 0) {
    const refType = 'CLOWN_FISH';
    const refSpec = D.spec(refType);
    const plainCosmetics = D.defaultCosmetics();
    for (const e of ents) {
      e.type = refType;
      e.config = refSpec;
      e.cosmetics = plainCosmetics;
      e.radius = refSpec.radius;
      e.level = 1;
      e.ownerId = null;
      e.moodId = 'CALM';
      e.angerTimer = 0;
      e.sonarTimer = 0;
      e.camoActive = false;
      e.lureActive = false;
      e.speedBoostTimer = 0;
      e.isIdle = false;
    }
    // 战队成员就是 ownerId === 'player' 的实体（没有单独的成员数组），清空待入队队列即可
    s.squad.pending.length = 0;
  }

  // ③ 粒子：固定 400 颗（一半是小饼干 —— drawCookie 比画圆贵得多）
  const parts = s.particles;
  parts.length = 0;
  for (let i = 0; i < 400; i += 1) {
    parts.push({
      id: `perf-p${i}`,
      x: cx + Math.cos(i * 0.7) * (40 + (i % 520)),
      y: cy + Math.sin(i * 0.7) * (40 + (i % 520)),
      vx: 0, vy: 0, life: 1, maxLife: 1,
      color: '#fbbf24', size: 3 + (i % 3),
      shape: i % 2 === 0 ? 'COOKIE' : undefined,
      spin: i * 0.1,
    });
  }

  // ④ 标签：12 条。每条都要 measureText + roundRect 画两遍 + shadowBlur，
  //    默认世界一条都没有 —— 纯隐形的渲染开销。
  const labels = s.labels;
  labels.length = 0;
  for (let i = 0; i < 12; i += 1) {
    labels.push({
      x: cx - 560 + (i % 6) * 210,
      y: cy - 300 + Math.floor(i / 6) * 80,
      text: `性能基准 ${i}`,
      color: '#facc15',
      timer: 999999,
    });
  }

  // ⑤ 宝藏 / 道具 / 建筑 / 喷泉 / 传送门：默认世界里它们大多在屏幕外，
  //    而它们的单件渲染是本文件里最贵的（多层虚线描边 + 渐变 + shadowBlur + 文字）。
  s.treasures = [];
  const treasureTypes = ['FEAST', 'CHEST', 'GEM'];
  for (let i = 0; i < treasureTypes.length; i += 1) {
    s.treasures.push({
      id: `perf-t${i}`,
      x: cx - 200 + i * 200, y: cy + 220,
      type: treasureTypes[i],
      status: 'ACTIVE',
      timer: 999999, radius: 26,
      effect: 'EXP', rewardValue: 10,
    });
  }

  s.powerUps.length = 0;
  const puTypes = ['COIN', 'BOTTLE', 'SHELL', 'SPEED', 'SHIELD'];
  for (let i = 0; i < 15; i += 1) {
    s.powerUps.push({
      id: `perf-pu${i}`,
      x: cx - 400 + (i % 5) * 190,
      y: cy + 380 + Math.floor(i / 5) * 70,
      type: puTypes[i % puTypes.length],
      radius: 14,
    });
  }

  const ring = (arr, r) => {
    arr.forEach((o, i) => {
      const a = (i / Math.max(1, arr.length)) * Math.PI * 2;
      o.x = cx + Math.cos(a) * r;
      o.y = cy + Math.sin(a) * r;
    });
  };
  ring(s.buildings, 420);
  // 喷泉数量也是随机的（0~2 个），同样钉死，否则两次运行的 workload 对不上
  s.fountains.length = 0;
  ring(s.portals, 620);

  return D.counts();
};

/* ══════════════ [C] 绘制调用计数器（按需注入，且只统计主画布） ══════════════ */
/**
 * ⚠️ 这段**不能**放在 addInitScript 里：那样连 [B] 量帧耗时的那几轮也会被套一层
 *    代理函数，帧耗时被抬高。它只在最后一个阶段注入。
 * ⚠️ 只统计**游戏主画布**（document 里第一个 canvas，GameCanvas 永远排第一）：
 *    否则小地图 / 换装预览画布的点数会混进来，而它们和主渲染无关。
 */
const installCounters = () => {
  const proto = CanvasRenderingContext2D.prototype;
  const GAME = document.querySelector('canvas');
  const counts = {
    frames: 0, fill: 0, stroke: 0, fillRect: 0, drawImage: 0,
    fillText: 0, measureText: 0, save: 0, restore: 0,
    beginPath: 0, arc: 0, lineTo: 0, quadraticCurveTo: 0, ellipse: 0, rect: 0,
    roundRect: 0, clip: 0, setLineDash: 0,
    linearGradient: 0, radialGradient: 0,
    shadowBlurSets: 0, shadowedDraws: 0,
  };

  const guarded = (name, key) => {
    const orig = proto[name];
    if (typeof orig !== 'function') return;
    proto[name] = function (...a) {
      if (this.canvas === GAME) counts[key] += 1;
      return orig.apply(this, a);
    };
  };
  [
    ['fill', 'fill'], ['stroke', 'stroke'], ['fillRect', 'fillRect'], ['drawImage', 'drawImage'],
    ['fillText', 'fillText'], ['measureText', 'measureText'],
    ['beginPath', 'beginPath'], ['arc', 'arc'], ['lineTo', 'lineTo'],
    ['quadraticCurveTo', 'quadraticCurveTo'], ['ellipse', 'ellipse'], ['rect', 'rect'],
    ['roundRect', 'roundRect'], ['clip', 'clip'], ['setLineDash', 'setLineDash'],
    ['createLinearGradient', 'linearGradient'], ['createRadialGradient', 'radialGradient'],
  ].forEach(([n, k]) => guarded(n, k));

  // setTransform 只被 GameCanvas 的 render() 用来复位一次/帧 → 它 == 渲染帧数
  const origSetTransform = proto.setTransform;
  proto.setTransform = function (...a) {
    if (this.canvas === GAME) counts.frames += 1;
    return origSetTransform.apply(this, a);
  };

  // shadowBlur：**透传原生**（否则阴影真的不画了，测出来的渲染成本是假的），
  // 并按实例维护 save/restore 栈（否则一次 shadowBlur=30 之后所有 fill 都被误记）。
  const BLUR = Symbol('perfBlur');
  const STACK = Symbol('perfBlurStack');
  const desc = Object.getOwnPropertyDescriptor(proto, 'shadowBlur');
  if (desc && desc.get && desc.set) {
    Object.defineProperty(proto, 'shadowBlur', {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) {
        if (this.canvas === GAME && v > 0) counts.shadowBlurSets += 1;
        this[BLUR] = v;
        desc.set.call(this, v);
      },
    });
  }
  const origSave = proto.save;
  proto.save = function (...a) {
    const st = this[STACK] ?? (this[STACK] = []);
    st.push(desc && desc.get ? desc.get.call(this) : 0);
    if (this.canvas === GAME) counts.save += 1;
    return origSave.apply(this, a);
  };
  const origRestore = proto.restore;
  proto.restore = function (...a) {
    const st = this[STACK];
    if (st && st.length) {
      const v = st.pop();
      if (desc && desc.set) desc.set.call(this, v);
    }
    if (this.canvas === GAME) counts.restore += 1;
    return origRestore.apply(this, a);
  };
  // 「带阴影的绘制」才是真正贵的那件事：canvas 得为它单独跑一遍模糊
  ['fill', 'stroke', 'fillText', 'fillRect', 'drawImage'].forEach((n) => {
    const orig = proto[n];
    proto[n] = function (...a) {
      if (this.canvas === GAME && desc && desc.get && desc.get.call(this) > 0) counts.shadowedDraws += 1;
      return orig.apply(this, a);
    };
  });

  window.__CANVAS_COUNTS__ = {
    reset: () => { for (const k of Object.keys(counts)) counts[k] = 0; },
    snapshot: () => ({ ...counts }),
  };
  return !!GAME;
};

/* ══════════════ 统计工具 ══════════════ */
const percentile = (sorted, q) => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[idx];
};
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/* ══════════════ 启动 ══════════════ */
const browser = await chromium.launch({
  channel: 'chromium',
  args: [
    // ① 不关 vsync 就测不出渲染优化
    '--disable-frame-rate-limit', '--disable-gpu-vsync',
    // ② 细粒度 usedJSHeapSize，否则它只在 GC 之后更新，量不出锯齿
    '--enable-precise-memory-info',
  ],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push('console.error: ' + m.text());
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('button:has-text("开始游戏")', { timeout: 20000 });
if (!(await page.evaluate(() => typeof window.__FISH_DEBUG__ === 'object'))) {
  log('❌ 调试钩子缺失（只有 DEV 构建才有 window.__FISH_DEBUG__）');
  await browser.close();
  process.exit(1);
}
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(600);

let status = null;
for (let i = 0; i < 40; i++) {
  status = await page.evaluate(() => window.__FISH_DEBUG__.state().status);
  if (status === 'PLAYING') break;
  await page.waitForTimeout(200);
}
if (status !== 'PLAYING') {
  log('❌ 没能进入 PLAYING，实际 = ' + status);
  await browser.close();
  process.exit(1);
}
await page.keyboard.press('g'); // 无敌
// 鼠标摆到屏幕中心正右方：targetAngle = 0，与 angle=0 一致 → 不转向
await page.mouse.move(Math.round(W / 2 + 400), Math.round(H / 2));
await page.evaluate(() => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
});

/* ── 热身：快进世界，把刷怪池填满 ──
 * 不这么做的话两个场景的实体数会不一样（实测 47 vs 180），
 * 而「快了多少」完全取决于实体数 —— 前后对比直接失效。
 * 顺手也把「AI 活跃半径内有多少条鱼」推到饱和，这是最坏情况。
 */
await page.evaluate(buildScene, { cx: 3000, cy: 3000 });
const warm = await page.evaluate((n) => window.__FISH_DEBUG__.profile(n), WARMUP_STEPS);
const warmCounts = await page.evaluate(() => window.__FISH_DEBUG__.counts());
log(`[0] 热身 ${WARMUP_STEPS} 步（${warm.totalMs.toFixed(0)}ms）→ ${JSON.stringify(warmCounts)}`);

/* ── 测量辅助 ── */
const measureFrameTimes = async (frames) => page.evaluate(async (n) => {
  const out = [];
  let last = await new Promise((r) => requestAnimationFrame(r));
  for (let i = 0; i < n; i += 1) {
    const now = await new Promise((r) => requestAnimationFrame(r));
    out.push(now - last);
    last = now;
  }
  return out;
}, frames);

/**
 * [D] 堆抖动：每帧采一次 usedJSHeapSize。
 * 锯齿的**落差**≈ 两次 GC 之间分配掉的量（分配速率），**下降次数**≈ GC 次数。
 * 帧耗时 p50 低而 p95/p99 高（尖刺）时，第一个要怀疑的就是这里。
 */
const measureHeap = async (frames) => page.evaluate(async (n) => {
  const mem = performance.memory;
  if (!mem) return null;
  const samples = [];
  for (let i = 0; i < n; i += 1) {
    await new Promise((r) => requestAnimationFrame(r));
    samples.push(mem.usedJSHeapSize / 1048576);
  }
  let drops = 0;
  let maxDrop = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const d = samples[i - 1] - samples[i];
    if (d > 0.5) { drops += 1; maxDrop = Math.max(maxDrop, d); }
  }
  return {
    startMB: samples[0],
    endMB: samples[samples.length - 1],
    minMB: Math.min(...samples),
    maxMB: Math.max(...samples),
    gcEvents: drops,
    maxDropMB: maxDrop,
    samples: samples.length,
  };
}, frames);

/**
 * [B2] 纯渲染耗时：同步连画 N 帧（`__FISH_DRAW_FRAME__` 只画不排帧）。
 *
 * 这是渲染侧的**主判据**。[B] 的 rAF 间隔会被 vsync / 合成器节奏污染
 * （实测同一场景 p50 8.9ms 而 p95 54ms —— 前者接近真实工作量，后者大半是合成器抖动），
 * 而这里在 main 线程上连画，rAF 根本插不进来，量出来的就是 canvas 真正花掉的时间。
 * 「dc 优化有没有用」就看这个数字。
 */
const measureRenderCost = async (frames) => page.evaluate(async (n) => {
  const draw = window.__FISH_DRAW_FRAME__;
  if (typeof draw !== 'function') return null;
  const canvas = document.querySelector('canvas');
  const ctx2d = canvas ? canvas.getContext('2d') : null;
  /**
   * 每画一帧就强制把 GPU 积压的命令吐完。
   * 不这么做的话 canvas 会把很多帧的工作攒起来，偶尔一次性结算 ——
   * 实测同一场景 p50 2ms 而 p95 150ms，均值在 ±100% 之间跳，完全不可信。
   * 有了这个，每个样本都包含「这一帧自己的全部成本」，分布才稳定；
   * getImageData 的固定开销对每个样本一样，不影响前后对比（本探针只看相对变化）。
   */
  const flush = () => { if (ctx2d) ctx2d.getImageData(0, 0, 1, 1); };
  for (let i = 0; i < 15; i += 1) { draw(); flush(); }   // 预热：JIT / 懒初始化不进样本
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now();
    draw();
    flush();
    out.push(performance.now() - t0);
  }
  return out;
}, frames);

const measureDrawCalls = async (frames) => {
  await page.evaluate(() => window.__CANVAS_COUNTS__.reset());
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i += 1) await new Promise((r) => requestAnimationFrame(r));
  }, frames);
  const snap = await page.evaluate(() => window.__CANVAS_COUNTS__.snapshot());
  const framesSeen = Math.max(1, snap.frames);
  const perFrame = {};
  for (const [k, v] of Object.entries(snap)) {
    if (k === 'frames') continue;
    perFrame[k] = v / framesSeen;
  }
  return { frames: framesSeen, raw: snap, perFrame };
};

/* ══════════════ 阶段一：[A] 逻辑 + [B] 帧耗时 + [D] 堆（全程无打点） ══════════════ */
const scenes = {};
for (const [name, center] of SCENES) {
  log(`\n══ 场景 ${name} @ (${center.cx}, ${center.cy}) ══`);
  const counts = await page.evaluate(buildScene, center);
  log(`   世界规模: ${JSON.stringify(counts)}`);

  const logicRounds = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    await page.evaluate(buildScene, center);
    logicRounds.push(await page.evaluate((n) => window.__FISH_DEBUG__.profile(n), PROFILE_STEPS));
  }
  const sysTotals = {};
  for (const round of logicRounds) {
    for (const s of round.systems) sysTotals[s.name] = (sysTotals[s.name] ?? 0) + s.msPerFrame / ROUNDS;
  }
  const logicMs = mean(logicRounds.map((r) => r.msPerFrame));

  const allMs = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    await page.evaluate(buildScene, center);
    allMs.push(...(await measureFrameTimes(FRAMES)));
  }
  allMs.sort((a, b) => a - b);

  await page.evaluate(buildScene, center);
  const renderSamples = await measureRenderCost(FRAMES);
  renderSamples?.sort((a, b) => a - b);
  const renderMs = renderSamples ? {
    p50: percentile(renderSamples, 0.5),
    p95: percentile(renderSamples, 0.95),
    p99: percentile(renderSamples, 0.99),
    mean: mean(renderSamples),
    samples: renderSamples.length,
  } : null;

  await page.evaluate(buildScene, center);
  const heap = await measureHeap(FRAMES);
  // usedJSHeapSize 只在 GC 时更新（precise-memory-info 没生效时会全程一样大），
  // 全程一样大就明说「不可用」，别让人把 0 当成「没有 GC」
  if (heap && heap.minMB === heap.maxMB) heap.usable = false; else if (heap) heap.usable = true;
  const afterCounts = await page.evaluate(() => window.__FISH_DEBUG__.counts());

  scenes[name] = {
    countsAtStart: counts,
    countsAtEnd: afterCounts,
    logicMsPerFrame: logicMs,
    logicBySystem: Object.entries(sysTotals)
      .map(([n, v]) => ({ name: n, msPerFrame: v }))
      .sort((a, b) => b.msPerFrame - a.msPerFrame),
    frameMs: {
      p50: percentile(allMs, 0.5),
      p95: percentile(allMs, 0.95),
      p99: percentile(allMs, 0.99),
      max: allMs[allMs.length - 1] ?? 0,
      mean: mean(allMs),
      fps: 1000 / Math.max(1e-6, percentile(allMs, 0.5)),
      samples: allMs.length,
    },
    renderMs,
    heap,
    drawCalls: null,
  };

  log(`   [A] 逻辑 ${logicMs.toFixed(3)} ms/帧（同步连跑 ${PROFILE_STEPS} 步 × ${ROUNDS} 轮）`);
  for (const s of scenes[name].logicBySystem.slice(0, 6)) {
    log(`       ${s.name.padEnd(14)} ${s.msPerFrame.toFixed(3)} ms  `
      + `${logicMs > 0 ? ((s.msPerFrame / logicMs) * 100).toFixed(1).padStart(5) : '  0.0'}%`);
  }
  const f = scenes[name].frameMs;
  log(`   [B] rAF 帧间隔 p50 ${f.p50.toFixed(2)} / p95 ${f.p95.toFixed(2)} / p99 ${f.p99.toFixed(2)} / max ${f.max.toFixed(2)} ms`
    + `（≈${f.fps.toFixed(0)} fps，${f.samples} 样本）—— 受合成器节奏污染，只作参考`);
  if (renderMs) {
    log(`   [B2] 纯渲染 p50 ${renderMs.p50.toFixed(2)} / p95 ${renderMs.p95.toFixed(2)} / p99 ${renderMs.p99.toFixed(2)}`
      + ` / 均值 ${renderMs.mean.toFixed(2)} ms（${renderMs.samples} 样本）← 渲染侧主判据`);
  }
  if (heap) {
    log(`   [D] 堆 ${heap.startMB.toFixed(1)}→${heap.endMB.toFixed(1)} MB，`
      + `区间 ${heap.minMB.toFixed(1)}~${heap.maxMB.toFixed(1)}，GC 回落 ${heap.gcEvents} 次（最大一次 ${heap.maxDropMB.toFixed(1)} MB）`
      + `${heap.usable === false ? '  ⚠️ 采样全程恒定，不可用' : ''}`);
  }
}

/* ══════════════ 阶段 1.5：[E] 成本归因（诊断，不进判定） ══════════════ */
/**
 * 「渲染要优化」不难说，难的是说清**优化谁**。这一阶段把渲染成本切开：
 *   E1 全量            → 基准
 *   E2 关掉 shadowBlur → 差值 = 阴影光栅化的成本（canvas 里最贵的一类操作）
 *   E3 不画鱼          → 差值 = 实体渲染的成本（数量最多的一类）
 *   E4 不画粒子/标签   → 差值 = 粒子 + 标签的成本
 * 全部在一次 evaluate 里完成：中途绝不放 rAF 插进来改状态，测完原样还原。
 * 结论只看**差值**，不看绝对值 —— 绝对值受机器影响。
 */
const attributeRenderCost = async (frames) => page.evaluate((n) => {
  const draw = window.__FISH_DRAW_FRAME__;
  const s = window.__FISH_DEBUG__.state();
  const canvas = document.querySelector('canvas');
  const ctx2d = canvas ? canvas.getContext('2d') : null;
  const flush = () => { if (ctx2d) ctx2d.getImageData(0, 0, 1, 1); };
  const measure = () => {
    for (let i = 0; i < 15; i += 1) { draw(); flush(); }
    const o = [];
    for (let i = 0; i < n; i += 1) {
      const t0 = performance.now();
      draw();
      flush();
      o.push(performance.now() - t0);
    }
    o.sort((a, b) => a - b);
    return {
      p50: o[Math.round((o.length - 1) * 0.5)],
      mean: o.reduce((a, b) => a + b, 0) / o.length,
      p95: o[Math.min(o.length - 1, Math.round((o.length - 1) * 0.95))],
    };
  };
  const restore = (arr, saved) => { arr.length = 0; for (const it of saved) arr.push(it); };

  const out = {};
  out.full = measure();

  // E2：把 shadowBlur 的 setter 换成空操作（原生阴影完全不再打开）
  const proto = CanvasRenderingContext2D.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'shadowBlur');
  Object.defineProperty(proto, 'shadowBlur', {
    configurable: true, get() { return 0; }, set() { /* 丢弃 */ },
  });
  out.noShadow = measure();
  Object.defineProperty(proto, 'shadowBlur', desc);

  // E3：一条鱼都不画
  const savedEnts = s.entities.slice();
  s.entities.length = 0;
  out.noEntities = measure();
  restore(s.entities, savedEnts);

  // E4：不画粒子和标签
  const savedParts = s.particles.slice();
  const savedLabels = s.labels.slice();
  s.particles.length = 0;
  s.labels.length = 0;
  out.noParticlesLabels = measure();
  restore(s.particles, savedParts);
  restore(s.labels, savedLabels);

  return out;
}, frames);

/* ══════════════ 阶段 1.5：[E] 成本归因 ══════════════ */
for (const [name, center] of SCENES) {
  await page.evaluate(buildScene, center);
  const d = await attributeRenderCost(120);
  scenes[name].attribution = d;
  const pct = (part, whole) => (whole > 0 ? `${(((whole - part) / whole) * 100).toFixed(0)}%` : 'n/a');
  log(`\n[E] 场景 ${name} 渲染成本归因（均值 ms/帧）：`);
  log(`     全量 ${d.full.mean.toFixed(2)}（p50 ${d.full.p50.toFixed(2)} / p95 ${d.full.p95.toFixed(2)}）`);
  log(`     关掉 shadowBlur → ${d.noShadow.mean.toFixed(2)}（省 ${pct(d.noShadow.mean, d.full.mean)}）`);
  log(`     不画鱼          → ${d.noEntities.mean.toFixed(2)}（省 ${pct(d.noEntities.mean, d.full.mean)}）`);
  log(`     不画粒子/标签   → ${d.noParticlesLabels.mean.toFixed(2)}（省 ${pct(d.noParticlesLabels.mean, d.full.mean)}）`);
}

/* ══════════════ 阶段二：[C] 绘制调用（此时才注入打点） ══════════════ */
const installed = await page.evaluate(installCounters);
if (!installed) log('\n⚠️ 没找到游戏主画布，[C] 跳过');
for (const [name, center] of SCENES) {
  if (!installed) break;
  await page.evaluate(buildScene, center);
  const draws = await measureDrawCalls(FRAMES);
  scenes[name].drawCalls = draws;
  const pf = draws.perFrame;
  log(`\n[C] 场景 ${name} 每帧绘制调用（${draws.frames} 渲染帧采样）：`);
  log(`     路径   beginPath ${pf.beginPath.toFixed(0)} / arc ${pf.arc.toFixed(0)} / lineTo ${pf.lineTo.toFixed(0)}`
    + ` / quadratic ${pf.quadraticCurveTo.toFixed(0)} / roundRect ${pf.roundRect.toFixed(1)} / setLineDash ${pf.setLineDash.toFixed(1)}`);
  log(`     绘制   fill ${pf.fill.toFixed(0)} / stroke ${pf.stroke.toFixed(0)} / fillText ${pf.fillText.toFixed(0)}`
    + ` / fillRect ${pf.fillRect.toFixed(0)} / drawImage ${pf.drawImage.toFixed(0)}`);
  log(`     状态   save ${pf.save.toFixed(0)} / restore ${pf.restore.toFixed(0)} / measureText ${pf.measureText.toFixed(1)}`);
  log(`     昂贵   渐变 linear ${pf.linearGradient.toFixed(1)} + radial ${pf.radialGradient.toFixed(1)}`
    + ` / shadowBlur 置非零 ${pf.shadowBlurSets.toFixed(1)} 次 → **带阴影的绘制 ${pf.shadowedDraws.toFixed(0)} 次**`);
}

/* ══════════════ 输出快照 + 与基线对比 ══════════════ */
const snapshot = {
  label: LABEL,
  at: new Date().toISOString(),
  config: { rounds: ROUNDS, frames: FRAMES, profileSteps: PROFILE_STEPS, warmupSteps: WARMUP_STEPS, viewport: [W, H] },
  warmup: { ms: warm.totalMs, counts: warmCounts },
  scenes,
  errors,
};
fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2), 'utf8');
log(`\n[快照] 已写入 scripts/perf-${LABEL}.json`);

const DC_KEYS = ['fill', 'stroke', 'fillText', 'measureText', 'save', 'restore', 'arc', 'lineTo',
  'roundRect', 'setLineDash', 'linearGradient', 'radialGradient', 'shadowBlurSets', 'shadowedDraws'];

if (fs.existsSync(BASE) && LABEL !== 'baseline') {
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  log(`\n══ 对比 ${BASE_LABEL} → ${LABEL} ══`);
  for (const name of Object.keys(scenes)) {
    const b = base.scenes[name];
    const c = scenes[name];
    if (!b) continue;
    // 硬门槛：实体数必须一致 —— 它是 workload 的主导项。
    // 障碍物数量已由 buildScene 钉死，这里只作展示；万一将来出现偏差，提醒去查。
    const same = b.countsAtStart.entities === c.countsAtStart.entities;
    const obsNote = b.countsAtStart.obstacles === c.countsAtStart.obstacles
      ? `障碍 ${b.countsAtStart.obstacles}` : `障碍 ${b.countsAtStart.obstacles}→${c.countsAtStart.obstacles}（⚠️不一致）`;
    log(`\n   ── 场景 ${name} ──  workload: 实体 ${b.countsAtStart.entities} → ${c.countsAtStart.entities}`
      + ` / ${obsNote}`
      + `  ${same ? '✅ 可比' : '❌ 不可比（下面数字无意义）'}`);
    log(`   ${'指标'.padEnd(20)}${'baseline'.padStart(12)}${'现在'.padStart(12)}${'变化'.padStart(11)}`);
    const rows = [
      ['逻辑 ms/帧', b.logicMsPerFrame, c.logicMsPerFrame],
      ['渲染 ms/帧 p50', b.renderMs?.p50 ?? 0, c.renderMs?.p50 ?? 0],
      ['渲染 ms/帧 p95', b.renderMs?.p95 ?? 0, c.renderMs?.p95 ?? 0],
      ['渲染 ms/帧 均值', b.renderMs?.mean ?? 0, c.renderMs?.mean ?? 0],
      ['rAF 帧间隔 p50', b.frameMs.p50, c.frameMs.p50],
      ['rAF 帧间隔 p95', b.frameMs.p95, c.frameMs.p95],
      ['归因·关阴影', b.attribution?.noShadow.mean ?? 0, c.attribution?.noShadow.mean ?? 0],
      ['归因·不画鱼', b.attribution?.noEntities.mean ?? 0, c.attribution?.noEntities.mean ?? 0],
      ['堆 GC 次数', b.heap?.gcEvents ?? 0, c.heap?.gcEvents ?? 0],
    ];
    for (const k of DC_KEYS) {
      rows.push([`DC ${k}`, b.drawCalls?.perFrame[k] ?? 0, c.drawCalls?.perFrame[k] ?? 0]);
    }
    for (const [label, bv, cv] of rows) {
      const delta = bv > 0 ? (cv - bv) / bv : 0;
      const mark = delta < -0.02 ? ' ✅' : delta > 0.02 ? ' ⚠️' : '';
      log(`   ${label.padEnd(20)}${bv.toFixed(2).padStart(12)}${cv.toFixed(2).padStart(12)}`
        + `${((delta * 100).toFixed(1) + '%').padStart(11)}${mark}`);
    }
  }
}

log(`\n[错误] ${errors.length ? JSON.stringify(errors.slice(0, 6)) : '无'}`);
await browser.close();
process.exit(errors.length === 0 ? 0 : 1);
