import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const results = [];
for (const renderer of ['pixi', 'canvas']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:3000/?renderer=${renderer}`);
  await page.locator(`canvas[data-renderer="${renderer}"]`).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  const setup = await page.evaluate(() => {
    const state = window.__FISH_DEBUG__?.state();
    if (!state?.exploration) return null;
    const x = 3000;
    const y = 3000;
    state.pondId = 'ABYSS';
    state.player.x = x - 150;
    state.player.y = y;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.speed = 0;
    state.camera.x = x;
    state.camera.y = y;
    state.camera.zoom = 0.9;
    // 填满共享实体预算，避免随机刷怪让截图中的持续交互被偶然打断。
    state.entities = Array.from({ length: 300 }, (_, index) => ({
      ...state.player,
      id: `probe-budget-${index}`,
      ownerId: 'probe-budget',
      x: 500,
      y: 500,
      radius: 5,
      health: 1,
      maxHealth: 1,
      speed: 0,
      vx: 0,
      vy: 0,
      cosmetics: { ...state.player.cosmetics },
    }));
    state.obstacles = [];
    state.portals = [];
    state.currents = [];
    state.buildings = [{ id: 'probe-wreck', x, y, radius: 170, type: 'SHIPWRECK', cooldown: 0 }];
    Object.assign(state.exploration, {
      id: null, phase: 'IDLE', targetBuildingId: null, timer: 0,
      duration: 180, startHitCounter: 0, interactHeld: false,
      claimedByPond: {}, lastResult: null,
    });
    return { radius: state.player.radius };
  });
  await page.waitForTimeout(250);
  await page.keyboard.down('e');
  await page.waitForTimeout(120);
  await page.keyboard.up('e');
  await page.waitForFunction(() => window.__FISH_DEBUG__?.state()?.exploration?.phase === 'SEARCHING');
  await page.waitForTimeout(900);
  if (renderer === 'pixi') await page.screenshot({ path: 'scripts/shipwreck-search-ingame.png' });
  const searching = await page.evaluate(() => {
    const state = window.__FISH_DEBUG__?.state();
    return { phase: state?.exploration?.phase, timer: state?.exploration?.timer, progress: state?.buildings?.[0]?.activity?.progress };
  });
  await page.waitForFunction(() => window.__FISH_DEBUG__?.state()?.exploration?.phase === 'COMPLETED', null, { timeout: 6_000 });
  await page.waitForTimeout(150);
  if (renderer === 'pixi') await page.screenshot({ path: 'scripts/shipwreck-complete-ingame.png' });
  const completed = await page.evaluate(() => {
    const state = window.__FISH_DEBUG__?.state();
    return {
      phase: state?.exploration?.phase,
      claimed: state?.exploration?.claimedByPond?.ABYSS,
      score: state?.score,
      coins: state?.powerUps?.filter(item => item.type === 'COIN').length,
      ambushers: state?.entities?.filter(entity => entity.type === 'VAMPIRE_SQUID' && entity.angerTimer > 0).length,
    };
  });
  results.push({ renderer, errors, setup, searching, completed });
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
if (results.some(result => result.errors.length || !result.setup || result.searching.phase !== 'SEARCHING'
    || result.completed.phase !== 'COMPLETED' || !result.completed.claimed)) {
  process.exitCode = 1;
}
await browser.close();
