import { chromium } from '@playwright/test';

// Render real game creatures, including the small sizes used in the pond.
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 830 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/previews/morphology-lab.html');
  await page.locator('#pixi canvas').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    const load = path => import(/* @vite-ignore */ path);
    const source = await (await fetch('/src/rendering/pixi/CreatureDisplay.ts')).text();
    const pixiUrl = source.match(/from\s*["']([^"']*pixi__js[^"']*)["']/)?.[1];
    if (!pixiUrl) throw new Error('Game Pixi module not found');
    const [{ Application, Rectangle }, { CreatureDisplay }, { drawCuteFish }, { createEntity }, { DEFAULT_COSMETICS }] = await Promise.all([
      load(pixiUrl), load('/src/rendering/pixi/CreatureDisplay.ts'), load('/src/components/GameCanvas.tsx'),
      load('/src/gameEngine.ts'), load('/src/types.ts'),
    ]);
    // Stop the laboratory before replacing its page with the comparison sheet.
    document.querySelector('#toggle-motion').click();
    document.body.innerHTML = `<main class="gallery"><header><div class="eyebrow">HAPPY FISH POND</div><h1>一池软乎乎的小可爱</h1><p>圆圆的脸 · 亮晶晶的眼睛 · 红扑扑的腮红</p></header><section class="cards"></section></main>`;
    const style = document.createElement('style');
    style.textContent = `body{background:#edf8f7;color:#30495b}main.gallery{max-width:none;padding:30px 36px}.gallery header{text-align:center;margin-bottom:24px}.eyebrow{color:#679a9a;font-size:12px;letter-spacing:3px}.gallery h1{font-size:32px;margin:8px 0}.gallery p{font-size:14px;color:#749399;margin:0}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.card{background:#fff;border:1px solid #d9ece9;border-radius:24px;overflow:hidden;box-shadow:0 5px 15px #315d6710;text-align:center;padding:14px 0 10px}.card h2{font-size:16px;margin:0 0 5px}.card .label{font-size:10px;letter-spacing:1px;color:#91a5ad;text-align:left;margin-left:18px}.card canvas{display:block;margin:auto}.small{display:flex;align-items:center;justify-content:center;gap:16px;font-size:11px;color:#91a5ad}`;
    document.head.append(style);
    const app = new Application();
    await app.init({ width: 270, height: 110, backgroundAlpha: 0, autoStart: false, preference: 'webgl', antialias: true, resolution: 2 });
    const examples = [
      ['CLOWN_FISH', '橘子小丑鱼'], ['BLUE_TANG', '蓝莓小鱼儿'], ['KOI', '糯米小锦鲤'], ['GREAT_WHITE', '乖乖小鲨鱼'],
      ['PUFFER_FISH', '圆滚滚河豚'], ['AROWANA', '奶黄小龙鱼'], ['ORCA', '虎鲸宝宝'], ['ANGLER_FISH', '提灯小可爱'],
    ];
    for (const [type, name] of examples) {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `<h2>${name}</h2><div class="label">CANVAS</div>`;
      const fish = createEntity(type, 156, 55);
      fish.id = `cute-preview-${type}`;
      fish.radius = 46; fish.angle = 0; fish.animOffset = 0; fish.vx = 0; fish.vy = 0;
      fish.semiGhostTimer = 0; fish.renderScale = 1; fish.camoActive = false; fish.inCover = false;
      fish.cosmetics = { ...DEFAULT_COSMETICS };
      const canvasFish = (radius, width = 270, height = 110) => {
        const canvas = document.createElement('canvas');
        canvas.width = width * 2; canvas.height = height * 2; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
        drawCuteFish(ctx, { ...fish, radius, x: width * 0.58, y: height / 2 }, 14, false);
        return canvas;
      };
      card.append(canvasFish(46));
      card.insertAdjacentHTML('beforeend', '<div class="label">PIXI</div>');
      const display = new CreatureDisplay(fish.id);
      app.stage.addChild(display.root);
      display.update(fish, 14 * (1000 / 60), false, 0); app.render();
      const gpu = await app.renderer.extract.canvas({ target: app.stage, frame: new Rectangle(0, 0, 270, 110), resolution: 2 });
      gpu.style.width = '270px'; gpu.style.height = '110px'; card.append(gpu);
      const small = document.createElement('div'); small.className = 'small'; small.textContent = '水中小尺寸';
      const tiny = canvasFish(15, 135, 55);
      small.append(tiny); card.append(small);
      document.querySelector('.cards').append(card);
      app.stage.removeChild(display.root); display.destroy();
    }
    app.destroy(true);
  });
  await page.screenshot({ path: 'previews/cute-fish-review.png', fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Cute fish gallery captured: 8 species, both renderers, pond-size silhouettes; no page errors.');
} finally {
  await browser.close();
}
