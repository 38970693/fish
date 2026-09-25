/** Actual Pixi canvas visual check for animated appendages at a readable scale. */
import { chromium } from '@playwright/test';

const output = process.env.PIXI_APPENDAGE_OUTPUT ?? 'scripts/eco00-pixi-appendage-mesh.png';
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    let state = 20260923;
    Math.random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
  });
  await page.goto('http://127.0.0.1:3000/?renderer=pixi&mode=rivals');
  await page.getByRole('button', { name: /驶入/ }).click();
  await page.waitForFunction(() => (window.__PIXI_PROBE__?.renderCount ?? 0) >= 8);
  await page.evaluate(() => {
    const debug = window.__FISH_DEBUG__;
    debug.pixiLodStressScene();
    const state = debug.state();
    const centerX = state.player.x;
    const centerY = state.player.y;
    const shapes = ['KRAKEN', 'CEPHALOPOD', 'OARFISH'];
    state.entities = shapes.map((shape, index) => {
      const entity = state.entities.find(candidate => candidate.config.shape === shape);
      if (!entity) throw new Error(`Missing ${shape} in Pixi fixture`);
      entity.x = centerX - 190 + index * 250;
      entity.y = centerY + 110;
      entity.angle = 0;
      entity.speed = 0;
      entity.vx = 0;
      entity.vy = 0;
      entity.health = 1_000_000;
      entity.invulnerableTimer = 1_000_000;
      return entity;
    });
    state.camera.zoom = 1.1;
    state.obstacles = [];
    state.buildings = [];
    state.portals = [];
    state.fountains = [];
  });
  await page.waitForTimeout(1_500);
  await page.locator('canvas[data-renderer="pixi"]').screenshot({ path: output });
  console.log(output);
  await page.close();
} finally {
  await browser.close();
}
