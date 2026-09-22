import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://127.0.0.1:3000/?mode=rivals', { waitUntil: 'load' });
await page.getByRole('button', { name: /开始游戏/ }).click();
await page.getByText(/玩家 \(/).waitFor();
await page.evaluate(() => {
  const state = window.__FISH_DEBUG__.state();
  state.player.isGodMode = false;
  state.player.invulnerableTimer = 999999;
});
await page.screenshot({ path: path.join(root, 'scripts', 'g2-opening.png') });

await page.evaluate(() => {
  const debug = window.__FISH_DEBUG__;
  const state = debug.state();
  state.obstacles = [];
  state.buildings = [];
  state.feedingEvent.timer = 1;
  debug.profile(2);
});
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(root, 'scripts', 'g2-warning.png') });

await page.evaluate(() => {
  const debug = window.__FISH_DEBUG__;
  const state = debug.state();
  state.feedingEvent.phase = 'DROPPING';
  state.feedingEvent.timer = 1500;
  state.player.health = state.player.maxHealth * 0.4;
  const ambushers = state.entities.filter((entity) => entity.ownerId === 'rival-ambushers');
  ambushers.forEach((entity, index) => {
    entity.x = state.player.x + 170 + index * 35;
    entity.y = state.player.y + (index - 1) * 45;
    entity.semiGhostTimer = 0;
  });
  debug.profile(2);
});
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(root, 'scripts', 'g2-danger.png') });

await browser.close();
console.log('wrote scripts/g2-opening.png, scripts/g2-warning.png, scripts/g2-danger.png');
