import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('previews', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://localhost:3000/?renderer=pixi');
  await page.waitForFunction(() => Boolean(window.__FISH_DEBUG__));
  await page.evaluate(async () => {
    const load = path => import(/* @vite-ignore */ path);
    const source = await (await fetch('/src/rendering/pixi/CreatureDisplay.ts')).text();
    const pixiPath = source.match(/from\s*["']([^"']*pixi__js[^"']*)["']/)?.[1];
    const [{ Application, Graphics }, { resolveObstacleAppearance }, { drawObstacleCanvas }, { drawObstaclePixi }, { drawCutePondScenery }] = await Promise.all([
      load(pixiPath), load('/src/rendering/obstacles/ObstacleAppearance.ts'),
      load('/src/rendering/canvas/ObstacleCanvasRenderer.ts'), load('/src/rendering/pixi/ObstaclePixiRenderer.ts'),
      load('/src/rendering/obstacles/cuteOceanDecor.ts'),
    ]);
    const gallery = document.createElement('div'); gallery.id = 'ocean-art-review';
    gallery.style.cssText = 'position:absolute;inset:0 auto auto 0;z-index:10000;width:1440px;min-height:1060px;background:#eff8f6;color:#50758b;padding:28px;box-sizing:border-box;font-family:Microsoft YaHei,sans-serif';
    gallery.innerHTML = '<h1 style="font-size:27px;margin:0 0 6px">🫧 软糖海洋 · 装饰造型</h1><p style="font-size:13px;margin:0 0 20px">圆润小石头 · 糖果珊瑚 · 薄荷水草 · 贝壳与海星</p>';
    const app = new Application();
    await app.init({ width: 132, height: 160, backgroundAlpha: 0, antialias: true, autoStart: false, preference: 'webgl' });
    const graphics = new Graphics(); app.stage.addChild(graphics);
    const variants = [
      ['ROCK', 'BOULDER', '奶糖圆石'], ['ROCK', 'STRATA', '云纹小石'], ['ROCK', 'VOLCANIC', '软萌泡泡石'],
      ['CORAL', 'BRANCH', '软糖珊瑚'], ['CORAL', 'FAN', '花瓣海扇'], ['CORAL', 'BRAIN', '奶泡团团珊瑚'],
      ['SEAWEED', 'KELP', '薄荷海带'], ['SEAWEED', 'MEADOW', '绒绒水草'], ['SEAWEED', 'REED', '小花海草'],
    ];
    const specimens = variants.map(([type, variant, label]) => {
      for (let i = 0; i < 300; i++) {
        const obstacle = { id: `cute-ocean-${type}-${i}`, type, radius: 54, x: 66, y: 78 };
        if (resolveObstacleAppearance(obstacle).variant === variant) return { obstacle, label };
      }
      throw new Error(`Missing ${variant}`);
    });
    for (const backend of ['Canvas', 'Pixi']) {
      const heading = document.createElement('h2'); heading.textContent = `${backend} 渔场绘制`; heading.style.cssText = 'font-size:16px;margin:18px 0 10px'; gallery.append(heading);
      const row = document.createElement('div'); row.style.cssText = 'display:grid;grid-template-columns:repeat(9,1fr);gap:10px';
      for (const { obstacle, label } of specimens) {
        const card = document.createElement('div'); card.style.cssText = 'border:1px solid #d0e4e7;border-radius:20px;background:#173f60;overflow:hidden;text-align:center';
        const canvas = document.createElement('canvas'); canvas.width = 132; canvas.height = 160; canvas.style.cssText = 'width:100%;display:block';
        if (backend === 'Canvas') drawObstacleCanvas(canvas.getContext('2d'), obstacle, 30);
        else { drawObstaclePixi(graphics.clear(), obstacle, 30); app.render(); canvas.getContext('2d').drawImage(app.canvas, 0, 0); }
        const caption = document.createElement('div'); caption.textContent = label; caption.style.cssText = 'font-size:12px;background:#f7fbf8;padding:9px 2px'; card.append(canvas, caption); row.append(card);
      }
      gallery.append(row);
    }
    const bottom = document.createElement('div'); bottom.style.cssText = 'display:flex;gap:18px;margin-top:25px';
    for (const kind of ['LILY', 'CORAL', 'GLOW']) {
      const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 180;
      canvas.style.cssText = 'border-radius:22px;background:#173f60';
      for (let i = 0; i < 5; i++) drawCutePondScenery(canvas.getContext('2d'), { kind, x: 38 + i * 56, y: 95 + i % 2 * 14, radius: 30, angle: i / 10 });
      bottom.append(canvas);
    }
    gallery.append(bottom);
    document.body.append(gallery);
    graphics.destroy(); app.destroy({ removeView: true, releaseGlobalResources: false });
    window.__OCEAN_ART_SPECIMENS__ = specimens;
  });
  await page.locator('#ocean-art-review').screenshot({ path: 'previews/cute-ocean-decorations.png' });
  for (const renderer of ['pixi', 'canvas']) {
    await page.goto(`http://localhost:3000/?renderer=${renderer}`);
    await page.waitForFunction(() => Boolean(window.__FISH_DEBUG__));
    await page.evaluate(async () => {
      const { createInitialState } = await import('/src/factories/initialState.ts');
      const state = window.__FISH_DEBUG__.state();
      Object.assign(state, createInitialState({ skipWorldGen: true }));
      state.status = 'PLAYING'; state.player.x = 2000; state.player.y = 2000; state.player.isInvulnerable = true;
      state.camera = { x: 2000, y: 2000, zoom: 1 };
      state.buildings = []; state.portals = []; state.fountains = []; state.currents = []; state.entities = [];
      state.obstacles = Array.from({ length: 12 }, (_, i) => ({
        id: `ocean-scene-${i}`, type: ['ROCK', 'CORAL', 'SEAWEED'][i % 3], radius: 65 + i % 3 * 12,
        x: 1550 + i % 6 * 180, y: 1840 + Math.floor(i / 6) * 360, ecologyInitialized: true,
      }));
    });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `previews/cute-ocean-${renderer}-scene.png` });
    if (renderer === 'pixi') {
      const count = await page.evaluate(() => window.__PIXI_PROBE__?.renderErrorCount);
      if (count) errors.push(`Pixi render failures: ${count}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Ocean art gallery and both live renderer scenes saved; no browser render errors.');
} finally { await browser.close(); }
