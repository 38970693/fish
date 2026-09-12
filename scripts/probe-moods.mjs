// 心境（AI 鱼随机状态）探针：真机验证「鱼群里真的有多种状态」+「状态徽章真的画出来了」。
//
// 为什么值得单独测：
//   · 心境只是个字符串，写上去了不等于接上线 —— 接管型 handler 忘了分发，
//     单测里「注册表检查」抓不到运行时的表现（我们用「正向对照」单测抓，这里再真机确认）。
//   · 徽章是**画出来的东西**：DOM 断言抓不到「按钮在、画不出来」这类 bug
//     （装扮功能踩过）。所以这里必须做**像素级归因**：
//     同一条鱼、同一个位置，只改 moodId —— CALM（无徽章）时徽章区域没有暖色像素，
//     FRENZY（💢 红色徽章）时有；再切回 CALM 又归零。三段对照才能证明「是徽章画的」。
//
// 跑法（⚠️ 必须先清代理，否则 page.goto 到 localhost 会无限超时）：
//   $env:http_proxy=$null; $env:https_proxy=$null; $env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null
//   node scripts/probe-moods.mjs
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
await page.click('button:has-text("开始游戏")');
// 给刷怪系统一点时间铺场
await page.waitForTimeout(2500);
// 鼠标放到屏幕正中 = 玩家原地不动（鱼永远朝鼠标游），鱼群才不会跟着漂
await page.mouse.move(720, 450);
await page.waitForTimeout(400);

let failed = 0;
const check = (ok, label, detail) => {
  log(`   ${ok ? '✅' : '❌'} ${label}${detail ? ' —— ' + detail : ''}`);
  if (!ok) failed++;
};

/** 读真实 gameState（__FISH_DEBUG__ 直接给引用，比 HUD 文本可靠） */
const readState = () =>
  page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    return {
      status: s.status,
      zoom: s.camera.zoom,
      player: { x: s.player.x, y: s.player.y, level: s.player.level, type: s.player.type },
      entities: s.entities.map((e) => ({
        id: e.id,
        type: e.type,
        name: e.config.name,
        tier: e.config.tier,
        radius: e.radius,
        x: e.x,
        y: e.y,
        moodId: e.moodId ?? null,
        moodTimer: e.moodTimer ?? null,
      })),
    };
  });

/* ── A. 鱼群里真的有多种心境 ── */
log('[A] 鱼群的状态多样性（真机随机抽样）');
let snap = await readState();
const fishes = snap.entities.filter((e) => e.moodId);
check(snap.entities.length > 10, '场上鱼够多（抽样有意义）', `${snap.entities.length} 条`);
check(fishes.length === snap.entities.length, '每条 AI 鱼都有心境字段（接线没漏）', `${fishes.length}/${snap.entities.length}`);
check(
  fishes.every((f) => f.moodTimer > 0),
  '每条鱼的心境计时器都排上了（到期会换状态）'
);
const dist = {};
for (const f of fishes) dist[f.moodId] = (dist[f.moodId] || 0) + 1;
const kinds = Object.keys(dist).length;
log(`   心境分布：${JSON.stringify(dist)}`);
check(kinds >= 3, '至少出现 3 种不同心境（不是复制粘贴）', `实到 ${kinds} 种`);
const plankton = fishes.filter((f) => f.tier === 0);
check(
  plankton.every((f) => f.moodId === 'CALM'),
  '磷虾（食物）一律悠闲，不做无意义的随机',
  `${plankton.length} 条`

);

/* ── B. 布景 + 截图：8 条鱼围一圈，各挂一种心境 ── */
log('[B] 布景截图：不同心境的徽章肉眼可见');
const MOODS = ['CALM', 'ALERT', 'FEARFUL', 'HUNGRY', 'CURIOUS', 'SOCIABLE', 'SLEEPY', 'FRENZY'];
const ringSetup = await page.evaluate((moods) => {
  const s = window.__FISH_DEBUG__.state();
  const chosen = s.entities
    .filter((e) => e.radius >= 12 && e.config.tier > 0)
    .slice(0, moods.length);
  const R = 250 / s.camera.zoom; // 固定**屏幕**半径 250px，免得被缩放放小看不见
  chosen.forEach((e, i) => {
    const a = (i / moods.length) * Math.PI * 2;
    e.x = s.player.x + Math.cos(a) * R;
    e.y = s.player.y + Math.sin(a) * R;
    e.angle = a + Math.PI; // 头朝圆心
    e.speed = 0; // 定住，别游走
    e.semiGhostTimer = 99999; // 免得被玩家一口吃了
    e.moodId = moods[i];
    e.moodTimer = 99999; // 也别中途换心境
  });
  return chosen.length;
}, MOODS);
check(ringSetup >= 6, '围了一圈展示鱼', `${ringSetup} 条`);
await page.waitForTimeout(250);
await page.screenshot({ path: 'scripts/moods-ring.png' });

/* ── C. 徽章像素归因：只改 moodId，其余全冻结 ── */
log('[C] 徽章真的画出来了（像素级归因）');
// ⚠️ 千万别用 `status = 'MENU'` 来冻结 —— 菜单态下 GameCanvas 会整个卸载，
// 「最大的 canvas」就变成了装扮面板的预览缩略图，采样全错（踩过：暖色像素数乱跳）。
// 正确做法：保持 PLAYING，把其它鱼全挪出画面、速度归零、物件清空 ——
// 场上只剩水色 + 一条定住的测试鱼，归因一样干净，而且不会触发刷怪（实体数已达上限）。
await page.evaluate(() => {
  const s = window.__FISH_DEBUG__.state();
  s.particles = [];
  s.powerUps = [];
  s.treasures = [];
  s.fountains = [];
  s.hazards = [];
  s.portals = [];
  s.buildings = [];
  s.labels = [];
  s.obstacles.forEach((o) => {
    o.x += 60000;
    o.y += 60000;
  });
  s.entities.forEach((e) => {
    e.x += 60000;
    e.y += 60000;
    e.speed = 0;
  });
  const fish = s.entities.find((e) => e.radius >= 12 && e.config.tier > 0);
  fish.x -= 60000;
  fish.y -= 60000;
  fish.x = s.player.x + 260 / s.camera.zoom;
  fish.y = s.player.y - 60 / s.camera.zoom;
  fish.angle = 0;
  fish.speed = 0;
  fish.semiGhostTimer = 99999; // 半虚保护：玩家凑过来也吃不掉
  // 鱼身染成纯蓝 —— 不然暖色（橙色小丑鱼之类）会混进徽章采样区，归因就被污染了
  fish.cosmetics = {
    teeth: 'NORMAL', skinColor: '#38bdf8', pattern: 'NONE', scaleType: 'NONE',
    accessory: 'NONE', tailType: 'DEFAULT', bodyType: 'DEFAULT', mouthType: 'TRIANGLE',
    eyeType: 'NORMAL', eyebrowType: 'NONE', trailType: 'NONE',
  };
  window.__MOOD_FISH__ = fish.id;
});
await page.waitForTimeout(200);

const setMood = (page, mood) =>
  page.evaluate((m) => {
    const s = window.__FISH_DEBUG__.state();
    const fish = s.entities.find((e) => e.id === window.__MOOD_FISH__);
    fish.moodId = m;
    fish.moodTimer = 99999;
  }, mood);

/**
 * 清场 + 现算徽章位置 + 读像素，**同一次页面调用**里完成，中间零间隙。
 *
 * 两个必须同调用内做的理由：
 *  · 徽章坐标要用**当帧**的 camera 算 —— 玩家还在游、摄像机跟着动，
 *    用旧快照算的框会漂走（踩过：框漂了，狂躁的徽章采了个空，读到 0）。
 *  · 世界还在跑（PLAYING），清场和读像素之间有间隙的话，
 *    新刷的鱼 / 飘过来的粒子会正好落进采样区（踩过：切回悠闲却读到 194）。
 */
const sampleWarm = (page, half = 13) =>
  page.evaluate((h) => {
    const s = window.__FISH_DEBUG__.state();
    const canvas = [...document.querySelectorAll('canvas')].sort(
      (a, b) => b.width * b.height - a.width * a.height
    )[0];
    const ctx = canvas.getContext('2d');
    const cam = s.camera;
    const fish = s.entities.find((e) => e.id === window.__MOOD_FISH__);
    // 当帧的徽章中心（world → 屏幕像素，公式与 GameCanvas 的 isOnScreen 一致）
    const bx = (fish.x - fish.radius * 0.95 - cam.x) * cam.zoom + canvas.width / 2;
    const by = (fish.y - fish.radius * 0.8 - cam.y) * cam.zoom + canvas.height / 2;
    // 清场：会刷出来 / 会飘的东西全部清空（金币道具是暖色，特别容易污染采样区）
    s.particles = [];
    s.powerUps = [];
    s.treasures = [];
    s.fountains = [];
    s.hazards = [];
    s.labels = [];
    s.entities.forEach((e) => {
      if (e.id === fish.id) return;
      const ex = (e.x - cam.x) * cam.zoom + canvas.width / 2;
      const ey = (e.y - cam.y) * cam.zoom + canvas.height / 2;
      if (Math.abs(ex - bx) < 90 && Math.abs(ey - by) < 90) {
        e.x += 60000;
        e.y += 60000;
      }
    });
    const x0 = Math.max(0, Math.round(bx) - h);
    const y0 = Math.max(0, Math.round(by) - h);
    const { data } = ctx.getImageData(x0, y0, h * 2, h * 2);
    let warm = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 30) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 130 && r > b + 30 && r > g + 30) warm += 1;
    }
    return { warm, bx: Math.round(bx), by: Math.round(by) };
  }, half);

await setMood(page, 'CALM');
await page.waitForTimeout(150);
const calmWarm = await sampleWarm(page);

await setMood(page, 'FRENZY');
await page.waitForTimeout(150);
const frenzyWarm = await sampleWarm(page);

await setMood(page, 'CALM');
await page.waitForTimeout(150);
const calmAgain = await sampleWarm(page);

log(`   采样点 (${calmWarm.bx}, ${calmWarm.by})，暖色像素：悠闲=${calmWarm.warm}，狂躁=${frenzyWarm.warm}，切回悠闲=${calmAgain.warm}`);
check(calmWarm.warm <= 3, '悠闲（无徽章）：徽章区没有暖色像素', `${calmWarm.warm}`);
check(frenzyWarm.warm >= 8, '狂躁（💢 红色徽章）：徽章区出现暖色像素', `${frenzyWarm.warm}`);
check(calmAgain.warm <= 3, '切回悠闲：暖色像素归零（排除顺序/噪声因素）', `${calmAgain.warm}`);

/* ── D. 特写对比：同一条鱼，悠闲（无徽章） vs 狂躁（💢） ── */
log('[D] 徽章特写对比');
await setMood(page, 'CALM');
await page.waitForTimeout(200);
const calmShot = await sampleWarm(page);
await page.screenshot({
  path: 'scripts/moods-badge-off.png',
  clip: { x: calmShot.bx - 60, y: calmShot.by - 60, width: 120, height: 120 },
});

await setMood(page, 'FRENZY');
await page.waitForTimeout(200);
const frenzyShot = await sampleWarm(page);
await page.screenshot({
  path: 'scripts/moods-badge-on.png',
  clip: { x: frenzyShot.bx - 60, y: frenzyShot.by - 60, width: 120, height: 120 },
});
check(true, '已保存特写', 'moods-badge-off.png / moods-badge-on.png');

/* ── E. 页面错误 ── */
log('[E] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
check(errors.length === 0, '无页面错误');

log(failed === 0 ? '\n🎉 全部断言通过' : `\n💥 ${failed} 条断言失败`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
