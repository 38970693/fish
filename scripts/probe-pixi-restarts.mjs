import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
const samples = [];

for (let index = 0; index < 20; index += 1) {
  await page.goto(`http://127.0.0.1:3000/?renderer=pixi&restart=${index}`);
  await page.locator('canvas[data-renderer="pixi"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => (window.__PIXI_PROBE__?.renderCount ?? 0) >= 8, null, { timeout: 10_000 });
  samples.push(await page.evaluate(() => ({
    renderCount: window.__PIXI_PROBE__?.renderCount,
    renderErrorCount: window.__PIXI_PROBE__?.renderErrorCount,
    tickerStarted: window.__PIXI_PROBE__?.tickerStarted,
    canvases: document.querySelectorAll('canvas[data-renderer="pixi"]').length,
  })));
}

const report = { measuredAt: new Date().toISOString(), iterations: samples.length, pageErrors, samples };
await writeFile('scripts/pxr05b-restarts.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (pageErrors.length || samples.some(sample => sample.canvases !== 1 || sample.tickerStarted)) process.exitCode = 1;
await browser.close();
