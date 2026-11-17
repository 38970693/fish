import { expect, test, type Page } from '@playwright/test';

const compareWardrobe = async (page: Page, renderer: 'canvas' | 'pixi', boosting = false) => {
  await expect.poll(() => page.locator('.cute-wardrobe canvas').evaluateAll((canvases, kind) =>
    canvases.length > 0 && canvases.every(canvas => (canvas as HTMLCanvasElement).dataset.renderer === kind), renderer)).toBe(true);
  await expect(page.locator('[data-testid="cosmetics-preview"] canvas')).toHaveAttribute('data-boosting', String(boosting));
  return page.evaluate(async ({ renderer, boosting }) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const [options, boosts, { drawCuteFish }] = await Promise.all([
      load('/src/data/cosmeticsOptions.ts'), load('/src/data/boostEffects.ts'), load('/src/components/GameCanvas.tsx'),
    ]);
    let app: any, display: any, graphics: any, drawBoostTrailPixi: any;
    if (renderer === 'pixi') {
      const source = await (await fetch('/src/rendering/pixi/CreatureDisplay.ts')).text();
      const pixiUrl = source.match(/from\s*["']([^"']*pixi__js[^"']*)["']/)?.[1];
      if (!pixiUrl) throw new Error('Missing Pixi module');
      const [{ Application, Graphics }, { CreatureDisplay }, trails] = await Promise.all([
        load(pixiUrl), load('/src/rendering/pixi/CreatureDisplay.ts'), load('/src/rendering/boostTrail.ts'),
      ]);
      app = new Application();
      await app.init({ width: 1, height: 1, backgroundAlpha: 0, autoStart: false, preference: 'webgl', antialias: true });
      display = new CreatureDisplay('comparison'); graphics = new Graphics();
      app.stage.addChild(graphics, display.root);
      drawBoostTrailPixi = trails.drawBoostTrailPixi;
    }
    const { drawBoostTrailCanvas } = await load('/src/rendering/boostTrail.ts');
    const player = (window as any).__FISH_DEBUG__.state().player;
    const failures: { option: string; mismatch: number }[] = [];
    let count = 0;
    for (const preview of document.querySelectorAll<HTMLCanvasElement>('.cute-wardrobe canvas')) {
      const button = preview.closest<HTMLButtonElement>('[data-cosmetic-key]');
      const key = button?.dataset.cosmeticKey, value = button?.dataset.cosmeticValue;
      const cosmetics = key === 'preset' ? options.AI_COSMETICS_PRESETS.find((p: any) => p.name === value).cosmetics
        : key === 'boostStyle' ? { ...player.cosmetics, boostEffect: { ...boosts.getBoostEffect(player.cosmetics), style: value } }
        : key ? { ...player.cosmetics, [key]: value } : player.cosmetics;
      const w = parseFloat(preview.style.width), h = parseFloat(preview.style.height), dpr = preview.width / w;
      const trail = cosmetics.trailType !== 'NONE';
      // Normalize only the fitting mirror's pose/size; identity, V2 and species come from the pond.
      const fish = { ...player, cosmetics, x: w * (boosting ? 0.72 : trail ? 0.64 : 0.58), y: h / 2,
        radius: Math.min(w, h) * (boosting ? 0.19 : trail ? 0.175 : 0.25), angle: 0, vx: boosting ? 5 : 0, vy: 0,
        renderScale: 1, isIdle: !boosting, semiGhostTimer: 0, inCover: false, camoActive: false,
        hitReactionTimer: 0, speedBoostTimer: 0, accelerationMult: boosting ? 3 : 1 };
      const time = Number(preview.dataset.visualTime);
      const expected = document.createElement('canvas'); expected.width = preview.width; expected.height = preview.height;
      const ctx = expected.getContext('2d')!;
      const particles = [];
      if (boosting) {
        const frame = Math.floor(time);
        for (let age = 34; age >= 0; age--) {
          for (const p of boosts.createBoostParticles(fish, frame - age, (frame - age) % 2 === 0)) {
            p.life -= age * 0.02;
            if (p.life <= 0) continue;
            p.x += p.vx * age; p.y += p.vy * age; particles.push(p);
          }
        }
      }
      if (app) {
        app.renderer.resize(w, h, dpr); graphics.clear();
        for (const p of particles) drawBoostTrailPixi(graphics, p);
        display.update(fish, time * (1000 / 60), false, 0); app.render(); ctx.drawImage(app.canvas, 0, 0);
      } else {
        ctx.scale(dpr, dpr);
        for (const p of particles) drawBoostTrailCanvas(ctx, p);
        drawCuteFish(ctx, fish, time, false);
      }
      // Read a copy so repeated comparisons don't switch the animated source canvas to software rasterization.
      const captured = document.createElement('canvas'); captured.width = preview.width; captured.height = preview.height;
      const captureContext = captured.getContext('2d')!; captureContext.drawImage(preview, 0, 0);
      const a = captureContext.getImageData(0, 0, preview.width, preview.height).data;
      const b = ctx.getImageData(0, 0, expected.width, expected.height).data;
      let changed = 0, visible = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i + 3] || b[i + 3]) visible++;
        if ([0, 1, 2, 3].some(c => Math.abs(a[i + c] - b[i + c]) > 3)) changed++;
      }
      const mismatch = changed / Math.max(1, visible);
      if (mismatch >= 0.01 || !visible) {
        (window as any).__WARDROBE_COMPARE__ = { actual: preview.toDataURL(), expected: expected.toDataURL(), time, fish };
        failures.push({ option: `${key ?? 'mirror'}:${value ?? ''}`, mismatch });
      }
      count++;
    }
    display?.destroy(); graphics?.destroy(); app?.destroy({ removeView: true, releaseGlobalResources: false });
    return { count, failures };
  }, { renderer, boosting });
};

test('商店预览与渔场同一条鱼的装扮像素一致', async ({ page }, testInfo) => {
  await page.goto('/?renderer=pixi');
  await page.getByRole('button', { name: '装扮我的鱼' }).click();
  await page.locator('[data-tab="ai-presets"]').click();
  await page.locator('[data-cosmetic-key="preset"]').first().click();
  await expect(page.locator('[data-testid="cosmetics-preview"] canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const comparison = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const source = await (await fetch('/src/rendering/pixi/CreatureDisplay.ts')).text();
    const pixiUrl = source.match(/from\s*["']([^"']*pixi__js[^"']*)["']/)?.[1];
    if (!pixiUrl) throw new Error('Missing Pixi module');
    const [{ Application }, { CreatureDisplay }] = await Promise.all([load(pixiUrl), load('/src/rendering/pixi/CreatureDisplay.ts')]);
    const preview = document.querySelector('[data-testid="cosmetics-preview"] canvas') as HTMLCanvasElement;
    const w = parseFloat(preview.style.width), h = parseFloat(preview.style.height);
    const player = (window as any).__FISH_DEBUG__.state().player;
    const hasTrail = player.cosmetics.trailType !== 'NONE';
    const fish = { ...player, x: w * (hasTrail ? 0.64 : 0.58), y: h / 2, radius: Math.min(w, h) * (hasTrail ? 0.175 : 0.25),
      angle: 0, vx: 0, vy: 0, renderScale: 1, isIdle: true, semiGhostTimer: 0, inCover: false, camoActive: false,
      hitReactionTimer: 0, speedBoostTimer: 0, accelerationMult: 1 };
    const time = Number(preview.dataset.visualTime ?? 14);
    const app = new Application();
    await app.init({ width: w, height: h, resolution: preview.width / w, backgroundAlpha: 0, autoStart: false, preference: 'webgl', antialias: true });
    const display = new CreatureDisplay(player.id); app.stage.addChild(display.root);
    display.update(fish, time * (1000 / 60), false, 0); app.render();
    const expected = document.createElement('canvas'); expected.width = preview.width; expected.height = preview.height;
    const ctx = expected.getContext('2d')!; ctx.drawImage(app.canvas, 0, 0);
    const a = preview.getContext('2d')!.getImageData(0, 0, preview.width, preview.height).data;
    const b = ctx.getImageData(0, 0, expected.width, expected.height).data;
    let changed = 0, visible = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] || b[i + 3]) visible++;
      if ([0, 1, 2, 3].some(c => Math.abs(a[i + c] - b[i + c]) > 3)) changed++;
    }
    const before = preview.toDataURL(), after = expected.toDataURL();
    display.destroy(); app.destroy({ removeView: true, releaseGlobalResources: false });
    document.body.innerHTML = `<div style="display:flex;gap:20px;background:#fff7f9;padding:30px"><div>商店预览<img src="${before}"></div><div>渔场实际绘制<img src="${after}"></div></div>`;
    return { mismatch: changed / Math.max(1, visible), playerId: player.id };
  });
  await page.screenshot({ path: testInfo.outputPath('preview-versus-pond.png') });
  expect(comparison.mismatch, JSON.stringify(comparison)).toBeLessThan(0.01);
});

for (const renderer of ['canvas', 'pixi'] as const) {
  test(`${renderer} 商店全部缩略图与渔场绘制一致`, async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /Fish preview renderer failed|Pixi.*render/i.test(message.text())) errors.push(message.text());
    });
    await page.goto(`/?renderer=${renderer}`);
    await page.getByRole('button', { name: '装扮我的鱼' }).click();
    await expect(page.locator('[data-testid="cosmetics-preview"] canvas')).toHaveAttribute('data-renderer', renderer);
    await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
    let count = 0;
    for (const tab of ['color', 'pattern', 'face', 'body', 'accessory', 'eyes', 'boost', 'ai-presets']) {
      await page.locator(`[data-tab="${tab}"]`).click();
      const result = await compareWardrobe(page, renderer, tab === 'boost');
      if (result.failures.length) {
        await page.evaluate(() => {
          const compare = (window as any).__WARDROBE_COMPARE__;
          document.body.innerHTML = `<div style="display:flex;gap:20px;background:#fff7f9;padding:30px"><div>实际预览<img src="${compare.actual}"></div><div>预期渔场绘制<img src="${compare.expected}"></div></div>`;
        });
        await page.screenshot({ path: testInfo.outputPath('option-versus-pond.png') });
      }
      expect(result.failures, tab).toEqual([]); count += result.count;
    }
    expect(count).toBeGreaterThan(100);
    // Applying every preset also verifies the large mirror, rather than just its thumbnail.
    for (const preset of await page.locator('[data-cosmetic-key="preset"]').all()) {
      await preset.click();
      expect((await compareWardrobe(page, renderer)).failures).toEqual([]);
    }
    // Releasing a fitting mirror must not destroy the pond's shared GPU resources.
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: '完成', exact: true }).click();
      await page.clock.runFor(400);
      await page.getByRole('button', { name: '装扮我的鱼' }).click();
      expect((await compareWardrobe(page, renderer)).failures).toEqual([]);
    }
    if (renderer === 'pixi') expect(await page.evaluate(() => (window as any).__PIXI_PROBE__?.renderErrorCount)).toBe(0);
    expect(errors).toEqual([]);
  });

  test(`${renderer} 渔场商店保留附身鱼的 V2 外观和物种`, async ({ page }) => {
    await page.goto(`/?renderer=${renderer}`);
    await page.waitForFunction(() => Boolean((window as any).__FISH_DEBUG__));
    await page.evaluate(async () => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const [{ CREATURES }, { legacyCosmeticsToAppearance }] = await Promise.all([
        load('/src/data/creatures.ts'), load('/src/morphology/migrateAppearance.ts'),
      ]);
      const state = (window as any).__FISH_DEBUG__.state();
      const player = state.player;
      player.id = 'possessed-fish-387'; player.type = 'ORCA'; player.config = CREATURES.ORCA;
      player.animOffset = 1.7; player.appearanceV2 = legacyCosmeticsToAppearance(player);
      player.appearanceV2.genes = { bodyLength: 0.82, bodyDepth: 0.48, eyeScale: 0.9 };
      player.appearanceV2.material = { primaryColor: '#b2e3d4', patternId: 'SPOTS', scaleId: 'SHINY' };
      state.status = 'SHOP';
    });
    await expect(page.locator('[data-testid="cosmetics-preview"] canvas')).toHaveAttribute('data-renderer', renderer);
    await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
    expect((await compareWardrobe(page, renderer)).failures).toEqual([]);
    await page.locator('[data-tab="accessory"]').click();
    expect((await compareWardrobe(page, renderer)).failures).toEqual([]);
  });
}

test.describe('高清屏幕', () => {
  test.use({ deviceScaleFactor: 2 });
  test('Pixi 试衣镜在两倍像素密度下仍与渔场一致', async ({ page }) => {
    await page.goto('/?renderer=pixi');
    await page.getByRole('button', { name: '装扮我的鱼' }).click();
    await expect(page.locator('[data-testid="cosmetics-preview"] canvas')).toHaveAttribute('data-renderer', 'pixi');
    await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.locator('[data-tab="ai-presets"]').click();
    expect((await compareWardrobe(page, 'pixi')).failures).toEqual([]);
  });
});
