/**
 * 加速冲刺（Space）的速度倍率。
 *
 * 2026-09-13 用户反馈「游动速度太慢了，可以把加速提高一倍」→ `BOOST_CONFIG.SPEED_MULTIPLIER`
 * 2.2 → **4.4**。这条改动很容易「改错地方」：倍率只在 `systems/playerControl.ts` 里乘一次，
 * 常速（`player.speed`）和体力（`MAX_ENERGY` / `DRAIN_RATE`）都不该跟着动。所以用行为断言钉住：
 *   - 不按 Space：每帧位移 = `player.speed`（挑无速度加成的生态区）
 *   - 按住 Space：每帧位移 = `player.speed` × `SPEED_MULTIPLIER`
 *   - 体力为 0：按了也不加速（不能变成无限冲刺）
 *
 * ⚠️ 断言比的是**常量本身**而不是写死 4.4：以后调参不会假报错，但「冲刺必须明显快于常速」
 * 这条不变量会守住。
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { playerControlSystem } from '../systems/playerControl';
import { BOOST_CONFIG } from '../data/world';
import { EventBus } from '../core/EventBus';
import { GameStatus, type FrameContext, type GameEvents } from '../types';

const makeCtx = (space: boolean): FrameContext => ({
  // 指向正右方 → 目标朝向 0，和初始朝向一致，这一帧不会发生转向（位移只由速度决定）
  mouse: { x: 1280 / 2 + 300, y: 720 / 2 },
  input: { space, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

/** 中立生态区：REEF 的 speedBonusMaxTier = 0，任何鱼都吃不到它的速度加成，干扰项清零 */
const makeState = () => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  state.player.currentBiome = 'REEF';
  state.player.angle = 0;
  state.player.x = 3000;
  state.player.y = 3000;
  return state;
};

/** 跑一帧，返回沿 +x 的实际位移 */
const runFrame = (space: boolean, energy = BOOST_CONFIG.MAX_ENERGY) => {
  const state = makeState();
  state.player.boost.current = energy;
  const x0 = state.player.x;
  playerControlSystem(state, makeCtx(space));
  return { state, dx: state.player.x - x0 };
};

describe('加速冲刺的速度倍率', () => {
  it('不按 Space：每帧位移 = player.speed，且 boost.active 为 false', () => {
    const { state, dx } = runFrame(false);

    expect(dx).toBeCloseTo(state.player.speed, 6);
    expect(state.player.boost.active).toBe(false);
  });

  it('按住 Space：每帧位移 = player.speed × SPEED_MULTIPLIER', () => {
    const { state, dx } = runFrame(true);

    expect(dx).toBeCloseTo(state.player.speed * BOOST_CONFIG.SPEED_MULTIPLIER, 6);
    expect(state.player.boost.active).toBe(true);
  });

  it('提速幅度：冲刺 / 常速 == SPEED_MULTIPLIER，且冲刺必须明显快于常速（≥ 2 倍）', () => {
    const slow = runFrame(false);
    const fast = runFrame(true);
    const ratio = fast.dx / slow.dx;

    expect(ratio).toBeCloseTo(BOOST_CONFIG.SPEED_MULTIPLIER, 6);
    // 不变量：加速得是「明显更快」，不能退化成聊胜于无的 1.x 倍
    expect(ratio).toBeGreaterThanOrEqual(2);
  });

  it('体力耗尽后按住 Space 也不加速（不会变成无限冲刺）', () => {
    const { state, dx } = runFrame(true, 0);

    expect(state.player.boost.active).toBe(false);
    expect(dx).toBeCloseTo(state.player.speed, 6);
  });

  it('加速每帧按 DRAIN_RATE 扣体力（提速没顺手改体力消耗）', () => {
    const { state } = runFrame(true, BOOST_CONFIG.MAX_ENERGY);

    expect(state.player.boost.current).toBeCloseTo(
      BOOST_CONFIG.MAX_ENERGY - BOOST_CONFIG.DRAIN_RATE,
      6
    );
  });
});
