import { expect, test } from '@playwright/test';
import type { GameState } from '../src/types';

test('挂机队友击败巨怪后玩家只正常成长一阶，并继续巡游', async ({ page }) => {
  await page.goto('/?world=finite&mode=legacy');
  await page.getByRole('button', { name: /驶入/ }).click();
  await page.evaluate(async () => {
    const moduleUrl = '/src/systems/spawn.ts';
    const { createEntity } = await import(moduleUrl);
    const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
    const p = state.player;
    p.x = 3100; p.y = 1500; p.angle = 0; p.weight = 15; p.evolutionPoints = 15;
    p.level = 2; p.radius = 17; p.invulnerableTimer = 600;
    state.obstacles = []; state.portals = []; state.hazards = []; state.currents = [];
    state.buildings = []; state.powerUps = []; state.treasures = [];
    state.camera.x = p.x; state.camera.y = p.y;
    const ally = createEntity('GREAT_WHITE', p.x + 1000, p.y);
    ally.id = 'growth-ally'; ally.ownerId = 'player'; ally.semiGhostTimer = 0;
    const boss = createEntity('KRAKEN', p.x + 2000, p.y);
    boss.id = 'growth-boss'; boss.semiGhostTimer = 0;
    state.entities = [ally, boss];
  });
  const toggle = page.getByRole('button', { name: /玩家挂机/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(async () => {
    const moduleUrl = '/src/systems/combat.ts';
    const { dealDamage } = await import(moduleUrl);
    const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
    const boss = state.entities.find(e => e.id === 'growth-boss')!;
    const ally = state.entities.find(e => e.id === 'growth-ally')!;
    dealDamage(boss, boss.health + 1, ally);
  });
  await expect.poll(() => page.evaluate(() => {
    const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
    return { status: state.status, tier: state.player.config.tier, level: state.player.level, weight: state.player.weight };
  })).toEqual({ status: 'PLAYING', tier: 2, level: 5, weight: 45 });
  const tick = await page.evaluate(() => {
    const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
    if (state.player.radius > state.player.config.baseRadius * 1.6) throw new Error('Player grew beyond species size cap');
    return state.time;
  });
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state().time)).toBeGreaterThan(tick + 30);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: '称霸海域！' })).toBeHidden();
});

test('小鱼挂机吃一份大餐只进化一阶，体型不会瞬间跳成巨兽', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /驶入/ }).click();
  await page.evaluate(async () => {
    const configUrl = '/src/data/world.ts';
    const { TREASURE_CONFIG } = await import(configUrl);
    const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
    const p = state.player;
    p.x = 3100; p.y = 1500; p.angle = 0; p.weight = 15; p.evolutionPoints = 15;
    p.level = 2; p.radius = 17; p.invulnerableTimer = 600;
    state.entities = []; state.obstacles = []; state.portals = []; state.hazards = [];
    state.buildings = []; state.powerUps = []; state.currents = [];
    if (state.feedingEvent) state.feedingEvent.drops = [];
    state.treasures = [{ id: 'growth-feast', x: p.x, y: p.y, radius: 60, type: 'FEAST',
      effect: 'EXP', rewardValue: TREASURE_CONFIG.FEAST_REWARD, status: 'ACTIVE', timer: 600 }];
  });
  // 大餐可能先触发进化、隐藏 HUD；P 在进化状态也可开启挂机，避免点击竞态。
  await page.keyboard.press('p');
  await expect.poll(async () => page.evaluate(() => {
    return (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state().player.config.tier;
  })).toBe(2);
  const growth = await page.evaluate(() => {
    const p = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state().player;
    return { level: p.level, radius: p.radius, weight: p.weight };
  });
  expect(growth.weight).toBe(35);
  expect(growth.level).toBe(4);
  expect(growth.radius).toBeLessThanOrEqual(40);
});

test('玩家挂机可开关、自动进化并释放防御技能', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /驶入/ }).click();

  const toggle = page.getByRole('button', { name: /玩家挂机/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const start = await page.evaluate(() => {
    const debug = (window as unknown as { __FISH_DEBUG__: { player: () => { x: number; y: number } } }).__FISH_DEBUG__;
    return debug.player();
  });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => page.evaluate(({ x, y }) => {
    const debug = (window as unknown as { __FISH_DEBUG__: { player: () => { x: number; y: number } } }).__FISH_DEBUG__;
    const p = debug.player();
    return Math.hypot(p.x - x, p.y - y);
  }, start)).toBeGreaterThan(5);

  await page.evaluate(() => {
    const state = (window as unknown as { __FISH_DEBUG__: { state: () => {
      status: string; evolveOptions: string[];
    } } }).__FISH_DEBUG__.state();
    state.evolveOptions = ['PUFFER_FISH'];
    state.status = 'EVOLVING';
  });
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as unknown as { __FISH_DEBUG__: { state: () => {
      status: string; player: { type: string };
    } } }).__FISH_DEBUG__.state();
    return `${state.status}:${state.player.type}`;
  })).toBe('PLAYING:PUFFER_FISH');

  // 通过真实 App 帧循环验证自动右键已接到技能系统。
  await page.evaluate(async () => {
    const state = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state();
    const moduleUrl = '/src/systems/spawn.ts';
    const { createEntity } = await import(moduleUrl);
    const p = state.player;
    p.x = 3100; p.y = 1500; p.angle = 0; p.level = 4;
    p.skillCooldown = 0; p.shieldTimer = 0; p.invulnerableTimer = 0;
    state.obstacles = []; state.portals = []; state.hazards = []; state.buildings = [];
    state.treasures = []; state.powerUps = []; state.currents = [];
    const threat = createEntity('ORCA', p.x + 130, p.y);
    threat.radius = 75; threat.speed = 0; threat.isIdle = true; threat.semiGhostTimer = 0;
    state.entities = [threat];
  });
  await expect.poll(async () => page.evaluate(() => {
    const p = (window as unknown as { __FISH_DEBUG__: { state: () => GameState } }).__FISH_DEBUG__.state().player;
    return p.skillCooldown > 0 && p.shieldTimer > 0;
  })).toBe(true);

  await page.keyboard.press('p');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});
