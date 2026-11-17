import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('previews', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://localhost:3000/?renderer=pixi');
  await page.evaluate(async () => {
    const { drawCutePondScenery } = await import('/src/rendering/obstacles/cuteOceanDecor.ts');
    const gallery = document.createElement('div'); gallery.id = 'richer-ocean-review';
    gallery.style.cssText = 'position:absolute;inset:0 auto auto 0;z-index:10000;width:1440px;background:#eff8f6;color:#50758b;padding:28px;box-sizing:border-box;font-family:Microsoft YaHei,sans-serif';
    gallery.innerHTML = '<h1 style="font-size:27px;margin:0 0 10px">🫧 海底小花园</h1><p style="font-size:14px;margin:0 0 24px">高低植物、软软花丛、沙纹与小物件，让每一片海底都有自己的小风景。</p>';
    const row = document.createElement('div'); row.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:14px';
    for (const [kind, label] of [['GARDEN','珊瑚与水草小花园'],['ANEMONE','软软海葵花丛'],['SPONGE','奶糖海绵'],['SAND','细沙纹与小贝壳'],['BUBBLES','慢慢上升的气泡'],['BOTTLE','爱心漂流瓶']]) {
      const card = document.createElement('div'); card.style.cssText = 'border-radius:22px;background:#184c68;overflow:hidden;text-align:center';
      const canvas = document.createElement('canvas'); canvas.width = 214; canvas.height = 214;
      drawCutePondScenery(canvas.getContext('2d'), { kind, x: 107, y: 117, radius: 91, angle: 1.3 }, 70);
      const title = document.createElement('div'); title.textContent = label; title.style.cssText = 'background:#f7fbf8;padding:13px 0;font-size:13px';
      card.append(canvas, title); row.append(card);
    }
    gallery.append(row); document.body.append(gallery);
  });
  await page.locator('#richer-ocean-review').screenshot({ path: 'previews/richer-ocean-new-decor.png' });
  for (const renderer of ['pixi', 'canvas']) {
    await page.goto(`http://localhost:3000/?renderer=${renderer}&world=endless&worldSeed=42`);
    await page.getByRole('button', { name: '驶入无限海域' }).click();
    await page.waitForFunction(() => window.__FISH_DEBUG__?.state().endlessWorld?.loadedChunks.length === 25);
    await page.evaluate(() => {
      const state = window.__FISH_DEBUG__.state();
      state.player.isInvulnerable = true;
      // Pause gameplay while its actual renderer keeps animating the same generated landscape.
      state.status = 'EVOLVING';
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      // Only hide the evolution dialog/HUD for this artwork capture; keep the real game canvas.
      const style = document.createElement('style');
      style.textContent = '.absolute.inset-0:not(:has(canvas)), .fixed:not(:has(canvas)) { display:none !important; }';
      document.head.append(style);
      for (const overlay of document.querySelectorAll('.absolute.inset-0, .fixed'))
        if (!overlay.querySelector('canvas')) overlay.style.display = 'none';
    });
    await page.screenshot({ path: `previews/richer-ocean-${renderer}-scene.png` });
    if (renderer === 'pixi') {
      const metrics = await page.evaluate(() => ({ errors: window.__PIXI_PROBE__?.renderErrorCount, ms: window.__PIXI_PROBE__?.lastRenderMs }));
      if (metrics.errors) errors.push(`Pixi render errors: ${metrics.errors}`);
      console.log(`Pixi frame: ${metrics.ms?.toFixed(2)}ms`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('New scenery gallery and real endless ocean scenes saved.');
} finally { await browser.close(); }
