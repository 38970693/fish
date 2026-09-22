import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { BUILDING_DATA, BuildingType } from '../data/buildings';
import { SHIPWRECK_EXPLORATION } from '../data/explorationEvents';
import { CreatureType } from '../data/creatures';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { explorationEventSystem } from '../systems/explorationEvents';
import { feedingEventSystem } from '../systems/feedingEvents';
import { dealDamage } from '../systems/combat';
import type { FrameContext, GameEvents, GameState } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const wreckState = (): GameState => {
  const state = createInitialState({ pondId: 'ABYSS', skipWorldGen: true });
  state.buildings = [{
    id: 'wreck-test', x: state.player.x, y: state.player.y,
    type: BuildingType.SHIPWRECK, radius: BUILDING_DATA.SHIPWRECK.radius, cooldown: 0,
  }];
  return state;
};

const startSearch = (state: GameState, ctx: FrameContext): void => {
  explorationEventSystem(state, ctx);
  ctx.input.interact = true;
  explorationEventSystem(state, ctx);
  ctx.input.interact = false;
  expect(state.exploration?.phase).toBe('SEARCHING');
};

describe('沉船探索事件', () => {
  it('靠近只显示提示，不会像旧版一样自动领奖', () => {
    const state = wreckState();
    explorationEventSystem(state, makeCtx());
    expect(state.buildings[0].prompt?.text).toContain('按 E 搜索');
    expect(state.score).toBe(0);
    expect(state.powerUps).toHaveLength(0);
  });

  it('完成三秒搜索只结算一次，并保留旧成就事件语义', () => {
    const state = wreckState();
    const ctx = makeCtx();
    const uses: string[] = [];
    ctx.events.on('buildingUse', event => uses.push(event.type));
    startSearch(state, ctx);
    for (let frame = 0; frame < SHIPWRECK_EXPLORATION.SEARCH_DURATION; frame += 1) {
      explorationEventSystem(state, ctx);
    }
    expect(state.exploration?.phase).toBe('COMPLETED');
    expect(state.exploration?.claimedByPond.ABYSS).toBe(true);
    expect(state.powerUps.filter(item => item.type === 'COIN')).toHaveLength(5);
    expect(state.entities.filter(entity => entity.type === CreatureType.VAMPIRE_SQUID)).toHaveLength(1);
    expect(uses).toEqual([BuildingType.SHIPWRECK]);

    const score = state.score;
    for (let frame = 0; frame < 240; frame += 1) explorationEventSystem(state, ctx);
    expect(state.score).toBe(score);
    expect(state.powerUps.filter(item => item.type === 'COIN')).toHaveLength(5);
    expect(uses).toHaveLength(1);
  });

  it('离开搜索范围会中断，回去可以重新开始', () => {
    const state = wreckState();
    const ctx = makeCtx();
    startSearch(state, ctx);
    state.player.x += BUILDING_DATA.SHIPWRECK.radius + SHIPWRECK_EXPLORATION.INTERACT_PADDING + 10;
    explorationEventSystem(state, ctx);
    expect(state.exploration?.phase).toBe('AVAILABLE');
    expect(state.exploration?.lastResult?.text).toContain('离开');
    expect(state.score).toBe(0);
  });

  it('受击或大型敌鱼逼近会中断搜索', () => {
    const state = wreckState();
    const ctx = makeCtx();
    startSearch(state, ctx);
    const attacker = createEntity(CreatureType.CRAB, state.player.x + 80, state.player.y);
    dealDamage(state.player, 1, attacker);
    explorationEventSystem(state, ctx);
    expect(state.exploration?.lastResult?.text).toContain('受到攻击');

    state.player.health = state.player.maxHealth;
    ctx.input.interact = true;
    explorationEventSystem(state, ctx);
    ctx.input.interact = false;
    const predator = createEntity(CreatureType.ORCA, state.player.x + 100, state.player.y);
    predator.semiGhostTimer = 0;
    state.entities.push(predator);
    explorationEventSystem(state, ctx);
    expect(state.exploration?.lastResult?.text).toContain('危险逼近');
  });

  it('探索搜索占用主要事件槽时暂停尚未开始的投食倒计时', () => {
    const state = createInitialState({ pondId: 'ABYSS', mode: 'RIVALS', skipWorldGen: true });
    const ctx = makeCtx();
    expect(state.feedingEvent).toBeTruthy();
    state.exploration!.phase = 'SEARCHING';
    const timer = state.feedingEvent!.timer;
    feedingEventSystem(state, ctx);
    expect(state.feedingEvent!.timer).toBe(timer);
  });
});
