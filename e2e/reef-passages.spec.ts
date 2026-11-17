import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const renderer of ['canvas', 'pixi'] as const) for (const world of ['finite', 'endless'] as const) {
  test(`${renderer} ${world} 真实通道小鱼穿行、大鱼拦截`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 940 });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && m.text().includes('系统异常')) errors.push(m.text()); });
    await page.goto(`/?renderer=${renderer}&world=${world}&worldSeed=42&mode=rivals&pondLayout=procedural&pondSeed=42`);
    await page.getByRole('button', { name: /^驶入/ }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__FISH_DEBUG__.state().obstacles.some((o: any) => o.reef))).toBe(true);
    const lane = await page.evaluate(async () => {
      const modulePath = '/src/data/reefClusters.ts';
      const { getReefPassages } = await import(/* @vite-ignore */ modulePath);
      const s = (window as any).__FISH_DEBUG__.state();
      const passage = getReefPassages(s.obstacles).find((p: any) => p.kind === 'REFUGE' && p.clearance < 45)!;
      if (!passage) throw new Error('No generated small refuge');
      // Isolate a real generated cluster; controls, collision and rendering remain the live engine.
      s.obstacles = s.obstacles.filter((o: any) => o.reef?.groupId === passage.id);
      s.entities = []; s.buildings = []; s.portals = []; s.currents = []; s.hazards = [];
      s.quests = undefined; s.run = undefined; s.rivalSquads = undefined;
      s.player.isGodMode = true; s.player.speed = 0; s.player.evolutionPoints = 0;
      s.camera.x = passage.center.x; s.camera.y = passage.center.y; s.camera.zoom = 1.05;
      const angle = Math.atan2(passage.points[2].y - passage.points[0].y, passage.points[2].x - passage.points[0].x);
      s.player.x = passage.center.x; s.player.y = passage.center.y; s.player.radius = 22;
      return { ...passage, angle };
    });
    await mkdir('previews', { recursive: true });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `previews/reef-${renderer}-${world}.png` });
    await page.mouse.move(720 + Math.cos(lane.angle) * 300, 470 + Math.sin(lane.angle) * 300);
    const resetFish = async (radius: number) => page.evaluate(({ lane, radius }) => {
      const s = (window as any).__FISH_DEBUG__.state(), p = s.player;
      p.x = lane.center.x - Math.cos(lane.angle) * 310;
      p.y = lane.center.y - Math.sin(lane.angle) * 310;
      p.radius = radius; p.angle = lane.angle; p.speed = 8;
      p.pendingRadiusGrowth = 0; p.pendingEvolutionType = undefined;
      p.boost.current = p.boost.max = 10000; p.evolutionPoints = 0; p.biteCooldown = 1000;
      s.entities = []; s.time += 1;
      s.camera.x = p.x; s.camera.y = p.y;
    }, { lane, radius });
    const position = () => page.evaluate(lane => {
      const p = (window as any).__FISH_DEBUG__.state().player;
      const dx = p.x - lane.center.x, dy = p.y - lane.center.y;
      return { along: dx * Math.cos(lane.angle) + dy * Math.sin(lane.angle), across: -dx * Math.sin(lane.angle) + dy * Math.cos(lane.angle) };
    }, lane);
    await resetFish(22); await page.keyboard.down('Space');
    await expect.poll(async () => (await position()).along, { timeout: 8000 }).toBeGreaterThan(260);
    await page.keyboard.up('Space');
    await resetFish(70); await page.keyboard.down('Space');
    await page.waitForTimeout(1200);
    const large = await position();
    // A large fish may travel around the outside, but cannot occupy the interior corridor.
    expect(large.along < -80 || Math.abs(large.across) > 170).toBe(true);
    await page.keyboard.up('Space');
    const clearance = await page.evaluate(async () => {
      const modulePath = '/src/core/obstacleGeometry.ts';
      const { canTraverseSegment } = await import(/* @vite-ignore */ modulePath);
      const s = (window as any).__FISH_DEBUG__.state();
      return canTraverseSegment(s.player, s.player, s.player.radius, s.obstacles);
    });
    expect(clearance).toBe(true);
    if (renderer === 'pixi') expect(await page.evaluate(() => (window as any).__PIXI_PROBE__.renderErrorCount)).toBe(0);
    expect(errors).toEqual([]);
  });
}
