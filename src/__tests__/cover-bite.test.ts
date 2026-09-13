/**
 * 「藏进水草后：视野度下降 + 被咬概率大幅下降」的回归防护。
 *
 * 背景（用户反馈「水草下面视野度降低，被击杀的概率大幅度降低」）：
 *   原有的 `canPerceive` 只管「能不能**锁定**目标」。可一旦被识破（贴脸破功 /
 *   被声呐照到），后面的扑咬判定里**完全没有隐蔽项** —— 体型 2 倍以上的猎手基础
 *   命中率就有 0.8，藏没藏住照咬不误。「躲进去了还是被杀」正来自这里。
 *
 * 本文件钉两件事：
 *   ① 掩体把贴脸识破距离压到 `CONCEAL_REVEAL_RANGE` —— 视野度 ↓
 *   ② 真被识破之后，扑咬命中率还要乘 `CONCEAL_BITE_PROB_MULT` —— 落空概率 ↑
 *
 * ⚠️ 纪律：骰点一律 mock 成固定值，**不掷骰子做断言**。
 *    0.5 / 0.15 这两个点把「掩体后的命中率」夹在 (0.15, 0.5) 之间 ——
 *    既证明是大幅下降，也证明不是「绝对无敌」。
 * ⚠️ jsdom 环境的 `Math.random` mock **不会自动还原**（vitest.config.ts 没开
 *    restoreMocks），同文件内的用例会互相污染 → 本文件自己 afterEach 还原。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { aiSystem } from '../systems/ai';
import { concealmentSystem, CONCEAL_REVEAL_RANGE } from '../systems/concealment';
import { processCollision } from '../systems/combat';
import { MAP_CENTER } from '../systems/terrain';
import { CreatureType } from '../data/creatures';
import { EventBus } from '../core/EventBus';
import { GameStatus } from '../types';
import type { FrameContext, GameEvents, Obstacle } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

/**
 * 一小丛水草盖住玩家（半径 100 → 掩体半径 85）。
 * 刻意取小：让「100px 外」的猎手落在草丛**外面**，免得它自己的 `inCover`
 * 成为另一个变量。
 */
const seaweedOnPlayer = (): Obstacle[] => [
  { id: 'sw-1', x: MAP_CENTER.x, y: MAP_CENTER.y, radius: 100, type: 'SEAWEED' },
];

/** 大鱼在右、玩家藏在中心草丛里 */
const setupHiddenChase = (distance: number) => {
  const state = createInitialState();
  state.time = 1; // 避开 aggressive 的 time % 140 随机转向，否则角度被随机量污染
  state.player.x = MAP_CENTER.x;
  state.player.y = MAP_CENTER.y;
  state.obstacles = seaweedOnPlayer();
  const fish = createEntity(CreatureType.HAMMERHEAD, MAP_CENTER.x + distance, MAP_CENTER.y, {
    moodId: 'CALM',
  });
  fish.semiGhostTimer = 0;
  fish.angle = 0; // 背对玩家：真锁定了才会被 turnToward 掰向 π
  state.entities = [fish];
  concealmentSystem(state);
  return { state, fish };
};

/**
 * 让双髻鲨咬玩家一口，返回玩家掉了多少血。
 * 鲨鱼 level 4 > 玩家 1、体型 2 倍以上 → 基础命中率被顶到 1.0，
 * 于是「咬不咬得中」只由掩体倍率决定，骰点固定即可得到确定结果。
 */
const bitePlayerWithRoll = (roll: number, hiddenInSeaweed: boolean) => {
  vi.spyOn(Math, 'random').mockReturnValue(roll);
  const state = createInitialState();
  state.status = GameStatus.PLAYING;
  state.player.camoActive = false;
  state.player.invulnerableTimer = 0;
  state.obstacles = hiddenInSeaweed ? seaweedOnPlayer() : [];

  const shark = createEntity(CreatureType.HAMMERHEAD, state.player.x - 40, state.player.y);
  shark.semiGhostTimer = 0;
  shark.biteCooldown = 0;
  shark.angle = 0; // 正对玩家（玩家在它右边）
  state.entities = [shark];

  concealmentSystem(state);
  const before = state.player.health;
  processCollision(shark, state.player, state, makeCtx());
  return { hpLoss: before - state.player.health, inCover: state.player.inCover };
};

afterEach(() => {
  vi.restoreAllMocks();
});

/* ══════════════ 1. 视野度下降 ══════════════ */

describe('水草掩体：视野度下降', () => {
  it('藏进草丛后，100px 外的猎手已经看不见了（改造前 150px 内就会被识破）', () => {
    const { state, fish } = setupHiddenChase(100);
    expect(state.player.inCover).toBe(true);
    // 用例前提：这个距离确实已经超出识破范围，否则测的是别的东西
    expect(100).toBeGreaterThan(CONCEAL_REVEAL_RANGE);

    aiSystem(state, makeCtx());

    // 朝向没被掰动 = 没锁定（锁定的话会被 turnToward 掰向 π）
    expect(fish.angle).toBe(0);
  });

  it('对照：贴到脸上（CONCEAL_REVEAL_RANGE 内）照样被识破', () => {
    // 75 落在「双髻鲨 r50 + 玩家 r17 = 67」与识破范围之间 —— 距离比 67 还近的话
    // 会撞上 ai.ts 的 `isOverlapping`（重叠时刻意不转向），测的就不是识破了。
    const FACE_TO_FACE = 75;
    expect(FACE_TO_FACE).toBeLessThan(CONCEAL_REVEAL_RANGE);
    const { state, fish } = setupHiddenChase(FACE_TO_FACE);
    expect(state.player.inCover).toBe(true);

    aiSystem(state, makeCtx());

    expect(fish.angle).not.toBe(0);
  });
});

/* ══════════════ 2. 被咬中的概率大幅下降 ══════════════ */

describe('水草掩体：被咬中的概率大幅下降', () => {
  it('同一个骰点（0.5）：站在外面会被咬，藏进草丛里落空', () => {
    const exposed = bitePlayerWithRoll(0.5, false);
    expect(exposed.inCover).toBe(false);
    expect(exposed.hpLoss).toBeGreaterThan(0);

    const covered = bitePlayerWithRoll(0.5, true);
    expect(covered.inCover).toBe(true);
    expect(covered.hpLoss).toBe(0);
  });

  it('掩体不是无敌：骰点压到 0.15 仍然会被咬中（只是概率大降）', () => {
    const covered = bitePlayerWithRoll(0.15, true);
    expect(covered.inCover).toBe(true);
    expect(covered.hpLoss).toBeGreaterThan(0);
  });
});
