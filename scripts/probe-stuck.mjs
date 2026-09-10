// 一次跑完：开局 -> 采样 25s -> 若死亡则点"复活" -> 验证是否回到 PLAYING
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });

// 等开始按钮
await page.waitForSelector('text=开始游戏', { timeout: 15000 });
log('[1] 菜单已出现，点击开始游戏');
await page.click('text=开始游戏');
await page.waitForTimeout(500);

// 让鱼朝屏幕中心游（避免撞边）
await page.mouse.move(640, 400);

const probe = async () => page.evaluate(() => {
  const t = document.body.innerText;
  return {
    dead: t.includes('战斗失败'),
    menu: t.includes('开始游戏'),
    shop: t.includes('换装') || t.includes('商场') || t.includes('商城'),
    victory: t.includes('胜利'),
    // HUD 里的血条/体重等
    hud: (t.match(/体重[^\n]*/) || [''])[0].slice(0, 60),
    countdown: (t.match(/(\d+)\s*s/) || [])[1] || null,
  };
});

log('[2] 开始 25s 采样（每 2s 一次）');
let died = false, dieAt = null;
for (let i = 1; i <= 13; i++) {
  await page.waitForTimeout(2000);
  const s = await probe();
  log(`   t=${i * 2}s  dead=${s.dead} shop=${s.shop} victory=${s.victory} hud="${s.hud}" cd=${s.countdown}`);
  if (s.dead && !died) { died = true; dieAt = i * 2; break; }
}

if (died) {
  log(`[3] 检测到战斗失败（t=${dieAt}s），点击"复活"按钮`);
  // 注意：死亡界面正文里有"已复活 0 次"，也含"复活"二字，
  // 用 button:has-text 精确命中按钮，否则会点到一个 <p> 上白点一次
  const reviveBtn = page.locator('button:has-text("复活")');
  log(`   匹配到的按钮数 = ${await reviveBtn.count()}`);
  await reviveBtn.first().click();
  await page.waitForTimeout(1500);
  const s = await probe();
  log(`   复活后: dead=${s.dead} hud="${s.hud}"  -> ${s.dead ? '❌ 仍卡在死亡界面' : '✅ 已回到游戏'}`);

  // 再跑 6s 看是否能正常游玩
  for (let i = 1; i <= 3; i++) {
    await page.waitForTimeout(2000);
    const s2 = await probe();
    log(`   复活后 t=${i * 2}s dead=${s2.dead} hud="${s2.hud}"`);
  }
} else {
  log('[3] 25s 内未死亡 —— 未在本次采样中复现卡死');
}

log('[4] 页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 6), null, 2) : '无'));

await page.screenshot({ path: 'scripts/stuck-probe.png' });
await browser.close();
