import { test, expect } from '@playwright/test';

test.describe('G2 三分钟自然开局切片', () => {
  test('能经历首场获益、主动退出并在三分钟内再次遇敌', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?mode=rivals');
    await page.getByRole('button', { name: /开始游戏/ }).click();
    await expect(page.getByText(/玩家 \(/)).toBeVisible({ timeout: 5000 });

    const opening = await page.evaluate(() => {
      const debug = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__;
      const state = debug.state();
      state.player.isGodMode = true;
      state.player.invulnerableTimer = 999999;
      state.player.evolutionPoints = -1e9;
      state.player.speed = 0;
      state.player.vx = 0;
      state.player.vy = 0;
      debug.profile(15 * 60);
      const nearby = state.entities.filter((entity: any) =>
        Math.hypot(entity.x - state.player.x, entity.y - state.player.y) <= 1050
      );
      const threatDistances = nearby
        .filter((entity: any) => entity.config.tier > state.player.config.tier)
        .map((entity: any) => Math.round(Math.hypot(entity.x - state.player.x, entity.y - state.player.y)));
      return {
        playerX: state.player.x,
        playerY: state.player.y,
        food: nearby.filter((entity: any) => entity.type === 'PLANKTON').length,
        recruits: nearby.filter((entity: any) => entity.config.tier === 1).length,
        nearestThreat: threatDistances.length > 0 ? Math.min(...threatDistances) : null,
      };
    });
    // 12 是生成系统的补充目标；生态会实时吃掉食物，浏览器切片只要求玩家仍有可见机会。
    expect(opening.food).toBeGreaterThan(0);
    expect(opening.recruits).toBeGreaterThanOrEqual(4);

    const firstWarning = await page.evaluate(() => {
      const debug = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__;
      let elapsed = 15 * 60;
      while (debug.state().feedingEvent.phase === 'WAITING' && elapsed < 65 * 60) {
        debug.profile(30);
        elapsed += 30;
      }
      const state = debug.state();
      return { elapsed, eventId: state.feedingEvent.id, phase: state.feedingEvent.phase };
    });
    expect(firstWarning.phase).toBe('WARNING');
    expect(firstWarning.elapsed).toBeLessThanOrEqual(60 * 60);
    await expect(page.getByText('投食即将开始')).toBeVisible();

    await expect.poll(async () => page.evaluate(() => {
      const state = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__.state();
      return state.entities.filter((entity: any) => entity.ownerId?.startsWith('rival-')).length;
    })).toBe(7);

    const participation = await page.evaluate(() => {
      const debug = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__;
      const state = debug.state();
      state.feedingEvent.phase = 'DROPPING';
      state.feedingEvent.timer = 25 * 60;
      state.feedingEvent.drops = [{
        id: 'g2-player-drop', x: state.player.x, y: state.player.y, radius: 12, value: 8,
      }];
      const weightBefore = state.player.weight;
      debug.profile(1);
      return {
        gained: state.player.weight - weightBefore,
        claim: state.feedingEvent.claims.PLAYER ?? 0,
      };
    });
    expect(participation.gained).toBe(8);
    expect(participation.claim).toBe(8);

    const exit = await page.evaluate((origin) => {
      const debug = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__;
      const state = debug.state();
      state.player.x = Math.max(300, state.feedingEvent.x - 1200);
      state.player.y = state.feedingEvent.y;
      state.feedingEvent.phase = 'LINGERING';
      state.feedingEvent.timer = 1;
      debug.profile(3);
      // 回到首次已成功产生事件的活动区域整理，模拟玩家退出后继续游动。
      state.player.x = origin.x;
      state.player.y = origin.y;
      return {
        phase: state.feedingEvent.phase,
        alive: state.player.health > 0,
        statuses: state.rivalSquads.map((squad: any) => squad.status),
      };
    }, { x: opening.playerX, y: opening.playerY });
    expect(exit.phase).toBe('COOLDOWN');
    expect(exit.alive).toBe(true);
    expect(exit.statuses.every((status: string) => status === 'RETREATING' || status === 'RECOVERING')).toBe(true);

    const secondEncounter = await page.evaluate((firstId) => {
      const debug = (window as unknown as { __FISH_DEBUG__: any }).__FISH_DEBUG__;
      let advanced = 0;
      while (advanced < 120 * 60) {
        debug.profile(30);
        advanced += 30;
        const event = debug.state().feedingEvent;
        if (event.id !== firstId && event.phase === 'WARNING') break;
      }
      const state = debug.state();
      return {
        advanced,
        eventId: state.feedingEvent.id,
        phase: state.feedingEvent.phase,
        statuses: state.rivalSquads.map((squad: any) => squad.status),
        rivalCount: state.entities.filter((entity: any) => entity.ownerId?.startsWith('rival-')).length,
      };
    }, firstWarning.eventId);
    expect(secondEncounter.eventId).not.toBe(firstWarning.eventId);
    expect(secondEncounter.phase).toBe('WARNING');
    expect(secondEncounter.advanced).toBeLessThanOrEqual(120 * 60);
    expect(secondEncounter.statuses.every((status: string) => status === 'APPROACHING')).toBe(true);
    expect(secondEncounter.rivalCount).toBeGreaterThan(0);

    console.log('[G2 slice]', JSON.stringify({ opening, firstWarning, participation, exit, secondEncounter }));
  });
});
