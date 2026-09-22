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
  state.player.invulnerableTimer = 999999;
  const kraken = state.entities.find((entity) => entity.health > 0);
  if (!kraken) throw new Error('Generated world did not contain a renderable entity');
  state.entities.forEach((entity) => {
    if (entity !== kraken) entity.health = 0;
  });
  kraken.type = 'KRAKEN';
  kraken.config = { ...kraken.config, type: 'KRAKEN', name: '视觉复查海怪', shape: 'KRAKEN', color: '#991b1b' };
  kraken.radius = 120;
  kraken.renderScale = 1;
  kraken.cosmetics = { ...kraken.cosmetics, skinColor: '#991b1b', pattern: 'NONE' };
  kraken.x = state.player.x + 260;
  kraken.y = state.player.y;
  kraken.vx = 0;
  kraken.vy = 0;
  kraken.angle = Math.PI;
  kraken.semiGhostTimer = 999999;
});

await page.waitForTimeout(200);
await page.screenshot({ path: path.join(root, 'scripts', 'kraken-render-fixed.png') });
await browser.close();
console.log('wrote scripts/kraken-render-fixed.png');
