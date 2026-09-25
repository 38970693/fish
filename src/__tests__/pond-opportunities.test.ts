import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createInitialState } from '../factories/initialState';
import { LILY_OBSERVATION } from '../data/pondOpportunities';
import { scoreGain } from '../data/ponds';
import { pondOpportunitySystem } from '../systems/pondOpportunities';
import { pondEventSystem } from '../systems/pondEvents';
import { aiSystem } from '../systems/ai';
import type { FrameContext, GameEvents } from '../types';
import { CreatureType } from '../data/creatures';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

describe('程序化塘专属机会', () => {
  it('清水睡莲观察 2 秒后单次治疗和得分，不生成敌人', () => {
    const state = createInitialState({ mode: 'RIVALS', pondLayout: 'PROCEDURAL', pondSeed: 41, pondId: 'CLEAR', skipWorldGen: true });
    const lily = state.pondLayout!.landmarks.find(landmark => landmark.kind === 'LILY')!;
    state.player.x = lily.x;
    state.player.y = lily.y;
    state.player.health = state.player.maxHealth * 0.5;
    const initialEntities = state.entities.length;
    const ctx = makeCtx();

    pondOpportunitySystem(state, ctx);
    expect(state.pondOpportunity?.prompt).toContain('按 E');
    ctx.input.interact = true;
    pondOpportunitySystem(state, ctx);
    expect(state.pondOpportunity?.phase).toBe('OBSERVING');
    ctx.input.interact = false;
    for (let i = 0; i < LILY_OBSERVATION.DURATION; i += 1) pondOpportunitySystem(state, ctx);

    expect(state.pondOpportunity?.phase).toBe('COMPLETED');
    expect(state.player.health).toBeCloseTo(state.player.maxHealth * 0.6, 5);
    expect(state.score).toBe(scoreGain('CLEAR', LILY_OBSERVATION.BASE_SCORE));
    expect(state.entities).toHaveLength(initialEntities);

    const score = state.score;
    ctx.input.interact = true;
    pondOpportunitySystem(state, ctx);
    expect(state.score).toBe(score);
  });

  it('主要投食冲突会阻止/中断睡莲观察，但睡莲本身不改投食状态', () => {
    const state = createInitialState({ mode: 'RIVALS', pondLayout: 'PROCEDURAL', pondSeed: 42, pondId: 'CLEAR', skipWorldGen: true });
    const lily = state.pondLayout!.landmarks.find(landmark => landmark.kind === 'LILY')!;
    state.player.x = lily.x;
    state.player.y = lily.y;
    state.feedingEvent!.phase = 'WARNING';
    state.feedingEvent!.timer = 77;
    const ctx = makeCtx();
    ctx.input.interact = true;
    pondOpportunitySystem(state, ctx);
    expect(state.pondOpportunity?.phase).toBe('AVAILABLE');
    expect(state.feedingEvent!.phase).toBe('WARNING');
    expect(state.feedingEvent!.timer).toBe(77);
  });

  it('程序化珊瑚事件固定到产卵场，主要冲突结束后延后触发且同帧不重复结算', () => {
    const state = createInitialState({ mode: 'RIVALS', pondLayout: 'PROCEDURAL', pondSeed: 81, pondId: 'CORAL', skipWorldGen: true });
    const nursery = state.pondLayout!.landmarks.find(landmark => landmark.kind === 'NURSERY')!;
    state.time = 3600;
    state.feedingEvent!.phase = 'WARNING';
    state.feedingEvent!.timer = 50;
    const ctx = makeCtx();
    pondEventSystem(state, ctx);
    expect(state.powerUps).toHaveLength(0);
    expect(state.pendingPondEvent?.scheduledAt).toBe(3600);

    state.time += 1;
    state.feedingEvent!.phase = 'COOLDOWN';
    pondEventSystem(state, ctx);
    const coins = state.powerUps.filter(powerUp => powerUp.type === 'COIN');
    expect(coins).toHaveLength(6);
    coins.forEach(coin => expect(Math.hypot(coin.x - nursery.x, coin.y - nursery.y)).toBeLessThanOrEqual(260));
    pondEventSystem(state, ctx);
    expect(state.powerUps.filter(powerUp => powerUp.type === 'COIN')).toHaveLength(6);
  });

  it('程序化深渊仍只生成 6 条星光鱼，并沿三点路线游过沉船', () => {
    const state = createInitialState({ mode: 'RIVALS', pondLayout: 'PROCEDURAL', pondSeed: 91, pondId: 'ABYSS', skipWorldGen: true });
    state.time = 2400;
    state.feedingEvent!.phase = 'COOLDOWN';
    pondEventSystem(state, makeCtx());
    const school = state.entities.filter(entity => entity.type === CreatureType.STARLIGHT_FISH);
    expect(school).toHaveLength(6);
    expect(school.every(entity => entity.eventRoute?.routeId === 'abyss-starlight')).toBe(true);
    const before = school.map(entity => ({ x: entity.x, y: entity.y }));
    aiSystem(state, makeCtx());
    expect(school.some((entity, i) => Math.hypot(entity.x - before[i].x, entity.y - before[i].y) > 0)).toBe(true);
  });
});
