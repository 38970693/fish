import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto('http://127.0.0.1:3000/previews/morphology-lab.html');
  await page.locator('#pixi canvas').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '暂停游动' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'scripts/fish-symmetry-canvas-pixi.png', fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Fish symmetry preview captured for Canvas and PixiJS.');
} finally {
  await browser.close();
}
