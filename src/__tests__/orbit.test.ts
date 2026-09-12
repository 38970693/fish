/**
 * 「鱼原地转圈圈」回归测试。
 *
 * 病根（2026-09-12 定位，用户报「还是会有鱼原地转圈圈」）：
 *   1. 实体之间没有分离力，可以互相重叠。一旦追 / 逃的双方贴到几乎重合，
 *      `atan2` 就掉进奇点 —— 相对位移抖动一丁点，「目标在我哪边」就能翻半圈，
 *      于是鱼每帧都以最大敏捷转向，转弯半径缩到 1px 以内。
 *   2. 鱼群里「最近目标」每帧易主：若干条威胁距离相近时，方位角每两帧跳 ~2 rad，
 *      抖动被进一步放大成持续转圈。
 *
 * 修复（src/systems/ai.ts）：
 *   · `isOverlapping` —— 双方已经重叠时不再追方位角，保持朝向直冲出去
 *   · `TARGET_HYSTERESIS_SQ` —— 锁定迟滞，新目标要近 1.25 倍才换
 *
 * 判据用**转弯半径**（路程 ÷ 角扫掠）而不是「转了几圈」：绕大圈游动的鱼
 * 转再多圈也正常，只有「转了很多圈却几乎没挪窝」才是 bug。
 * 修复前最坏 90.9 圈 / 半径 0.79px，修复后最坏 6.4 圈 / 半径 49.7px。
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { updateGame } from '../gameEngine';
import { createEntity } from '../systems/spawn';
import { aiSystem } from '../systems/ai';
import { MAP_CENTER } from '../systems/terrain';
import { CreatureType } from '../data/creatures';
import { EventBus } from '../core/EventBus';
import { GameStatus } from '../types';
import type { FrameContext, GameEvents } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

/** 角度差归一到 [-π, π] */
const deltaAngle = (a: number, b: number): number => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** 钉随机种子：这一组断言依赖具体场景，掷骰子会让它变成 flaky */
const withSeededRandom = <T>(seed: number, fn: () => T): T => {
  const orig = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
};

const MIX = [
  CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG, CreatureType.TURTLE,
  CreatureType.SEAHORSE, CreatureType.CRAB, CreatureType.PUFFER_FISH,
  CreatureType.SQUID, CreatureType.ELECTRIC_EEL, CreatureType.STINGRAY,
  CreatureType.SWORD_FISH, CreatureType.HAMMERHEAD, CreatureType.FUR_SEAL,
];

interface Track {
  type: string;
  sweep: number;
  path: number;
  lastX: number;
  lastY: number;
  lastAngle: number;
}

/**
 * 转弯半径下限（px）：比这还小，就说明鱼在原地磨蹭而不是在游动。
 * 修好之后实测最小半径 49.7px，取 12 是为了留出余量又不至于放过真 bug。
 */
const MIN_SANE_RADIUS = 12;

describe('鱼不会原地转圈', () => {
  it('混合鱼群连跑 600 帧：没有鱼在小半径上磨蹭', () => {
    const spinners = withSeededRandom(12345, () => {
      const state = createInitialState({ pondId: 'CLEAR', skipWorldGen: true });
      state.status = GameStatus.PLAYING;
      const p = state.player;
      p.x = MAP_CENTER.x;
      p.y = MAP_CENTER.y;
      p.speed = 0;
      p.isGodMode = true;
      p.invulnerableTimer = 999999;

      MIX.forEach((t, i) => {
        const ang = (i / MIX.length) * Math.PI * 2;
        const d = 300 + (i % 3) * 180;
        state.entities.push(
          createEntity(t, MAP_CENTER.x + Math.cos(ang) * d, MAP_CENTER.y + Math.sin(ang) * d)
        );
      });

      const tracks = new Map<string, Track>();
      const mouse = { x: MAP_CENTER.x, y: MAP_CENTER.y };

      for (let f = 0; f < 600; f += 1) {
        updateGame(state, mouse, false, false, false, 1280, 720);
        // 玩家钉死：别让进化 / 死亡打断世界推进
        state.player.evolutionPoints = 0;
        state.player.invulnerableTimer = 999999;
        if (state.status !== GameStatus.PLAYING) state.status = GameStatus.PLAYING;

        for (const e of state.entities) {
          let t = tracks.get(e.id);
          if (!t) {
            t = { type: e.type, sweep: 0, path: 0, lastX: e.x, lastY: e.y, lastAngle: e.angle };
            tracks.set(e.id, t);
          }
          t.sweep += Math.abs(deltaAngle(e.angle, t.lastAngle));
          t.path += Math.hypot(e.x - t.lastX, e.y - t.lastY);
          t.lastAngle = e.angle;
          t.lastX = e.x;
          t.lastY = e.y;
        }
      }

      // 场景有效性：真的跑起来了一池鱼，否则下面的断言是空过
      expect(tracks.size).toBeGreaterThan(30);

      return [...tracks.values()]
        .filter((t) => t.sweep >= Math.PI * 4 && t.path > 200 && t.path / t.sweep < MIN_SANE_RADIUS)
        .map(
          (t) =>
            `${t.type} 转${(t.sweep / (Math.PI * 2)).toFixed(1)}圈 半径${(t.path / t.sweep).toFixed(1)}px`
        );
    });

    expect(spinners).toEqual([]);
  });

  it('猎物压在身上（重叠）时不再追方位角 —— 原地转圈的第一味药', () => {
    const state = createInitialState();
    state.time = 1; // 避开 aggressive 的 time % 140 随机转向，否则角度被随机量污染
    state.player.x = MAP_CENTER.x;
    state.player.y = MAP_CENTER.y;
    // 双髻鲨半径 50 + 玩家 12 = 62；摆在 20px 处 = 深度重叠
    const fish = createEntity(CreatureType.HAMMERHEAD, MAP_CENTER.x + 20, MAP_CENTER.y, {
      moodId: 'CALM',
    });
    fish.angle = 0;
    state.entities = [fish];

    aiSystem(state, makeCtx());

    // 方位角在重叠点已不可信，此时不该转向 —— 转了就是原地打转的前兆
    expect(fish.angle).toBe(0);
  });

  it('对照组：没重叠时照常转向猎物', () => {
    const state = createInitialState();
    state.time = 1;
    state.player.x = MAP_CENTER.x;
    state.player.y = MAP_CENTER.y;
    const fish = createEntity(CreatureType.HAMMERHEAD, MAP_CENTER.x + 600, MAP_CENTER.y, {
      moodId: 'CALM',
    });
    fish.angle = 0;
    state.entities = [fish];

    aiSystem(state, makeCtx());

    expect(fish.angle).not.toBe(0);
  });
});
