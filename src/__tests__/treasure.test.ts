/**
 * 宝藏事件测试 —— 直接驱动 systems/events.ts 的真实逻辑。
 *
 * 这个文件的旧版本是自己复制了一份实现来测（mock 了 createParticle / dist / createTreasure），
 * 结果源码怎么改它都不会失败，属于典型的「假测试」。现在改成跑真实系统。
 */

import { describe, it, expect } from 'vitest';
import { EventBus } from '../core/EventBus';
import { spawnTreasure, updateTreasures } from '../systems/events';
import { createInitialState } from '../factories/initialState';
import { TREASURE_CONFIG } from '../data/world';
import { GameStatus, type FrameContext, type GameEvents, type Treasure } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const makeState = () => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  return state;
};

/** 在玩家脚下放一个宝藏，避免依赖随机生成的位置 */
const putTreasureAtPlayer = (state: ReturnType<typeof makeState>, overrides: Partial<Treasure> = {}): Treasure => {
  const treasure: Treasure = {
    id: 'test-treasure',
    x: state.player.x,
    y: state.player.y,
    type: 'FEAST',
    status: 'WARNING',
    timer: TREASURE_CONFIG.WARNING_DURATION + TREASURE_CONFIG.ACTIVE_DURATION,
    radius: TREASURE_CONFIG.RADIUS,
    effect: 'EXP',
    rewardValue: 800,
    ...overrides,
  };
  state.treasures.push(treasure);
  return treasure;
};

describe('宝藏事件系统', () => {
  it('生成后进入预告状态，总时长 = 预告 3 秒 + 存活 10 秒', () => {
    const state = makeState();
    const ctx = makeCtx();

    spawnTreasure(state, ctx);

    expect(state.treasures).toHaveLength(1);
    const treasure = state.treasures[0];
    expect(treasure.status).toBe('WARNING');
    expect(treasure.timer).toBe(
      TREASURE_CONFIG.WARNING_DURATION + TREASURE_CONFIG.ACTIVE_DURATION
    );
  });

  it('预告恰好 3 秒（180 帧）后转为可拾取', () => {
    const state = makeState();
    const ctx = makeCtx();
    const treasure = putTreasureAtPlayer(state);

    // 推进到预告的最后一帧，应该还是 WARNING
    for (let i = 0; i < TREASURE_CONFIG.WARNING_DURATION - 1; i += 1) {
      updateTreasures(state, ctx);
    }
    expect(treasure.status).toBe('WARNING');

    updateTreasures(state, ctx);
    expect(treasure.status).toBe('ACTIVE');
  });

  it('激活后再活 10 秒（600 帧）才过期', () => {
    const state = makeState();
    const ctx = makeCtx();
    // 放远一点，否则刚激活就被玩家捡走，测不到存活时长
    const treasure = putTreasureAtPlayer(state, {
      x: state.player.x + 2000,
      y: state.player.y + 2000,
    });

    for (let i = 0; i < TREASURE_CONFIG.WARNING_DURATION; i += 1) updateTreasures(state, ctx);
    expect(treasure.status).toBe('ACTIVE');

    for (let i = 0; i < TREASURE_CONFIG.ACTIVE_DURATION - 1; i += 1) updateTreasures(state, ctx);
    expect(state.treasures.some((t) => t.id === treasure.id)).toBe(true);

    updateTreasures(state, ctx);
    expect(state.treasures.some((t) => t.id === treasure.id)).toBe(false);
  });

  it('预告阶段碰到了也拿不到', () => {
    const state = makeState();
    const ctx = makeCtx();
    putTreasureAtPlayer(state);

    const weightBefore = state.player.weight;
    for (let i = 0; i < 30; i += 1) updateTreasures(state, ctx);

    expect(state.player.weight).toBe(weightBefore);
  });

  it('激活后碰到了能拿到经验', () => {
    const state = makeState();
    const ctx = makeCtx();
    const treasure = putTreasureAtPlayer(state);
    const weightBefore = state.player.weight;

    // 第 180 帧：先转为 ACTIVE，同一帧内完成拾取判定
    for (let i = 0; i < TREASURE_CONFIG.WARNING_DURATION; i += 1) updateTreasures(state, ctx);

    expect(state.player.weight).toBe(weightBefore + (treasure.rewardValue ?? 0));
    expect(state.treasures.some((t) => t.id === treasure.id)).toBe(false);
  });
});
