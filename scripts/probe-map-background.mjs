/** Browser-level regression for the screen-fixed horizontal map color seam. */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const viewport = { width: 846, height: 474 };
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'silent' });
await server.listen();
const address = server.httpServer?.address();
if (!address || typeof address === 'string') throw new Error('Background probe server did not bind');
let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/?renderer=pixi`);
  await page.getByRole('button', { name: /驶入/ }).click();
  await page.waitForSelector('canvas[data-renderer="pixi"]');
  await page.evaluate(() => {
    const state = window.__FISH_DEBUG__.state();
    state.status = 'EVOLVING';
    state.entities = [];
    state.obstacles = [];
    state.currents = [];
    state.particles = [];
    state.labels = [];
    state.powerUps = [];
    state.treasures = [];
    state.fountains = [];
    state.buildings = [];
    state.portals = [];
    const canvas = document.querySelector('canvas[data-renderer="pixi"]');
    for (let node = canvas; node?.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node) sibling.style.visibility = 'hidden';
      }
    }
  });
  await page.waitForTimeout(300);
  const png = await page.locator('canvas[data-renderer="pixi"]').screenshot({ path: 'scripts/map-background-seam-pixi.png' });
  const scan = await page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const x = Math.floor(image.width * 0.2);
    const at = y => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    const rows = Array.from({ length: image.height - 1 }, (_, y) => {
      const a = at(y); const b = at(y + 1);
      return { y, delta: Math.max(...a.map((value, channel) => Math.abs(value - b[channel]))) };
    }).filter(row => row.y >= image.height * 0.4 && row.y <= image.height * 0.5);
    return { width: image.width, height: image.height, worst: rows.sort((a, b) => b.delta - a.delta).slice(0, 5) };
  }, png.toString('base64'));
  console.log(JSON.stringify(scan));
  if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
  if (scan.worst[0].delta > 8) throw new Error(`Hard horizontal map seam: Δ${scan.worst[0].delta} at y=${scan.worst[0].y}`);
} finally {
  await browser?.close();
  await server.close();
}
