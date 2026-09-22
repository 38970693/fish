import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.stack ?? error.message));
await page.goto('http://127.0.0.1:3000/?renderer=pixi');
await page.locator('canvas[data-renderer="pixi"]').waitFor({ state: 'visible', timeout: 20_000 });
await page.getByRole('button', { name: '开始游戏', exact: true }).click();
await page.waitForFunction(() => (window.__PIXI_PROBE__?.renderCount ?? 0) >= 8);
const fixture = await page.evaluate(() => {
  window.__FISH_DEBUG__?.pixiFeedbackGallery();
  return window.__FISH_DEBUG__?.pixiLabelsGallery();
});
await page.waitForFunction(() => (window.__PIXI_PROBE__?.visibleSpeechBubbles ?? 0) >= 3);
await page.screenshot({ path: 'scripts/pxr04b-labels-gallery.png' });
const metrics = await page.evaluate(() => window.__PIXI_PROBE__);
console.log(JSON.stringify({ errors, fixture, metrics }, null, 2));
await browser.close();
