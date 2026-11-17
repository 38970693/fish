import { expect, test } from '@playwright/test';

for (const renderer of ['canvas', 'pixi'] as const) {
  test(`${renderer} 试衣镜自然闭眼，静态缩略图保持睁眼`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date() });
    await page.goto(`/?renderer=${renderer}`);
    await page.getByRole('button', { name: '装扮我的鱼' }).click();
    const mirror = page.locator('[data-testid="cosmetics-preview"] canvas');
    await expect(mirror).toHaveAttribute('data-renderer', renderer);
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    const advance = await page.evaluate(async () => {
      const path = '/src/rendering/fishBlink.ts';
      const { fishEyeOpenness } = await import(/* @vite-ignore */ path);
      const p = (window as any).__FISH_DEBUG__.state().player;
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="cosmetics-preview"] canvas')!;
      const now = Number(c.dataset.visualTime) * (1000 / 60);
      for (let target = now + 300; target < now + 7000; target += 10) {
        if (fishEyeOpenness(p, target) === 0) return target + 15 - now;
      }
      throw new Error('No upcoming blink');
    });
    const thumbnail = page.locator('[data-cosmetic-key="teeth"] canvas').first();
    const thumbnailBefore = await thumbnail.evaluate(c => (c as HTMLCanvasElement).toDataURL());
    await page.clock.runFor(advance);
    const result = await page.evaluate(async renderer => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const [{ fishEyeOpenness }, { makePreviewEntity }, { drawCuteFish }] = await Promise.all([
        load('/src/rendering/fishBlink.ts'), load('/src/rendering/fishPreviewEntity.ts'), load('/src/components/GameCanvas.tsx'),
      ]);
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="cosmetics-preview"] canvas')!;
      const time = Number(c.dataset.visualTime), p = (window as any).__FISH_DEBUG__.state().player;
      const w = parseFloat(c.style.width), h = parseFloat(c.style.height), dpr = c.width / w;
      const entity = makePreviewEntity(p.type, p.cosmetics, w, h, false, p);
      const expected = document.createElement('canvas'); expected.width = c.width; expected.height = c.height;
      const ctx = expected.getContext('2d')!;
      let app: any, display: any;
      const paint = (open: boolean) => {
        ctx.clearRect(0, 0, expected.width, expected.height);
        if (renderer === 'canvas') {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawCuteFish(ctx, entity, time, false, open ? { eyeTimeMs: 200 } : {});
        } else {
          display.update(entity, time * (1000 / 60), false, 0);
          if (open) display.update(entity, time * (1000 / 60), false, 0, true);
          app.render(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(app.canvas, 0, 0);
        }
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      if (renderer === 'pixi') {
        const source = await (await fetch('/src/rendering/pixi/CreatureDisplay.ts')).text();
        const url = source.match(/from\s*["']([^"']*pixi__js[^"']*)["']/)?.[1];
        const [{ Application }, { CreatureDisplay }] = await Promise.all([load(url!), load('/src/rendering/pixi/CreatureDisplay.ts')]);
        app = new Application();
        await app.init({ width: w, height: h, resolution: dpr, autoStart: false, backgroundAlpha: 0, antialias: true, preference: 'webgl' });
        display = new CreatureDisplay(entity.id); app.stage.addChild(display.root);
      }
      const actual = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const closed = paint(false), open = paint(true);
      let mismatches = 0, eyeChanges = 0;
      for (let i = 0; i < actual.length; i++) {
        if (Math.abs(actual[i] - closed[i]) > 3) mismatches++;
        if (Math.abs(open[i] - closed[i]) > 3) eyeChanges++;
      }
      display?.destroy();
      app?.destroy({ removeView: true, releaseGlobalResources: false });
      return { openness: fishEyeOpenness(p, time * (1000 / 60)), mismatches, eyeChanges };
    }, renderer);
    expect(result.openness).toBe(0);
    expect(result.mismatches).toBe(0);
    expect(result.eyeChanges).toBeGreaterThan(100);
    expect(await thumbnail.evaluate(c => (c as HTMLCanvasElement).toDataURL())).toBe(thumbnailBefore);
    await page.clock.runFor(300);
    expect(await page.evaluate(async () => {
      const path = '/src/rendering/fishBlink.ts';
      const { fishEyeOpenness } = await import(/* @vite-ignore */ path);
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="cosmetics-preview"] canvas')!;
      return fishEyeOpenness((window as any).__FISH_DEBUG__.state().player, Number(c.dataset.visualTime) * (1000 / 60));
    })).toBe(1);
    expect(errors).toEqual([]);
  });
}
