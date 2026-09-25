import { chromium } from '@playwright/test';

const recipes = ['CLOWN_FISH', 'BLUE_TANG', 'KOI', 'PUFFER', 'GREAT_WHITE'];
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/previews/morphology-lab.html');
  await page.locator('#pixi canvas').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '暂停游动' }).click();
  await page.getByRole('button', { name: '切换普通小丑鱼' }).click();

  const panels = [[], [], []];
  const grayPanels = [];
  for (const recipe of recipes) {
    await page.locator('#recipe-select').selectOption(recipe);
    if (recipe === 'CLOWN_FISH') await page.getByRole('button', { name: '切换普通小丑鱼' }).click();
    const appearance = { schemaVersion: 2, recipeId: recipe, seed: 20260923, genes: {}, parts: {} };
    await page.locator('#json').fill(JSON.stringify(appearance));
    await page.getByRole('button', { name: '导入' }).click();
    for (let lod = 0; lod < 3; lod += 1) {
      await page.waitForFunction(([expectedRecipe, expectedLod]) => {
        const text = document.querySelector('#diagnostics')?.textContent ?? '';
        const fins = text.match(/fins (-?\d+\.\d+)=(-?\d+\.\d+)/);
        return text.includes(`配方: ${expectedRecipe} /`) && text.includes(`LOD ${expectedLod}`)
          && text.includes('校验: 通过') && fins && fins[1] === fins[2];
      }, [recipe, lod]);
      await page.waitForTimeout(120);
      panels[lod].push({
        recipe,
        canvas: (await page.locator('#canvas').screenshot()).toString('base64'),
        pixi: (await page.locator('#pixi canvas').screenshot()).toString('base64'),
      });
      if (lod < 2) await page.locator('#lod').click();
    }
    await page.locator('#lod').click();
    await page.locator('#json').fill(JSON.stringify({
      ...appearance,
      material: { primaryColor: '#999999', secondaryColor: '#999999', patternId: 'NONE', scaleId: 'NONE', glow: 0 },
    }));
    await page.getByRole('button', { name: '导入' }).click();
    await page.waitForFunction(expected => {
      const text = document.querySelector('#diagnostics')?.textContent ?? '';
      return text.includes(`配方: ${expected} /`) && text.includes('花纹层: NONE') && text.includes('LOD 0');
    }, recipe);
    await page.waitForTimeout(120);
    grayPanels.push({
      recipe,
      canvas: (await page.locator('#canvas').screenshot()).toString('base64'),
      pixi: (await page.locator('#pixi canvas').screenshot()).toString('base64'),
    });
  }

  const gallery = await browser.newPage({ viewport: { width: 1330, height: 1520 }, deviceScaleFactor: 1 });
  const saveGallery = async (items, title, filename, grayscale = false) => {
    const rows = items.map(({ recipe, canvas, pixi }) => `
      <div class="name">${recipe}</div>
      <img src="data:image/png;base64,${canvas}">
      <img src="data:image/png;base64,${pixi}">
    `).join('');
    await gallery.setContent(`<html><style>
      body{margin:0;background:#0d2030;color:#e2e8f0;font:16px Arial;padding:18px}
      h1{margin:0 0 12px;font-size:22px} .grid{display:grid;grid-template-columns:125px 575px 575px;gap:8px;align-items:center}
      .head{font-weight:bold;color:#7dd3fc}.name{font-weight:bold;font-size:14px}
      img{width:575px;height:260px;object-fit:contain;background:#173348;border-radius:8px}
      .grayscale img{filter:grayscale(1)}
    </style><h1>${title}</h1><div class="grid ${grayscale ? 'grayscale' : ''}">
      <div></div><div class="head">Canvas</div><div class="head">PixiJS</div>${rows}</div></html>`);
    await gallery.locator('img').last().waitFor({ state: 'visible' });
    await gallery.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    await gallery.screenshot({ path: filename, fullPage: true });
  };
  for (let lod = 0; lod < 3; lod += 1) await saveGallery(panels[lod], `V3-05 五类物种 · LOD ${lod}`, `scripts/v3-05c-lod${lod}.png`);
  await saveGallery(grayPanels, 'V3-05 五类物种 · 统一灰材质 / 无花纹 / LOD 0', 'scripts/v3-05c-grayscale.png', true);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('V3-05 gallery passed: 5 recipes × 2 renderers × 3 LOD, paired motion and uniform gray material without pattern.');
} finally {
  await browser.close();
}
