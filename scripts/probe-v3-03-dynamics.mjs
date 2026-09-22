import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto('http://127.0.0.1:3000/?renderer=pixi');
  await page.locator('canvas[data-renderer="pixi"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: /驶入/ }).click();
  await page.waitForFunction(() => (window.__PIXI_PROBE__?.renderCount ?? 0) >= 8);
  const baseline = await page.evaluate(() => {
    const state = window.__FISH_DEBUG__.state();
    const player = state.player;
    player.x = 3000; player.y = 3000; player.angle = 0; player.vx = 0; player.vy = 0; player.speed = 0;
    player.radius = 92; player.invulnerableTimer = 1_000_000;
    player.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed: 20260922 };
    player.cosmetics = { ...window.__FISH_DEBUG__.defaultCosmetics(), rareVariant: 'STARRY_CLOWN' };
    state.entities = []; state.obstacles = []; state.camera.x = 3000; state.camera.y = 3000; state.camera.zoom = 1.15;
    return JSON.stringify(player.appearanceV2);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'scripts/v3-03-dynamic-idle.png' });

  await page.evaluate(() => {
    const player = window.__FISH_DEBUG__.state().player;
    player.speed = player.config.speed; player.isIdle = false;
  });
  await page.mouse.move(1080, 400);
  await page.waitForTimeout(650);
  await page.screenshot({ path: 'scripts/v3-03-dynamic-straight.png' });
  const straight = await page.evaluate(() => ({ angle: window.__FISH_DEBUG__.state().player.angle, speed: window.__FISH_DEBUG__.state().player.speed, x: window.__FISH_DEBUG__.state().player.x, y: window.__FISH_DEBUG__.state().player.y }));

  await page.mouse.move(640, 100);
  await page.waitForTimeout(650);
  await page.screenshot({ path: 'scripts/v3-03-dynamic-turn.png' });
  const turn = await page.evaluate(() => ({ angle: window.__FISH_DEBUG__.state().player.angle, speed: window.__FISH_DEBUG__.state().player.speed, x: window.__FISH_DEBUG__.state().player.x, y: window.__FISH_DEBUG__.state().player.y }));

  await page.keyboard.down('Space');
  await page.mouse.move(1080, 400);
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'scripts/v3-03-dynamic-boost.png' });
  const boost = await page.evaluate(() => ({ active: window.__FISH_DEBUG__.state().player.boost.active, speed: window.__FISH_DEBUG__.state().player.speed, x: window.__FISH_DEBUG__.state().player.x, y: window.__FISH_DEBUG__.state().player.y }));
  await page.keyboard.up('Space');
  const finalAppearance = await page.evaluate(() => JSON.stringify(window.__FISH_DEBUG__.state().player.appearanceV2));

  if (errors.length) throw new Error(errors.join('\n'));
  if (!Number.isFinite(straight.angle) || !Number.isFinite(turn.angle) || Math.abs(turn.angle - straight.angle) < 0.2) throw new Error('Turn state did not produce a meaningful heading change');
  if (Math.hypot(turn.x - straight.x, turn.y - straight.y) < 10) throw new Error('Straight/turn states did not move the fish');
  if (!boost.active) throw new Error('Boost state did not activate');
  if (baseline !== finalAppearance) throw new Error('Appearance data changed during motion states');
  console.log(JSON.stringify({ idle: true, straight, turn, boost, appearanceStable: true }, null, 2));
} finally {
  await browser.close();
}
