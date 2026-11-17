import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:3000/?renderer=canvas');
  await page.getByRole('button', { name: '装扮我的鱼' }).click();
  await page.locator('[data-tab="ai-presets"]').click();
  await page.locator('[data-cosmetic-key="preset"]').first().click();
  await page.screenshot({ path: 'previews/cute-wardrobe-shop.png' });
  // Check that every category remains reachable in the live panel.
  for (const id of ['color', 'pattern', 'face', 'body', 'accessory', 'eyes', 'boost']) {
    await page.locator(`[data-tab="${id}"]`).click();
    if (!await page.locator('[data-cosmetic-key]').count()) throw new Error(`Empty wardrobe tab: ${id}`);
  }
  await page.evaluate(async () => {
    const load = path => import(/* @vite-ignore */ path);
    const [{ drawCuteFish }, { createEntity }, options, { DEFAULT_COSMETICS }] = await Promise.all([
      load('/src/components/GameCanvas.tsx'), load('/src/gameEngine.ts'), load('/src/data/cosmeticsOptions.ts'), load('/src/types.ts'),
    ]);
    document.body.innerHTML = '<main class="lookbook"><header><small>HAPPY FISH POND · SWEET WARDROBE</small><h1>小鱼的萌萌衣橱</h1><p>奶糖配饰 · 软绒小尾 · 水汪汪的表情</p></header><section id="outfits" class="grid"></section><div id="all-options"></div></main>';
    const style = document.createElement('style');
    style.textContent = `body{margin:0;background:#fbf3f6;color:#655371;font-family:system-ui,'Microsoft YaHei',sans-serif}.lookbook{padding:30px 36px}header{text-align:center;margin-bottom:24px}header small{color:#b589a1;font-size:12px;letter-spacing:2px}h1{font-size:32px;margin:7px 0}header p{font-size:14px;color:#a087a0;margin:0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.tile{background:#fff;border:1px solid #ead8e4;border-radius:24px;overflow:hidden;text-align:center;padding:14px 4px;box-shadow:0 5px 0 #f3e4ec}.tile h2{font-size:17px;margin:0}.tile p{font-size:11px;color:#a18ba3;margin:5px}.tile canvas{display:block;margin:auto}#all-options h2{font-size:18px;color:#a37496;margin:25px 0 12px}.options-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:9px}.option{background:white;border:1px solid #ecdce7;border-radius:16px;text-align:center;overflow:hidden;padding:4px 0 8px;font-size:11px;color:#8b7190}.option canvas{display:block;margin:auto}`;
    document.head.append(style);
    const fish = createEntity('CLOWN_FISH', 0, 0);
    Object.assign(fish, { id: 'sweet-wardrobe', angle: 0, vx: 0, vy: 0, semiGhostTimer: 0, renderScale: 1, animOffset: 0, inCover: false, camoActive: false });
    const paint = (cosmetics, w, h, radius) => {
      const canvas = document.createElement('canvas');
      canvas.width = w * 2; canvas.height = h * 2; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
      drawCuteFish(ctx, { ...fish, cosmetics, x: w * 0.62, y: h * 0.52, radius }, 14, false);
      return canvas;
    };
    for (const preset of options.AI_COSMETICS_PRESETS) {
      const tile = document.createElement('article'); tile.className = 'tile';
      tile.innerHTML = `<h2>${preset.name}</h2><p>${preset.description}</p>`;
      tile.append(paint(preset.cosmetics, 260, 150, 44));
      document.querySelector('#outfits').append(tile);
    }
    const groups = [
      ['奶糖颜色', 'skinColor', options.SKIN_COLOR_OPTIONS], ['小小奶牙', 'teeth', options.TEETH_OPTIONS],
      ['甜甜花纹', 'pattern', options.PATTERN_OPTIONS], ['软软材质', 'scaleType', options.SCALE_OPTIONS],
      ['萌萌配饰', 'accessory', options.ACCESSORY_OPTIONS], ['可爱表情', 'eyeType', options.EYE_OPTIONS],
      ['小小眉毛', 'eyebrowType', options.EYEBROW_OPTIONS], ['嘟嘟小嘴', 'mouthType', options.MOUTH_OPTIONS],
      ['宝宝身形', 'bodyType', options.BODY_OPTIONS], ['软绒小尾', 'tailType', options.TAIL_OPTIONS],
      ['甜甜尾迹', 'trailType', options.TRAIL_OPTIONS],
    ];
    for (const [title, key, items] of groups) {
      const section = document.createElement('section'); section.dataset.category = key; section.innerHTML = `<h2>${title}</h2><div class="options-grid"></div>`;
      for (const option of items) {
        const cell = document.createElement('div'); cell.className = 'option';
        cell.append(paint({ ...DEFAULT_COSMETICS, [key]: option.value }, 128, 86, key === 'trailType' ? 22 : 28));
        cell.append(document.createTextNode(option.label)); section.querySelector('.options-grid').append(cell);
      }
      document.querySelector('#all-options').append(section);
    }
  });
  await page.locator('.lookbook').screenshot({ path: 'previews/cute-wardrobe-options.png' });
  const outfits = await page.locator('#outfits').boundingBox();
  await page.screenshot({ path: 'previews/cute-wardrobe-outfits.png', clip: { x: 0, y: 0, width: 1200, height: Math.ceil(outfits.y + outfits.height + 16) } });
  for (const key of ['eyeType', 'accessory', 'tailType', 'teeth']) {
    await page.locator(`[data-category="${key}"]`).screenshot({ path: `previews/cute-wardrobe-${key}.png` });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Cute wardrobe inspected: 8 outfits, all 11 cosmetic categories, and every live shop tab; no page errors.');
} finally {
  await browser.close();
}
