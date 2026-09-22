import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:3000/previews/rare-fish.html');
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'scripts/rare-starry-clown.png' });
  await page.getByRole('button', { name: '查看游戏内大小' }).click();
  await page.getByRole('button', { name: '查看放大细节' }).waitFor();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(400);
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile overflow');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Preview animation, size toggle and narrow layout passed; no page errors.');
} finally { await browser.close(); }
