import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'silent' });
await server.listen();
const address = server.httpServer?.address();
if (!address || typeof address === 'string') throw new Error('Preview server did not start');

let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  for (const [id, name] of [
    ['CLEAR', '赤道暖海'], ['CORAL', '珊瑚群岛'], ['ABYSS', '马里亚纳深海'],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/?renderer=pixi`);
    await page.getByRole('button', { name: `选择海域 ${name}` }).click();
    await page.locator('.menu-content').screenshot({ path: `previews/pond-design-menu-${id.toLowerCase()}.png` });
    await page.getByRole('button', { name: `驶入${name}` }).click();
    await page.waitForSelector('canvas[data-renderer="pixi"]');
    await page.evaluate(() => {
      const state = window.__FISH_DEBUG__.state();
      state.camera.x = 3000;
      state.camera.y = 3000;
      state.camera.zoom = 0.17;
    });
    await page.waitForTimeout(250);
    await page.locator('canvas[data-renderer="pixi"]').screenshot({ path: `previews/pond-design-world-${id.toLowerCase()}.png` });
    if (errors.length) throw new Error(`${id}: ${errors.join('; ')}`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
