import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.stack ?? error.message));
await page.goto('http://127.0.0.1:3000/?renderer=pixi');
await page.locator('canvas[data-renderer="pixi"]').waitFor({ state: 'visible', timeout: 20_000 });
await page.getByRole('button', { name: '开始游戏', exact: true }).click();
await page.waitForFunction(() => (window.__PIXI_PROBE__?.renderCount ?? 0) >= 8);
const scene = await page.evaluate(() => window.__FISH_DEBUG__?.pixiLodStressScene(false));
await page.waitForFunction(() => (window.__PIXI_PROBE__?.visibleCreatures ?? 0) >= 295, null, { timeout: 20_000 });
await page.waitForTimeout(1_000);
const metrics = await page.evaluate(() => ({ ...window.__PIXI_PROBE__, forceContextLoss: undefined }));
await page.screenshot({ path: 'scripts/pxr05b-lod-gallery.png' });
console.log(JSON.stringify({ errors, scene, metrics }, null, 2));
if (errors.length || metrics.lod0Creatures < 4 || metrics.lod1Creatures < 12 || metrics.lod2Creatures < 270) process.exitCode = 1;
await browser.close();
