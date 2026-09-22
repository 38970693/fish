import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const results = [];
for (const renderer of ['pixi', 'canvas']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:3000/?renderer=${renderer}`);
  await page.locator(`canvas[data-renderer="${renderer}"]`).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  if (renderer === 'pixi') await page.waitForFunction(() => (window.__PIXI_PROBE__?.renderCount ?? 0) >= 8);
  const gallery = await page.evaluate(() => window.__FISH_DEBUG__?.rareFishGallery());
  await page.waitForTimeout(700);
  if (renderer === 'pixi') await page.screenshot({ path: 'scripts/rare-starry-clown-ingame.png' });
  results.push({ renderer, errors, gallery });
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
if (results.some(result => result.errors.length || result.gallery?.rare !== '星夜小丑鱼')) process.exitCode = 1;
await browser.close();
