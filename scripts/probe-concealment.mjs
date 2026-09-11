// 水草掩体探针：真机验证「藏进水草能甩掉追杀」
//
// 三个场景，全部用 __FISH_DEBUG__.state() 直接改真实 gameState：
//   [A] 对照   —— 无草丛，愤怒的大鱼持续追杀（愤怒不清零、距离在缩短）
//   [B] 掩体   —— 玩家躲进半径 200 的水草里，大鱼愤怒清零 + 头顶冒「?」
//   [C] 贴脸   —— 草丛里但大鱼只隔 100px（< 识破距离 150），愤怒不清零
//                 → 证明「钻草丛不等于无敌」
//
// 为什么用 state() 而不是解析 HUD：HUD 每 100ms 才同步一次，改状态后立刻读会拿到旧快照。
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
});
page.on('response', (r) => {
  if (r.status() === 404) notFound.push(r.url());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('button:has-text("开始游戏")', { timeout: 15000 });
await page.click('button:has-text("开始游戏")');
await page.waitForTimeout(700);
// 鼠标压屏幕中心：玩家永远朝鼠标游，压在正中就基本原地不动，不会自己游出草丛
await page.mouse.move(640, 400);
await page.waitForTimeout(300);

/**
 * 把场面整理成「一条愤怒的大鱼 + 一个玩家」的干净实验台。
 * mode: 'control' 无草丛 | 'cover' 玩家站草丛正中 | 'face' 草丛里但大鱼贴到 100px
 */
const setup = (mode) =>
  page.evaluate((m) => {
    const s = window.__FISH_DEBUG__.state();
    const p = s.player;

    // 清掉会抢优先级的东西：肉块香味（优先级 1）和宝藏（优先级 2）
    s.treasures = [];
    s.powerUps = [];
    p.lureActive = false;
    p.camoActive = false;
    p.isHidden = false;
    p.health = p.maxHealth;
    // 玩家闭嘴：不设的话玩家会把这条诱饵鱼吃了（吞掉 = 追兵凭空消失，实验台就废了）
    p.biteCooldown = 9999;

    // 借一条主动攻击型的鱼当追兵；找不到就随便借一条
    let foe =
      s.entities.find((e) => e.config && e.config.behavior === 'AGGRESSIVE' && e.health > 0) ||
      s.entities.find((e) => e.health > 0);
    if (!foe) return { error: '场上没有任何可借用的鱼' };

    s.entities = [foe];
    foe.ownerId = null;
    foe.health = foe.maxHealth;
    foe.angle = Math.PI;
    foe.lureActive = false;
    foe.camoActive = false;
    foe.isHidden = false;
    foe.sonarTimer = 0; // 声呐会看穿隐蔽，先关掉
    foe.speechBubble = null;
    foe.angerTimer = 900; // 约 15s，足够跑完采样
    foe.schoolSkillCooldown = 9999; // 屏蔽大鱼反制技，别让它放技能干扰
    foe.biteCooldown = 9999; // 贴脸场景别真咬死玩家

    // 场地里已有的水草全部清掉，保证对照组干净
    s.obstacles = s.obstacles.filter((o) => o.type !== 'SEAWEED');

    const gap = m === 'face' ? 100 : 400;
    foe.x = p.x + gap;
    foe.y = p.y;

    if (m === 'cover' || m === 'face') {
      s.obstacles.push({ id: 'probe-weed', x: p.x, y: p.y, radius: 200, type: 'SEAWEED' });
    }

    return {
      foeId: foe.id,
      foeType: foe.type,
      foeBehavior: foe.config.behavior,
      gap: Math.round(Math.hypot(foe.x - p.x, foe.y - p.y)),
      player: { x: Math.round(p.x), y: Math.round(p.y) },
    };
  }, mode);

const read = (foeId) =>
  page.evaluate((id) => {
    const s = window.__FISH_DEBUG__.state();
    const p = s.player;
    const foe = s.entities.find((e) => e.id === id);
    return {
      inCover: !!p.inCover,
      anger: foe ? foe.angerTimer || 0 : -1,
      foeAlive: !!foe,
      bubble: foe && foe.speechBubble ? foe.speechBubble.text : null,
      foeDist: foe ? Math.round(Math.hypot(foe.x - p.x, foe.y - p.y)) : -1,
      status: s.status,
    };
  }, foeId);

let failed = 0;
const check = (ok, label, detail) => {
  log(`   ${ok ? '✅' : '❌'} ${label}${detail ? ' —— ' + detail : ''}`);
  if (!ok) failed++;
};

/* ───────── [A] 对照：无草丛，愤怒追杀应当持续 ───────── */
log('[A] 对照组：无草丛，愤怒大鱼应当一路追过来');
const a = await setup('control');
log(`   借到追兵 ${a.foeType}（${a.foeBehavior}），初始间距 ${a.gap}px`);
const a0 = await read(a.foeId);
await page.waitForTimeout(800);
const a1 = await read(a.foeId);
log(`   起始 inCover=${a0.inCover} anger=${a0.anger} dist=${a0.foeDist}`);
log(`   0.8s后 inCover=${a1.inCover} anger=${a1.anger} dist=${a1.foeDist} bubble=${JSON.stringify(a1.bubble)}`);
check(!a0.inCover && !a1.inCover, '无草丛时 inCover 应为 false');
check(a1.anger > 0, '无草丛时愤怒不应清零', `anger=${a1.anger}`);
check(a1.foeDist < a0.foeDist, '无草丛时大鱼应当越追越近', `${a0.foeDist} → ${a1.foeDist}`);

/* ───────── [B] 掩体：躲进水草，愤怒清零 ───────── */
log('[B] 掩体组：玩家躲进半径 200 的水草，愤怒应当清零 + 冒「?」');
const b = await setup('cover');
// ⚠️ 冒泡 timer 只有 45 帧（0.75s），必须早采样；等 900ms 再看就只剩 null 了（踩过）
await page.waitForTimeout(250);
const b0 = await read(b.foeId);
await page.screenshot({ path: 'scripts/concealment-probe.png' });
await page.waitForTimeout(900);
const b1 = await read(b.foeId);
log(`   0.25s后 inCover=${b0.inCover} anger=${b0.anger} dist=${b0.foeDist} bubble=${JSON.stringify(b0.bubble)}`);
log(`   1.15s后 inCover=${b1.inCover} anger=${b1.anger} dist=${b1.foeDist} bubble=${JSON.stringify(b1.bubble)}`);
check(b0.inCover, '躲进水草后 inCover 应为 true');
check(b0.anger === 0, '躲进水草后愤怒应当清零', `anger=${b0.anger}`);
check(b0.bubble === '?', '应当冒出「?」表示跟丢了', `bubble=${JSON.stringify(b0.bubble)}`);
check(b1.inCover && b1.anger === 0, '站在草丛里愤怒应保持清零，不会自己恢复', `anger=${b1.anger}`);
check(b1.foeAlive, '追兵不应凭空消失');

/* ───────── [C] 贴脸：草丛里也藏不住 ───────── */
log('[C] 贴脸组：草丛里但只隔 100px（< 150 识破距离），愤怒不应清零');
const c = await setup('face');
const c0 = await read(c.foeId);
await page.waitForTimeout(900);
const c1 = await read(c.foeId);
log(`   起始 inCover=${c0.inCover} anger=${c0.anger} dist=${c0.foeDist}`);
log(`   0.9s后 inCover=${c1.inCover} anger=${c1.anger} dist=${c1.foeDist} bubble=${JSON.stringify(c1.bubble)}`);
check(c1.inCover, '贴脸场景玩家同样在水草里');
check(c1.foeAlive, '贴脸场景追兵不应消失');
check(c1.anger > 0, '贴脸时愤怒不应清零（草丛不等于无敌）', `anger=${c1.anger}`);
await page.screenshot({ path: 'scripts/concealment-probe-closeup.png' });

log('[D] 404 资源: ' + (notFound.length ? JSON.stringify([...new Set(notFound)]) : '无'));
log('[E] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 6), null, 2) : '无'));
log(failed === 0 ? '\n🎉 全部断言通过' : `\n💥 ${failed} 条断言失败`);

await browser.close();
// 404 单独统计（多为 favicon 之类），只有真正的 pageerror / console.error 才算失败
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
