import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.stack ?? error.message));
await page.goto('http://127.0.0.1:3000/?renderer=pixi');
await page.locator('canvas[data-renderer="pixi"]').waitFor({ state: 'visible', timeout: 20_000 });
await page.getByRole('button', { name: '开始游戏', exact: true }).click();
await page.waitForTimeout(1_000);
await page.screenshot({ path: process.argv[2] ?? 'scripts/pxr03a-standard-fish.png' });
const metrics = await page.evaluate(() => window.__PIXI_PROBE__);
console.log(JSON.stringify({ errors, metrics }, null, 2));
await browser.close();
