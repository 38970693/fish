import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto('http://127.0.0.1:3000/previews/morphology-lab.html');
  await page.locator('#pixi canvas').waitFor({ state: 'visible' });
  await page.waitForTimeout(600);
  if (await page.locator('input[type=range]').count() < 12) throw new Error('Expected morphology gene sliders');
  if (await page.locator('select').count() < 7) throw new Error('Expected recipe, mode, pattern sample and part selectors');

  const before = await page.locator('#diagnostics').innerText();
  if (!before.includes('starry-bands:BANDS[3]') || !before.includes('starry-spots:SPOTS[23]')) {
    throw new Error(`Shared starry pattern layers missing:\n${before}`);
  }
  await page.screenshot({ path: 'scripts/v3-03-starry-pattern.png', fullPage: true });
  await page.getByRole('button', { name: '切换普通小丑鱼' }).click();
  await page.waitForFunction(() => document.querySelector('#diagnostics')?.textContent?.includes('clown-bands:BANDS[3]'));
  await page.screenshot({ path: 'scripts/v3-03-normal-pattern.png', fullPage: true });
  await page.getByRole('button', { name: '切换星夜小丑鱼' }).click();
  await page.locator('input[type=range]').first().evaluate(input => {
    input.value = '0.9'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#json')?.value.includes('"bodyLength": 0.9'));
  await page.waitForTimeout(100);
  const after = await page.locator('#diagnostics').innerText();
  if (before === after || !after.includes('边界:')) throw new Error('Gene slider did not update resolved morphology');

  await page.locator('#recipe-select').selectOption('EEL');
  await page.waitForTimeout(200);
  const eel = await page.locator('#diagnostics').innerText();
  if (!eel.includes('EEL / EEL') || !eel.includes('校验: 通过')) throw new Error(`EEL recipe failed:\n${eel}`);
  await page.getByRole('button', { name: 'LOD 0' }).click();
  await page.getByRole('button', { name: 'LOD 1' }).waitFor();
  await page.screenshot({ path: 'scripts/v3-03-lod1.png', fullPage: true });
  await page.getByRole('button', { name: 'LOD 1' }).click();
  await page.getByRole('button', { name: 'LOD 2' }).waitFor();
  await page.screenshot({ path: 'scripts/v3-03-lod2.png', fullPage: true });
  await page.getByRole('button', { name: 'LOD 2' }).click();
  await page.getByRole('button', { name: 'LOD 0' }).waitFor();
  await page.screenshot({ path: 'scripts/v3-03-lod0.png', fullPage: true });
  await page.locator('#recipe-select').selectOption('CLOWN_FISH');
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
  await page.locator('select[data-part-slot="pectoralLeft"]').selectOption('pectoral.sickle');
  await page.locator('select[data-part-slot="pelvicLeft"]').selectOption('pelvic.ribbon');
  await page.waitForFunction(() => {
    const text = document.querySelector('#diagnostics')?.textContent ?? '';
    return text.includes('pectoralRight=pectoral.sickle.right') && text.includes('pelvicRight=pelvic.ribbon.right');
  });
  await page.getByRole('button', { name: '关闭花纹' }).click();
  await page.screenshot({ path: 'scripts/v3-02-paired-organs.png', fullPage: true });
  await page.screenshot({ path: 'scripts/morphology-lab.png', fullPage: true });
  await page.getByRole('button', { name: '显示花纹' }).click();
  const samples = [
    ['CLOWN_BANDS', 'BANDS'], ['STARRY_CLOWN', 'SPOTS'], ['RING_SPOTS', 'SPOTS'],
    ['LATERAL_DOTS', 'LATERAL'], ['EDGE_TRIM', 'EDGE'], ['FLOW_SCALES', 'SCALES'],
  ];
  for (const [patternId, kind] of samples) {
    await page.locator('#pattern-sample-select').selectOption(patternId);
    await page.waitForFunction(expected => document.querySelector('#diagnostics')?.textContent?.includes(`:${expected}[`), kind);
    await page.screenshot({ path: `scripts/v3-03-sample-${patternId.toLowerCase()}.png`, fullPage: true });
  }
  await page.locator('#pattern-sample-select').selectOption('STARRY_CLOWN');
  const spotLayer = page.locator('fieldset[data-pattern-layer="starry-spots"]');
  await spotLayer.locator('[data-layer-control="density"]').evaluate(input => {
    input.value = '0.5'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await spotLayer.locator('[data-layer-control="scale"]').evaluate(input => {
    input.value = '1.5'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await spotLayer.locator('[data-layer-control="symmetry"]').selectOption('ASYMMETRIC');
  await spotLayer.locator('[data-layer-control="seedOffset"]').fill('17');
  await spotLayer.locator('[data-layer-control="seedOffset"]').dispatchEvent('change');
  await page.waitForFunction(() => {
    const value = document.querySelector('#json')?.value ?? '';
    const text = document.querySelector('#diagnostics')?.textContent ?? '';
    return value.includes('"seedOffset": 17') && value.includes('"density": 0.5') && text.includes('starry-spots:SPOTS[');
  });
  const exported = await page.locator('#json').inputValue();
  await page.locator('#json').fill(exported);
  await page.getByRole('button', { name: '导入' }).click();
  await page.waitForFunction(() => document.querySelector('fieldset[data-pattern-layer="starry-spots"] [data-layer-control="seedOffset"]')?.value === '17');
  await spotLayer.locator('[data-layer-control="solo"]').click();
  await page.waitForFunction(() => document.querySelector('#diagnostics')?.textContent?.includes('仅层 starry-spots'));
  await page.getByRole('button', { name: '显示遮罩' }).click();
  await page.getByRole('button', { name: '显示图元边界' }).click();
  await page.waitForFunction(() => document.querySelector('#diagnostics')?.textContent?.includes('遮罩 开 / 边界 开'));
  await page.screenshot({ path: 'scripts/v3-03-layer-controls.png', fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Morphology Lab passed: layer overrides, JSON roundtrip, six samples, dual renderers, paired organs and LOD 0/1/2.');
} finally {
  await browser.close();
}
