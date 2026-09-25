import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/previews/morphology-lab.html');
  await page.locator('#pixi canvas').waitFor({ state: 'visible' });
  await page.locator('#perf-refresh').click();
  await page.waitForFunction(() => document.querySelector('#perf-report')?.textContent?.includes('预算放行'));
  const report = await page.locator('#perf-report').innerText();
  if (!report.includes('natural-calm') || !report.includes('three-team-contest') || !report.includes('LOD2 动画更新 0')) {
    throw new Error(`Performance panel incomplete:\n${report}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await page.screenshot({ path: 'scripts/v3-06-performance-panel.png', fullPage: true });
  console.log('V3-06 performance panel passed: both 300-entity scenarios and resource budgets visible.');
} finally {
  await browser.close();
}
