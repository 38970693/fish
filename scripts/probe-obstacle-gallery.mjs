import { chromium } from '@playwright/test';

const variants = [
  ['ROCK', 'rock-gallery-0'], ['ROCK', 'rock-gallery-3'], ['ROCK', 'rock-gallery-2'],
  ['CORAL', 'coral-gallery-3'], ['CORAL', 'coral-gallery-1'], ['CORAL', 'coral-gallery-0'],
  ['SEAWEED', 'seaweed-gallery-0'], ['SEAWEED', 'seaweed-gallery-2'], ['SEAWEED', 'seaweed-gallery-1'],
];

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  for (const renderer of ['pixi', 'canvas']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    await page.goto(`http://127.0.0.1:3000/?renderer=${renderer}`);
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
    await page.waitForFunction(() => window.__FISH_DEBUG__?.state()?.status === 'PLAYING');
    await page.evaluate(items => {
      const state = window.__FISH_DEBUG__.state();
      const centerX = 2000;
      const centerY = 2000;
      const xs = [1560, 2000, 2440];
      const ys = [1660, 2000, 2340];
      state.obstacles = items.map(([type, id], index) => ({
        type, id, radius: 100, x: xs[index % 3], y: ys[Math.floor(index / 3)],
      }));
      state.entities = [];
      state.hazards = [];
      state.powerUps = [];
      state.treasures = [];
      state.buildings = [];
      state.portals = [];
      state.fountains = [];
      state.currents = [];
      state.player.x = centerX;
      state.player.y = centerY;
      state.player.radius = 0;
      state.player.speed = 0;
      state.player.vx = 0;
      state.player.vy = 0;
      state.player.health = 1_000_000;
      state.player.maxHealth = 1_000_000;
      state.camera.x = centerX;
      state.camera.y = centerY;
      state.camera.zoom = 0.92;
    }, variants);
    await page.waitForTimeout(700);
    const canvas = page.locator('canvas').first();
    await canvas.screenshot({ path: `scripts/obstacle-gallery-${renderer}.png` });
    if (errors.length) throw new Error(`${renderer}: ${errors.join('\n')}`);
    console.log(`${renderer}: 9 obstacle variants rendered`);
    await page.close();
  }
} finally {
  await browser.close();
}
