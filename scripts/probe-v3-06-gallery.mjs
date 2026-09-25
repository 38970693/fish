import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/previews/morphology-lab.html');
  await page.locator('#pixi canvas').waitFor({ state: 'visible' });
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.locator('#gallery-export').click();
  const download = await downloadPromise;
  if (download.suggestedFilename() !== 'happy-fish-v3-06-gallery.png') throw new Error('Unexpected gallery filename');
  const output = 'scripts/v3-06-gallery.png';
  await download.saveAs(output);
  const png = await readFile(output);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== 882 || height !== 3226) throw new Error(`Unexpected gallery size ${width}×${height}`);
  const occupied = await page.evaluate(async source => {
    const image = new Image(); image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const cells = [];
    for (let row = 0; row < 15; row += 1) for (const x of [170, 518]) {
      let changed = 0;
      for (let yy = 24; yy < 184; yy += 4) for (let xx = 36; xx < 304; xx += 4) {
        const pixel = ctx.getImageData(x + xx, 82 + row * 208 + yy, 1, 1).data;
        if (Math.abs(pixel[0] - 18) + Math.abs(pixel[1] - 51) + Math.abs(pixel[2] - 72) > 30) changed += 1;
      }
      cells.push(changed);
    }
    return cells;
  }, `data:image/png;base64,${png.toString('base64')}`);
  if (occupied.some(count => count < 30)) throw new Error(`Blank gallery panel: ${occupied.join(',')}`);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`V3-06 gallery passed: 5 species × 2 renderers × 3 LOD, ${width}×${height} PNG`);
} finally {
  await browser.close();
}
