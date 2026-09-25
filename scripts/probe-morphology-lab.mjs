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
  if (!before.includes('镜像误差: 轮廓 0.00000r / 插槽 0.00000r') || !before.includes('成对插槽: 胸鳍')) {
    throw new Error(`Symmetry diagnostics missing or nonzero:\n${before}`);
  }
  await page.getByRole('button', { name: '显示中轴' }).click();
  if (await page.locator('.view.axis-on').count() !== 2) throw new Error('Axis overlay must cover both renderers');
  await page.screenshot({ path: 'scripts/v3-06a-symmetry.png', fullPage: true });
  await page.getByRole('button', { name: '隐藏中轴' }).click();
  await page.getByRole('button', { name: '暂停游动' }).click();
  const appearanceJson = await page.locator('#json').inputValue();
  const canvasBefore = await page.locator('#canvas').screenshot();
  const pixiBefore = await page.locator('#pixi canvas').screenshot();
  await page.locator('[data-surface-layer="FLANK_SHADE"]').uncheck();
  await page.waitForFunction(() => document.querySelector('#diagnostics')?.textContent?.includes('FLANK_SHADE=关'));
  await page.waitForTimeout(100);
  if (canvasBefore.equals(await page.locator('#canvas').screenshot())) throw new Error('Canvas surface toggle did not change pixels');
  if (pixiBefore.equals(await page.locator('#pixi canvas').screenshot())) throw new Error('Pixi surface toggle did not change pixels');
  if (await page.locator('#json').inputValue() !== appearanceJson) throw new Error('Preview surface toggle changed saved appearance');
  await page.locator('[data-surface-layer="FLANK_SHADE"]').check();
  await page.waitForFunction(() => document.querySelector('#diagnostics')?.textContent?.includes('FLANK_SHADE=开'));
  await page.getByRole('button', { name: '继续游动' }).click();
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

  for (const [recipeId, patternId, leftFin, rightFin, screenshot] of [
    ['BLUE_TANG', 'edge-trim:EDGE[', 'pectoral.sickle', 'pectoral.sickle.right', 'scripts/v3-05-blue-tang.png'],
    ['KOI', 'ring-spots:SPOTS[', 'pectoral.long', 'pectoral.long.right', 'scripts/v3-05-koi.png'],
    ['PUFFER', 'ring-spots:SPOTS[', 'pectoral.classic', 'pectoral.classic.right', 'scripts/v3-05-puffer.png'],
    ['GREAT_WHITE', 'lateral-dots:LATERAL[', 'pectoral.sickle', 'pectoral.sickle.right', 'scripts/v3-05-great-white.png'],
  ]) {
    await page.locator('#recipe-select').selectOption(recipeId);
    await page.waitForFunction(([recipe, pattern, left, right]) => {
      const text = document.querySelector('#diagnostics')?.textContent ?? '';
      return text.includes(`配方: ${recipe} /`) && text.includes(pattern)
        && text.includes(`pectoralLeft=${left}`) && text.includes(`pectoralRight=${right}`);
    }, [recipeId, patternId, leftFin, rightFin]);
    await page.screenshot({ path: screenshot, fullPage: true });
  }

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
  await spotLayer.locator('[data-layer-control="solo"]').click();
  const motionStates = ['IDLE', 'CRUISE', 'TURN', 'BRAKE', 'BOOST', 'HIT'];
  for (const state of motionStates) {
    await page.locator(`[data-motion-preset="${state}"]`).click();
    if (await page.locator(`[data-motion-preset="${state}"]`).getAttribute('aria-pressed') !== 'true') throw new Error(`${state} button not active`);
    await page.waitForFunction(expected => {
      const text = document.querySelector('#diagnostics')?.textContent ?? '';
      const match = text.match(/fins (-?\d+\.\d+)=(-?\d+\.\d+)/);
      return text.includes(`动作: ${expected}`) && match && match[1] === match[2];
    }, state);
    await page.screenshot({ path: `scripts/v3-04-motion-${state.toLowerCase()}.png`, fullPage: true });
  }
  const brakeText = await page.locator('#diagnostics').innerText();
  await page.locator('#motion-preset-select').selectOption('BRAKE');
  await page.waitForFunction(() => document.querySelector('#diagnostics')?.textContent?.includes('brake 开'));
  await page.locator('#motion-preset-select').selectOption('HIT');
  await page.waitForFunction(() => document.querySelector('#diagnostics')?.textContent?.includes('hit 1.00'));
  if (!brakeText.includes('fins ')) throw new Error('Motion diagnostics missing mirrored fin amplitudes');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Morphology Lab passed: species samples, pattern layers, JSON roundtrip, mirrored motion presets, dual renderers and LOD 0/1/2.');
} finally {
  await browser.close();
}
