import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.stack ?? error.message));
await page.goto('http://127.0.0.1:3000/?renderer=pixi');
await page.locator('canvas[data-renderer="pixi"]').waitFor({ state: 'visible', timeout: 20_000 });
const oceanMap = page.getByText('全球海域航图', { exact: true });
if (await oceanMap.isVisible().catch(() => false)) {
  await page.getByRole('button', { name: '选择海域 赤道暖海' }).click();
  await page.getByRole('button', { name: '驶入赤道暖海' }).click();
} else {
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
}
await page.waitForFunction(() => (window.__PIXI_PROBE__?.renderCount ?? 0) >= 8);
const gallery = await page.evaluate(() => {
  const debug = window.__FISH_DEBUG__;
  return debug?.shapeGallery();
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'scripts/pxr03b-shape-gallery.png' });
const metrics = await page.evaluate(() => window.__PIXI_PROBE__);
console.log(JSON.stringify({ errors, gallery, metrics }, null, 2));
await browser.close();
