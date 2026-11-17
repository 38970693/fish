import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('previews', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const mode of ['LEGACY', 'RIVALS']) {
    await page.goto(`http://localhost:3000/?renderer=pixi&mode=${mode}`);
    await page.getByRole('button', { name: /^驶入/ }).click();
    await page.mouse.move(900, 470);
    // Capture before eight-second protection ends, then keep observing the natural outcome.
    await page.waitForTimeout(5_000);
    await page.screenshot({ path: `previews/readable-${mode.toLowerCase()}-natural.png` });
    await page.waitForTimeout(7_000);
    const sample = await page.evaluate(() => {
      const s = window.__FISH_DEBUG__.state();
      const near = s.entities.filter(e => e.health > 0 && Math.hypot(e.x - s.player.x, e.y - s.player.y) < 500);
      return { mode: s.run?.mode ?? 'LEGACY', status: s.status, elapsed: s.time / 60,
        total: s.entities.length, within500: near.length, livingPlayer: s.player.health > 0,
        renderErrors: window.__PIXI_PROBE__?.renderErrorCount ?? 0 };
    });
    console.log(JSON.stringify(sample));
    if (sample.renderErrors) throw new Error('Pixi render failure');
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
