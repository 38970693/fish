/** Close-up Canvas/Pixi appearance check with an isolated, fresh Vite server. */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'silent' });
await server.listen();
const address = server.httpServer?.address();
if (!address || typeof address === 'string') throw new Error('Preview server did not bind');
let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/previews/morphology-lab.html`);
  await page.locator('#toggle-motion').click();
  await page.locator('#recipe-select').selectOption('BLUE_TANG');
  await page.locator('.views canvas').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  await page.locator('.views').screenshot({ path: 'scripts/cute-face-canvas-pixi.png' });
  if (errors.length) throw new Error(`Preview errors: ${errors.join('; ')}`);
  console.log('Saved scripts/cute-face-canvas-pixi.png');
} finally {
  await browser?.close();
  await server.close();
}
