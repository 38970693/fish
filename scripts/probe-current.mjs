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
    const zone = state?.currents?.[0];
    if (!state || !zone) return null;
    state.player.x = zone.x;
    state.player.y = zone.y;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.speed = 0;
    state.portals = [];
    state.entities = [];
    state.obstacles = [];
    state.camera.x = zone.x;
    state.camera.y = zone.y;
    state.camera.zoom = 0.9;
    return { id: zone.id, name: zone.name, strength: zone.strength };
  });
  await page.waitForTimeout(500);
  const active = await page.evaluate(() => {
    const state = window.__FISH_DEBUG__?.state();
    return {
      currentZoneId: state?.player.currentZoneId,
      currentStrength: state?.player.currentStrength,
    };
  });
  if (renderer === 'pixi') await page.screenshot({ path: 'scripts/current-ingame.png' });
  results.push({ renderer, errors, setup, active });
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
if (results.some(result => result.errors.length || !result.setup || result.active.currentZoneId !== result.setup.id)) {
  process.exitCode = 1;
}
await browser.close();
