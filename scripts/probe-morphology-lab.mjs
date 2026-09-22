import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto('http://127.0.0.1:3000/previews/morphology-lab.html');
  await page.locator('#pixi canvas').waitFor({ state: 'visible' });
  await page.waitForTimeout(600);
  if (await page.locator('input[type=range]').count() !== 12) throw new Error('Expected 12 morphology gene sliders');
  if (await page.locator('select').count() !== 6) throw new Error('Expected recipe and mode selectors plus four part selectors');

  const before = await page.locator('#diagnostics').innerText();
  await page.locator('input[type=range]').first().evaluate(input => {
    input.value = '0.9'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#json')?.value.includes('"bodyLength": 0.9'));
  await page.waitForTimeout(100);
  const after = await page.locator('#diagnostics').innerText();
  if (before === after || !after.includes('边界:')) throw new Error('Gene slider did not update resolved morphology');

  await page.locator('select').first().selectOption('EEL');
  await page.waitForTimeout(200);
  const eel = await page.locator('#diagnostics').innerText();
  if (!eel.includes('EEL / EEL') || !eel.includes('校验: 通过')) throw new Error(`EEL recipe failed:\n${eel}`);
  await page.getByRole('button', { name: 'LOD 0' }).click();
  await page.getByRole('button', { name: 'LOD 1' }).waitFor();
  await page.getByRole('button', { name: 'LOD 1' }).click();
  await page.getByRole('button', { name: 'LOD 0' }).waitFor();
  await page.locator('select').first().selectOption('CLOWN_FISH');
  await page.getByRole('button', { name: '关闭花纹' }).click();
  await page.waitForFunction(() => document.querySelector('#diagnostics')?.textContent?.includes('视图: 无花纹'));
  await page.getByRole('button', { name: '仅看体积' }).click();
  await page.waitForFunction(() => document.querySelector('#diagnostics')?.textContent?.includes('视图: 仅体积'));
  await page.screenshot({ path: 'scripts/v3-01-starry-volume.png', fullPage: true });
  await page.getByRole('button', { name: '切换普通小丑鱼' }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'scripts/v3-01-normal-volume.png', fullPage: true });
  await page.getByRole('button', { name: '显示完整外观' }).click();
  await page.getByRole('button', { name: '显示花纹' }).click();
  await page.screenshot({ path: 'scripts/morphology-lab.png', fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Morphology Lab passed: dual renderer volume views, pattern/volume toggles, fixed variants, recipes, diagnostics and LOD controls.');
} finally {
  await browser.close();
}
