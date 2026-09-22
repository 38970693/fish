import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  for (const renderer of ['pixi', 'canvas']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    await page.goto(`http://127.0.0.1:3000/?renderer=${renderer}`);
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
    await page.waitForFunction(() => window.__FISH_DEBUG__?.state()?.status === 'PLAYING');
    await page.evaluate(() => {
      const state = window.__FISH_DEBUG__.state();
      state.obstacles = [
        { id: 'eco-brittle', x: 1700, y: 1780, radius: 105, type: 'ROCK', feature: 'BRITTLE', featureState: 'IDLE', durability: 100, maxDurability: 100 },
        { id: 'eco-broken', x: 2200, y: 1780, radius: 105, type: 'ROCK', feature: 'BRITTLE', featureState: 'BROKEN', durability: 0, maxDurability: 100 },
        { id: 'eco-warning', x: 1650, y: 2260, radius: 105, type: 'ROCK', feature: 'VENT', featureState: 'WARNING', featureTimer: 42 },
        { id: 'eco-active', x: 2250, y: 2260, radius: 105, type: 'ROCK', feature: 'VENT', featureState: 'ACTIVE', featureTimer: 9999 },
      ];
      state.entities = [];
      state.hazards = [];
      state.powerUps = [];
      state.treasures = [];
      state.buildings = [];
      state.portals = [];
      state.fountains = [];
      state.currents = [];
      state.player.x = 1980;
      state.player.y = 2000;
      state.player.radius = 10;
      state.player.speed = 0;
      state.player.vx = 0;
      state.player.vy = 0;
      state.player.health = 1_000_000;
      state.player.maxHealth = 1_000_000;
      state.camera.x = 1980;
      state.camera.y = 2000;
      state.camera.zoom = 0.92;
    });
    await page.waitForTimeout(180);
    await page.locator('canvas').first().screenshot({ path: `scripts/obstacle-ecology-${renderer}.png` });
    if (errors.length) throw new Error(`${renderer}: ${errors.join('\n')}`);
    console.log(`${renderer}: ecology obstacle states rendered`);
    await page.close();
  }
} finally {
  await browser.close();
}
