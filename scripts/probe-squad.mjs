/**
 * 战队系统端到端探针（真实 Chromium + dev 调试钩子）。
 *
 * 验证链路：开局 → 开无敌(G) → 主动追猎最近的猎物 → 吃掉的鱼倒戈入队
 *          → HUD 显示战队人数 → 按 R 切换（灵魂附身）→ 玩家身体真的换了 → 无报错
 *
 * 为什么不用 HUD 文本判断：
 *   HUD 的 uiState 是 App.tsx 里 setInterval 每 100ms 才同步一次的，
 *   按键后立刻读会拿到「上一帧的旧快照」，看起来像没切换。踩过这个坑。
 *   所以这里用 App.tsx 暴露的 window.__FISH_DEBUG__（仅 DEV）直读真实 gameState。
 *
 * 为什么主动追猎：
 *   早期版本只让玩家绕圈乱游，能否吃到鱼全靠随机 → 经常 75s 一条没吃到（探针假失败）。
 *   现在每轮读最近的猎物并朝它游，稳定也能跑得快。
 *
 * 用法：先起 dev server（vite --port 3000），再 node scripts/probe-squad.mjs
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

const debug = (fn) => page.evaluate(fn);

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('text=开始游戏', { timeout: 15000 });
// 选双髻鲨（t3，半径 50）开局：小丑鱼只能吃浮游生物，而浮游生物按设计不收编，
// 用大鱼才能稳定吃到 t1/t2 的鱼，验证「被吃掉的鱼入队」这条链路。
await page.click('button:has-text("双髻鲨")');
await page.waitForTimeout(300);
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(600);

// 开无敌，专心验证战队而不是先被吃掉
await page.keyboard.press('g');
await page.waitForTimeout(200);

const hookReady = await debug(() => typeof window.__FISH_DEBUG__ === 'object');
log(`[0] 调试钩子 __FISH_DEBUG__ = ${hookReady ? '✅ 就绪' : '❌ 缺失（DEV 模式下才会有）'}`);
if (!hookReady) {
  await browser.close();
  process.exit(1);
}

const readPlayer = () => debug(() => window.__FISH_DEBUG__.player());
const readSquad = () => debug(() => window.__FISH_DEBUG__.squad());
const readState = () => debug(() => {
  const s = window.__FISH_DEBUG__.state();
  return {
    status: s.status,
    p: window.__FISH_DEBUG__.player(),
    // 只挑「比我小、且值得收编」的猎物（tier>=1）
    prey: s.entities
      .filter((e) => e.ownerId !== 'player' && e.health > 0 && e.config.tier >= 1 && e.radius < s.player.radius * 0.95)
      .map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, r: e.radius, tier: e.config.tier })),
  };
});

let p0 = await readPlayer();
log(`[1] 开局：玩家=${p0.name} 半径=${p0.radius} Lv.${p0.level}`);

/** 朝世界坐标某点游：把方向换算成玩家为中心的屏幕方向（相机大致跟随玩家） */
const steerTo = async (tx, ty) => {
  const p = await readPlayer();
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy) || 1;
  await page.mouse.move(W / 2 + (dx / d) * 380, H / 2 + (dy / d) * 380);
};

log('[2] 主动追猎（最多 60 轮）');
let switchTested = false;
let maxSquad = 0;
let recruited = 0;

for (let round = 1; round <= 60; round++) {
  const st = await readState();
  if (st.status === 'GAME_OVER' || st.status === 'VICTORY') {
    log(`    第 ${round} 轮状态=${st.status}，停止追猎`);
    break;
  }

  // 吃完第一条鱼往往就攒够进化点数 → 弹「选择进化方向」遮罩（世界暂停）。
  // 不处理的话玩家会一直卡在弹窗里，捕食和截图都拿不到。选第一个方向继续。
  if (st.status === 'EVOLVING') {
    const opt = page.locator('button:has-text("右键技能")').first();
    if (await opt.count()) {
      await opt.click();
      log(`    第 ${round} 轮：处理进化弹窗（选了第一个方向）`);
      await page.waitForTimeout(250);
      continue;
    }
  }

  const sq = await readSquad();
  maxSquad = Math.max(maxSquad, sq.members.length);
  recruited = sq.recruitedTotal;

  // 队里有人了就立刻测切换 —— 小弟会被野怪吃掉，拖久了可能减员到 0
  if (!switchTested && sq.members.length > 0) {
    const before = await readPlayer();
    log(`[3] 队里有人了（${sq.members.length} 只，累计收编 ${recruited}）→ 按 R`);
    log(`    切换前: 玩家身体=${before.name} 半径=${before.radius} @(${before.x},${before.y})`);
    log(`    成员: ${JSON.stringify((await readSquad()).members)}`);

    await page.keyboard.press('r');
    await page.waitForTimeout(120); // 直读真实状态，等一帧让 squadSystem 的冷却写回即可

    const after = await readPlayer();
    const sq2 = await readSquad();
    log(`    切换后: 玩家身体=${after.name} 半径=${after.radius} @(${after.x},${after.y})`);
    log(`    成员: ${JSON.stringify(sq2.members)}  冷却=${sq2.cooldown}`);

    const swapped = before.name !== after.name;
    log(`    -> 身体是否换过: ${swapped ? `✅ 是（${before.name} → ${after.name}）` : `⚠️ 否（可能成员与玩家同种，均为 ${before.name}）`}`);
    log(`    -> 位置是否对调: ${before.x === after.x && before.y === after.y ? '⚠️ 仍在原地（可疑）' : '✅ 已移动'}`);
    log(`    -> 是否存活: ${after.health > 0 ? '✅ 是' : '❌ 否'}`);

    // 冷却期内再按一次应无效（防连点）
    const beforeCd = await readPlayer();
    await page.keyboard.press('r');
    await page.waitForTimeout(80);
    const afterCd = await readPlayer();
    log(`    -> 冷却防连点: ${beforeCd.name === afterCd.name ? '✅ 第二次 R 被挡下' : '⚠️ 第二次 R 也生效了（冷却可能没兜住）'}`);

    switchTested = true;
    // 切换瞬间的实拍：能看到 HUD 战队面板 + 玩家已换成小弟的身体
    await page.screenshot({ path: 'scripts/squad-probe-swap.png' });
    break;
  }

  const prey = st.prey.sort(
    (a, b) => Math.hypot(a.x - st.p.x, a.y - st.p.y) - Math.hypot(b.x - st.p.x, b.y - st.p.y)
  )[0];

  if (prey) {
    for (let k = 0; k < 8; k++) {
      await steerTo(prey.x, prey.y);
      await page.waitForTimeout(55);
    }
  } else {
    // 附近没猎物：小范围绕圈找
    const ang = round * 0.9;
    await page.mouse.move(W / 2 + Math.cos(ang) * 380, H / 2 + Math.sin(ang) * 380);
    await page.waitForTimeout(120);
  }

  if (round % 5 === 0) {
    const s = await readSquad();
    log(`    第 ${round} 轮: 战队=${s.members.length}/10 累计收编=${s.recruitedTotal} 玩家=${st.p.name}`);
  }
}

const fin = await readSquad();
log(`[4] 结束：战队峰值=${maxSquad} 累计收编=${fin.recruitedTotal} 亡语夺舍次数=${fin.possessCount}`);
log(`    切换测试 ${switchTested ? '已执行' : '未执行（始终没捕到鱼）'}`);
log('[5] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 5), null, 2) : '无'));

await page.screenshot({ path: 'scripts/squad-probe.png' });
await browser.close();
