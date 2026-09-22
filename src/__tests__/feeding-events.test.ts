import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import { FEEDING_EVENT_CONFIG } from '../data/feedingEvents';
import { TREASURE_CONFIG } from '../data/world';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { eventsSystem } from '../systems/events';
import { feedingEventSystem, findFeedingEventLocation, resolveFeedingPickups } from '../systems/feedingEvents';
import { CreatureType, type FeedingDrop, type FrameContext, type GameEvents } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

afterEach(() => vi.restoreAllMocks());

describe('FQ-07 投食争夺事件', () => {
  it('只在 RIVALS 初始化事件日程，首次等待为 45～60 秒', () => {
    const rivals = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    const legacy = createInitialState({ mode: 'LEGACY', skipWorldGen: true });

    expect(rivals.feedingEvent?.phase).toBe('WAITING');
    expect(rivals.feedingEvent!.timer).toBeGreaterThanOrEqual(FEEDING_EVENT_CONFIG.FIRST_DELAY_MIN);
    expect(rivals.feedingEvent!.timer).toBeLessThanOrEqual(FEEDING_EVENT_CONFIG.FIRST_DELAY_MAX);
    expect(legacy.feedingEvent).toBeUndefined();
  });

  it('等待结束后选出玩家能赶到的合法落点，并进入 8 秒预告', () => {
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    const ctx = makeCtx();
    state.feedingEvent!.timer = 1;

    feedingEventSystem(state, ctx);

    const event = state.feedingEvent!;
    const distance = Math.hypot(event.x! - state.player.x, event.y! - state.player.y);
    expect(event.phase).toBe('WARNING');
    expect(event.timer).toBe(FEEDING_EVENT_CONFIG.WARNING_DURATION);
    expect(distance).toBeGreaterThanOrEqual(FEEDING_EVENT_CONFIG.PLACEMENT_MIN_DISTANCE);
    expect(distance).toBeLessThanOrEqual(FEEDING_EVENT_CONFIG.PLACEMENT_MAX_DISTANCE);
  });

  it('没有合法落点时有限尝试后推迟，不生成进障碍里', () => {
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    state.obstacles = [{
      id: 'blocked-map', x: state.player.x, y: state.player.y, radius: 5000, type: 'ROCK',
    }];
    state.feedingEvent!.timer = 1;

    feedingEventSystem(state, makeCtx());

    expect(state.feedingEvent!.phase).toBe('WAITING');
    expect(state.feedingEvent!.timer).toBe(FEEDING_EVENT_CONFIG.RETRY_DELAY);
    expect(state.feedingEvent!.x).toBeNull();
  });

  it('随机候选反复撞障碍时，会用确定环形扫描找到其他合法方向', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    state.obstacles = [{
      id: 'east-block', x: state.player.x + 600, y: state.player.y, radius: 190, type: 'ROCK',
    }];
    state.feedingEvent!.timer = 1;

    feedingEventSystem(state, makeCtx());

    expect(state.feedingEvent!.phase).toBe('WARNING');
    expect(state.feedingEvent!.x).not.toBeNull();
    expect(Math.hypot(state.feedingEvent!.x! - state.obstacles[0].x, state.feedingEvent!.y! - state.obstacles[0].y))
      .toBeGreaterThan(state.obstacles[0].radius + FEEDING_EVENT_CONFIG.EVENT_RADIUS);
  });

  it('玩家贴着障碍起步时跳过脚下短段，仍能选择后续畅通路线', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    state.obstacles = [{
      id: 'start-cover', x: state.player.x, y: state.player.y, radius: 100, type: 'ROCK',
    }];
    state.feedingEvent!.timer = 1;

    feedingEventSystem(state, makeCtx());

    expect(state.feedingEvent!.phase).toBe('WARNING');
    expect(Math.hypot(state.feedingEvent!.x! - state.player.x, state.feedingEvent!.y! - state.player.y))
      .toBeGreaterThanOrEqual(FEEDING_EVENT_CONFIG.PLACEMENT_MIN_DISTANCE);
  });

  it('新随机落点都失败时，可复用仍然合法的上一处落点', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    state.obstacles = [{
      id: 'east-block', x: state.player.x + 560, y: state.player.y, radius: 180, type: 'ROCK',
    }];
    state.feedingEvent!.lastX = state.player.x;
    state.feedingEvent!.lastY = state.player.y + 700;

    expect(findFeedingEventLocation(state)).toEqual({
      x: state.player.x,
      y: state.player.y + 700,
    });
  });

  it('预告结束后分批掉落，持续期结束进入 10 秒残留阶段', () => {
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    const ctx = makeCtx();
    const event = state.feedingEvent!;
    event.phase = 'WARNING';
    event.x = state.player.x + 700;
    event.y = state.player.y;
    event.timer = 1;

    feedingEventSystem(state, ctx);
    expect(event.phase).toBe('DROPPING');
    expect(event.timer).toBe(FEEDING_EVENT_CONFIG.DROP_DURATION);

    event.timer = 1;
    event.nextDropIn = 0;
    feedingEventSystem(state, ctx);
    expect(event.totalSpawned).toBe(FEEDING_EVENT_CONFIG.DROP_BATCH_SIZE);
    expect(event.drops).toHaveLength(FEEDING_EVENT_CONFIG.DROP_BATCH_SIZE);
    expect(event.phase).toBe('LINGERING');
    expect(event.timer).toBe(FEEDING_EVENT_CONFIG.LINGER_DURATION);
  });

  it('队友拾取会给玩家阵营成长，同一份食物只结算一次', () => {
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    const ctx = makeCtx();
    const member = createEntity(CreatureType.CLOWN_FISH, state.player.x + 300, state.player.y);
    member.ownerId = 'player';
    member.health = member.maxHealth / 2;
    state.entities.push(member);
    const drop: FeedingDrop = {
      id: 'drop-player', x: member.x, y: member.y, radius: 12, value: 8,
    };
    state.feedingEvent!.drops = [drop];
    const weightBefore = state.player.weight;
    const evolutionBefore = state.player.evolutionPoints;

    resolveFeedingPickups(state, ctx);
    resolveFeedingPickups(state, ctx);

    expect(state.player.weight).toBe(weightBefore + drop.value);
    expect(state.player.evolutionPoints).toBe(evolutionBefore + drop.value);
    expect(member.health).toBeGreaterThan(member.maxHealth / 2);
    expect(state.feedingEvent!.drops).toHaveLength(0);
    expect(state.feedingEvent!.claims.PLAYER).toBe(drop.value);
  });

  it('敌对阵营抢到食物时只恢复拾取者并记录阵营收益', () => {
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    const ctx = makeCtx();
    const enemy = createEntity(CreatureType.CLOWN_FISH, state.player.x + 300, state.player.y);
    enemy.ownerId = 'rival-scavengers';
    enemy.health = 1;
    state.entities.push(enemy);
    const drop: FeedingDrop = {
      id: 'drop-rival', x: enemy.x, y: enemy.y, radius: 12, value: 8,
    };
    state.feedingEvent!.drops = [drop];
    const weightBefore = state.player.weight;

    resolveFeedingPickups(state, ctx);

    expect(state.player.weight).toBe(weightBefore);
    expect(enemy.health).toBeGreaterThan(1);
    expect(state.feedingEvent!.claims['rival-scavengers']).toBe(drop.value);
    expect(state.feedingEvent!.drops).toHaveLength(0);
  });

  it('残留结束后清理未拾取食物，并进入 75～100 秒冷却', () => {
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    const event = state.feedingEvent!;
    event.phase = 'LINGERING';
    event.timer = 1;
    event.drops = [{ id: 'leftover', x: 100, y: 100, radius: 12, value: 8 }];

    feedingEventSystem(state, makeCtx());

    expect(event.phase).toBe('COOLDOWN');
    expect(event.drops).toHaveLength(0);
    expect(event.timer).toBeGreaterThanOrEqual(FEEDING_EVENT_CONFIG.REPEAT_DELAY_MIN);
    expect(event.timer).toBeLessThanOrEqual(FEEDING_EVENT_CONFIG.REPEAT_DELAY_MAX);
  });

  it('投食处于主要阶段时，RIVALS 通用宝藏不会叠加生成', () => {
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    state.time = TREASURE_CONFIG.SPAWN_INTERVAL;
    state.feedingEvent!.phase = 'WARNING';

    eventsSystem(state, makeCtx());

    expect(state.treasures).toHaveLength(0);
  });
});
