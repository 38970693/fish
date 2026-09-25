import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { CreatureType } from '../data/creatures';
import { createInitialState } from '../factories/initialState';
import { aiSystem } from '../systems/ai';
import { createEntity } from '../systems/spawn';
import type { FrameContext, GameEvents } from '../types';

const context = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const chaseState = (distance: number) => {
  const state = createInitialState();
  const x = 3000;
  const y = 3000;
  state.time = 1;
  state.player.x = x + 1800;
  state.player.y = y + 1800;
  state.obstacles = [];
  const hunter = createEntity(CreatureType.HAMMERHEAD, x, y, { moodId: 'CALM' });
  const first = createEntity(CreatureType.CLOWN_FISH, x + distance, y, { moodId: 'CALM' });
  const second = createEntity(CreatureType.CLOWN_FISH, x - distance, y, { moodId: 'CALM' });
  for (const entity of [hunter, first, second]) entity.semiGhostTimer = 0;
  state.entities = [hunter, first, second];
  return { state, hunter, first, second };
};

describe('AI 最近目标距离剪枝', () => {
  it('等距离仍按原实体顺序选目标，前一个隐蔽时才选后一个', () => {
    const { state, hunter, first, second } = chaseState(120);
    aiSystem(state, context());
    expect(hunter.lockId).toBe(first.id);

    hunter.x = 3000;
    hunter.y = 3000;
    first.inCover = true;
    aiSystem(state, context());
    expect(hunter.lockId).toBe(second.id);
  });

  it('感知半径边界严格排除，范围内才锁定', () => {
    const { state, hunter, first, second } = chaseState(900);
    second.health = 0;
    aiSystem(state, context());
    expect(hunter.lockId).toBeNull();

    first.x = 3000 + 899;
    hunter.x = 3000;
    hunter.y = 3000;
    aiSystem(state, context());
    expect(hunter.lockId).toBe(first.id);
  });
});
