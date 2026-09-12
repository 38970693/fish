// 「原地转圈圈」修复探针：真机验证好奇 / 群聚两个心境不再绕圈打转。
//
// 根因（单测已复现：900 帧穿越 280px 环 460 次）：
//   「追」与「退」在边界两侧都是全推力分支，中间没有停泊带，而转向增益高达 ~0.45/帧，
//   鱼在 280px 环上每几帧被抢一次方向盘 → 原地高频往返打转。
// 修法与 squad 跟随同款：死区外追，死区内减速滑停（CURIOUS_PARK=380 / SOCIABLE_KEEP=135）。
//
// 为什么断言用「角扫掠」而不是路程：陨石事件（state.time % 1500 定点刷）的溅射会把
// 停泊的鱼推一把（有限向，角扫掠 < 0.5 rad），而「转圈」是单调绕圈（每圈 ≥ 2π）——
// 角扫掠对推挤免疫，对绕圈敏感，正是这个 bug 的本征特征。
//
// 跑法（⚠️ 必须先清代理，否则 page.goto 到 localhost 会无限超时）：
//   $env:http_proxy=$null; $env:https_proxy=$null; $env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null
//   node scripts/probe-mood-orbit.mjs
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
await page.waitForTimeout(2500);
// 鼠标放到屏幕正中 = 玩家原地不动
await page.mouse.move(720, 450);
await page.waitForTimeout(400);

let failed = 0;
const check = (ok, label, detail) => {
  log(`   ${ok ? '✅' : '❌'} ${label}${detail ? ' —— ' + detail : ''}`);
  if (!ok) failed++;
};

/** 清场：其它鱼全部挪出地图边界（实体数保持上限 → 不会触发刷怪），物件清空；
 *  ⚠️ 同时钉死玩家：speed=0 防漂移（鼠标世界点随相机微动，会把好奇鱼顶进退让区），
 *  invulnerable 防被陨石砸死 —— 玩家一死世界冻结（GAME_OVER），后面整个观察窗作废（实测踩过）。 */
const clearField = () =>
  page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    s.player.speed = 0;
    s.player.lureActive = false;
    s.player.invulnerableTimer = 99999;
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
    });
  });

/** 挑两条可用的鱼染成纯蓝、给它们同一个种族（群聚配对要求同 type），返回 id 给 Node 侧用 */
const prepareFish = () =>
  page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    const pool = s.entities
      .filter((e) => e.radius >= 12 && e.config.tier > 0)
      .slice(0, 2);
    const [a, b] = pool;
    // 统一种族：群聚的配对判定是 other.type === entity.type
    b.type = a.type;
    b.config = a.config;
    for (const f of pool) {
      f.cosmetics = {
        teeth: 'NORMAL', skinColor: '#38bdf8', pattern: 'NONE', scaleType: 'NONE',
        accessory: 'NONE', tailType: 'DEFAULT', bodyType: 'DEFAULT', mouthType: 'TRIANGLE',
        eyeType: 'NORMAL', eyebrowType: 'NONE', trailType: 'NONE',
      };
      f.semiGhostTimer = 99999; // 玩家凑过来也吃不掉 / 它也吃不了别人
      f.moodTimer = 99999;      // 心境钉死，观察窗内不换状态
      f.angerTimer = 0;
      f.biteCooldown = 9999;
      // ⚠️ 清掉野场行为留下的状态：灯笼鱼的 lureActive 会让优先级 1 的「诱惑追逐」
      // 压过心境（小鱼直接怼到大肉块身上，间距收敛到 17px —— 实测踩过）；
      // 负 speedBoostTimer（减速/麻痹残留）会让追逐慢到 0.4 倍，观察窗走不完路程（实测踩过）
      f.lureActive = false;
      f.camoActive = false;
      f.sonarTimer = 0;
      f.speedBoostTimer = 0;
      f.isIdle = false;
      f.speed = 2; // 统一巡航速度，观察窗的时序才可预期（物种快慢差异大）
    }
    return { idA: a.id, idB: b.id, typeA: a.type };
  });

/** 摆位：dx 传 null 表示这条鱼本场景不用 */
const place = (ids, mood, dxA, dxB) =>
  page.evaluate(({ idA, idB, mood, dxA, dxB }) => {
    const s = window.__FISH_DEBUG__.state();
    const placeOne = (id, dx) => {
      const f = s.entities.find((e) => e.id === id);
      f.x = s.player.x + dx;
      f.y = s.player.y;
      f.angle = dx > 0 ? Math.PI : 0; // 头朝目标
      f.vx = 0;
      f.vy = 0;
      f.moodId = mood;
    };
    placeOne(idA, dxA);
    if (dxB !== null) placeOne(idB, dxB);
  }, { idA: ids.idA, idB: ids.idB, mood, dxA, dxB });

const readPos = (id) =>
  page.evaluate((fishId) => {
    const s = window.__FISH_DEBUG__.state();
    const f = s.entities.find((e) => e.id === fishId);
    return { x: f.x, y: f.y, isIdle: !!f.isIdle, moodId: f.moodId ?? null };
  }, id);

const readPlayer = () =>
  page.evaluate(() => {
    const s = window.__FISH_DEBUG__.state();
    return { x: s.player.x, y: s.player.y, status: s.status, time: s.time };
  });

/** 同时观察多条鱼（一次 tick 采一轮，避免两条鱼的样本错位） */
const watchAll = async (ids, seconds) => {
  const rounds = Math.round((seconds * 1000) / 400);
  const samples = ids.map(() => []);
  for (let i = 0; i < rounds; i += 1) {
    await page.waitForTimeout(400);
    for (let k = 0; k < ids.length; k += 1) {
      samples[k].push(await readPos(ids[k]));
    }
  }
  return samples;
};

/** 收尾窗口里绕 ref 的累计角扫掠（rad）：绕圈 ≥ 2π/圈，推挤/漂移只有零点几 rad */
const angularSweep = (samples, ref, take) => {
  const tail = samples.slice(-take);
  let sweep = 0;
  let prev = null;
  for (const p of tail) {
    const a = Math.atan2(p.y - ref.y, p.x - ref.x);
    if (prev !== null) {
      let d = a - prev;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      sweep += Math.abs(d);
    }
    prev = a;
  }
  return sweep;
};

/** 收尾窗口里的路程（px），仅作参考信息输出 */
const pathLength = (samples, take) => {
  const tail = samples.slice(-take);
  let len = 0;
  for (let i = 1; i < tail.length; i += 1) {
    len += Math.hypot(tail[i].x - tail[i - 1].x, tail[i].y - tail[i - 1].y);
  }
  return len;
};

/* ── A. 好奇：靠近 → 停泊盯着玩家，不绕圈 ── */
log('[A] 好奇鱼：从 600px 靠近玩家');
await clearField();
const fishA = await prepareFish();
await place(fishA, 'CURIOUS', 600, null);
const p0 = await readPlayer();
const a0 = await readPos(fishA.idA);
const [samplesA] = await watchAll([fishA.idA], 14);
const aN = samplesA[samplesA.length - 1];
const pN = await readPlayer();
const d0 = Math.hypot(a0.x - p0.x, a0.y - p0.y);
const dN = Math.hypot(aN.x - pN.x, aN.y - pN.y);
const sweepA = angularSweep(samplesA, pN, 10); // 收尾 4s 绕玩家的角扫掠
const parkPath = pathLength(samplesA, 10);
log(`   距离 ${d0.toFixed(0)} → ${dN.toFixed(0)}，收尾 4s 路程 ${parkPath.toFixed(1)}px，角扫掠 ${sweepA.toFixed(2)} rad，isIdle=${aN.isIdle}`);
check(pN.status === 'PLAYING', '观察窗内世界未冻结（玩家没被事件打死）', `${pN.status} @ t=${pN.time}`);
check(aN.moodId === 'CURIOUS', '观察窗内心境未被换掉', aN.moodId);
check(dN < d0 - 100, '真的靠近了玩家', `${d0.toFixed(0)} → ${dN.toFixed(0)}`);
check(dN >= 275 && dN <= 430, '停在围观的体面距离（280~380 停泊带）', dN.toFixed(0));
check(sweepA < 2.5, '收尾 4s 无绕圈（角扫掠远小于一圈）', `${sweepA.toFixed(2)} rad`);
check(aN.isIdle, '停泊标记生效');
await page.screenshot({ path: 'scripts/moods-curious-parked.png' });

/* ── B. 群聚：两条同种鱼互相凑近 → 配对悬停 ── */
log('[B] 群聚配对：两条同种鱼从 300px 互相靠近');
await clearField();
const fishB = await prepareFish();
await place(fishB, 'SOCIABLE', 400, 700);
const [samplesBa, samplesBb] = await watchAll([fishB.idA, fishB.idB], 14);
const bNa = samplesBa[samplesBa.length - 1];
const bNb = samplesBb[samplesBb.length - 1];
const b0a = samplesBa[0];
const b0b = samplesBb[0];
const sep0 = Math.hypot(b0a.x - b0b.x, b0a.y - b0b.y);
const sepN = Math.hypot(bNa.x - bNb.x, bNa.y - bNb.y);
const mid = { x: (bNa.x + bNb.x) / 2, y: (bNa.y + bNb.y) / 2 };
const sweepB = angularSweep(samplesBa, mid, 10);
const pairPath = pathLength(samplesBa, 10);
log(`   间距 ${sep0.toFixed(0)} → ${sepN.toFixed(0)}，收尾 4s 路程 ${pairPath.toFixed(1)}px，角扫掠 ${sweepB.toFixed(2)} rad，isIdle A=${bNa.isIdle} B=${bNb.isIdle}`);
check(sepN < sep0 - 100, '真的凑近了同伴', `${sep0.toFixed(0)} → ${sepN.toFixed(0)}`);
check(sepN >= 80 && sepN <= 150, '停在并肩不叠点的距离（135 停泊带）', sepN.toFixed(0));
check(sweepB < 2.5, '收尾 4s 无互绕（角扫掠远小于一圈）', `${sweepB.toFixed(2)} rad`);
check(bNa.isIdle && bNb.isIdle, '两条鱼都处于停泊标记');
check(bNa.moodId === 'SOCIABLE' && bNb.moodId === 'SOCIABLE', '两条鱼心境未被换掉', `${bNa.moodId}/${bNb.moodId}`);
await page.screenshot({ path: 'scripts/moods-sociable-pair.png' });

/* ── C. 页面错误 ── */
log('[C] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));
check(errors.length === 0, '无页面错误');

log(failed === 0 ? '\n🎉 全部断言通过' : `\n💥 ${failed} 条断言失败`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
