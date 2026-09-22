import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto('http://127.0.0.1:3000/?renderer=pixi');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await page.waitForFunction(() => window.__FISH_DEBUG__?.state()?.entities?.length > 0);
  const before = await page.evaluate(() => {
    const state = window.__FISH_DEBUG__.state();
    const template = state.entities.find(entity => entity.type === 'CLOWN_FISH')
      ?? state.entities.find(entity => (entity.config.shape ?? 'FISH') === 'FISH' && entity.config.behavior === 'FLEE');
    if (!template) return null;
    const cx = state.player.x; const cy = state.player.y - 80;
    const angles = [-1.05, -0.72, -0.4, -0.15, 0.08, 0.32, 0.58, 0.84, 1.05, -0.55, 0.48, -0.08];
    state.entities = angles.map((angle, index) => ({
      ...template,
      id: `school-probe-${index}`,
      x: cx - 280 + (index % 4) * 145,
      y: cy - 170 + Math.floor(index / 4) * 145,
      angle, vx: Math.cos(angle) * template.speed, vy: Math.sin(angle) * template.speed,
      health: template.maxHealth, ownerId: undefined, lockId: null, targetId: null,
      moodId: 'CALM', moodTimer: 99_999, semiGhostTimer: 0, fearTimer: 0,
    }));
    state.player.level = 1; state.player.radius = 10; state.player.speed = 0; state.player.vx = 0; state.player.vy = 0;
    state.obstacles = []; state.treasures = []; state.portals = []; state.hazards = [];
    state.camera.x = cx; state.camera.y = cy; state.camera.zoom = 0.92;
    return { angles };
  });
  if (!before) throw new Error('No suitable schooling fish found');
  await page.waitForTimeout(2600);
  const after = await page.evaluate(() => {
    const fish = window.__FISH_DEBUG__.state().entities.filter(entity => entity.id.startsWith('school-probe-'));
    const meanX = fish.reduce((sum, entity) => sum + Math.cos(entity.angle), 0) / fish.length;
    const meanY = fish.reduce((sum, entity) => sum + Math.sin(entity.angle), 0) / fish.length;
    const coherence = Math.hypot(meanX, meanY);
    let minDistance = Infinity;
    for (let i = 0; i < fish.length; i += 1) for (let j = i + 1; j < fish.length; j += 1) {
      minDistance = Math.min(minDistance, Math.hypot(fish[i].x - fish[j].x, fish[i].y - fish[j].y));
    }
    return { count: fish.length, coherence, minDistance };
  });
  await page.screenshot({ path: 'scripts/schooling-ingame.png' });
  if (errors.length) throw new Error(errors.join('\n'));
  if (after.count !== 12 || after.coherence < 0.82 || after.minDistance < 24) {
    throw new Error(`Schooling failed: ${JSON.stringify(after)}`);
  }
  console.log(JSON.stringify(after, null, 2));
} finally {
  await browser.close();
}
