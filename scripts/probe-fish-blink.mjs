import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 1030 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/previews/morphology-lab.html');
  await page.locator('#pixi canvas').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    const load = path => import(/* @vite-ignore */ path);
    const source = await (await fetch('/src/rendering/pixi/CreatureDisplay.ts')).text();
    const pixiUrl = source.match(/from\s*["']([^"']*pixi__js[^"']*)["']/)?.[1];
    const [{ Application, Rectangle }, { CreatureDisplay }, { drawCuteFish }, { createEntity }, { DEFAULT_COSMETICS }] = await Promise.all([
      load(pixiUrl), load('/src/rendering/pixi/CreatureDisplay.ts'), load('/src/components/GameCanvas.tsx'),
      load('/src/gameEngine.ts'), load('/src/types.ts'),
    ]);
    document.querySelector('#toggle-motion').click();
    document.body.innerHTML = '<main><h1>小鱼会眨眼啦</h1><p>自然闭合 · 弯弯眼线 · 轻轻睁开</p><div class="cards"></div></main>';
    const style = document.createElement('style');
    style.textContent = 'body{margin:0;background:#eef8f6;color:#416573;font-family:system-ui}main{padding:24px 28px}h1,p{text-align:center}h1{font-size:30px;margin:4px}p{color:#7d9eaa;margin:8px 0 20px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{background:white;border-radius:24px;border:1px solid #d6e9e7;padding:12px 0;text-align:center}.card h2{font-size:16px;margin:0 0 4px}.card span{font-size:10px;letter-spacing:2px;color:#92abb0}.card canvas{display:block;margin:auto}';
    document.head.append(style);
    const app = new Application();
    await app.init({ width: 290, height: 105, resolution: 2, autoStart: false, backgroundAlpha: 0, preference: 'webgl', antialias: true });
    for (const [eyeType, name] of [['NORMAL', '圆圆眼'], ['CAT', '猫猫眼'], ['LOVE', '爱心眼']]) {
      const entity = createEntity('CLOWN_FISH', 165, 52);
      Object.assign(entity, { id: 'blink-preview', animOffset: 0, radius: 46, angle: 0, vx: 0, vy: 0,
        renderScale: 1, semiGhostTimer: 0, inCover: false, camoActive: false, cosmetics: { ...DEFAULT_COSMETICS, eyeType } });
      for (const [openness, stage] of [[1, '睁开'], [0.4, '眨动'], [0, '闭合']]) {
        const card = document.createElement('section'); card.className = 'card';
        card.innerHTML = `<h2>${name} · ${stage}</h2><span>CANVAS</span>`;
        // Freeze the body pose while sampling the actual eye painters.
        const { drawCuteFace } = await load('/src/rendering/cuteFishFace.ts');
        const { drawEyes } = await load('/src/rendering/cosmetics.ts');
        const { CosmeticGraphicsContext } = await load('/src/rendering/pixi/CosmeticGraphicsContext.ts');
        const { resolveMorphology } = await load('/src/morphology/index.ts');
        const { fishEyeOpenness } = await load('/src/rendering/fishBlink.ts');
        const eye = resolveMorphology(entity).geometry.anchors.eyeLeft;
        const targetOpenness = Math.round(openness * 24) / 24;
        let eyeTimeMs = 200;
        if (openness < 1) {
          for (let time = 1400; time < 4000; time++) {
            if (fishEyeOpenness(entity, time) === targetOpenness) { eyeTimeMs = time; break; }
          }
        }
        const canvas = document.createElement('canvas'); canvas.width = 580; canvas.height = 210;
        canvas.style.width = '290px'; canvas.style.height = '105px';
        const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
        drawCuteFish(ctx, entity, 14, false, { eyeTimeMs });
        const paint = context => eyeType === 'NORMAL'
          ? drawCuteFace(context, entity.radius, eye.x * entity.radius, Math.abs(eye.y) * entity.radius, eye.scale, targetOpenness)
          : drawEyes(context, eyeType, eye.x * entity.radius, Math.abs(eye.y) * entity.radius, eye.scale * entity.radius / 0.2, 14, targetOpenness);
        card.append(canvas);
        card.insertAdjacentHTML('beforeend', '<span>PIXI</span>');
        const display = new CreatureDisplay(entity.id);
        display.update(entity, 14 * (1000 / 60), false);
        const eyes = display.root.getChildByLabel('fish-eyes'); eyes.clear(); paint(new CosmeticGraphicsContext(eyes).asCanvas());
        app.stage.addChild(display.root); app.render();
        const gpu = await app.renderer.extract.canvas({ target: app.stage, frame: new Rectangle(0, 0, 290, 105), resolution: 2 });
        gpu.style.width = '290px'; gpu.style.height = '105px'; card.append(gpu);
        document.querySelector('.cards').append(card);
        app.stage.removeChild(display.root); display.destroy();
      }
    }
    app.destroy({ removeView: true, releaseGlobalResources: false });
  });
  if (errors.length) throw new Error(errors.join('\n'));
  await mkdir('previews', { recursive: true });
  await page.screenshot({ path: 'previews/fish-blink-review.png', fullPage: true });
  console.log('Saved previews/fish-blink-review.png; no browser errors.');
} finally { await browser.close(); }
