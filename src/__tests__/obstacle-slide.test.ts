/**
 * 「撞上障碍物顿挫」回归测试。
 *
 * 病根：AI / 玩家每帧先朝目标推进（`moveForward`），如果目标在岩石另一侧，
 * 这一帧的推进方向就是「扎进石头里」，`resolveObstacles` 再把它顶回表面 ——
 * 位置每帧「进 1px 退 1px」，看上去正是撞上障碍物后原地顿挫、抖个不停。
 * `clampToMap` 处理地图边界时早就算过切向、做了平滑，障碍物这条路一直没跟上。
 *
 * 判据两条：
 *   · **绕行扫掠**：贴着岩石时绕它转过的角度。顿挫的鱼只会原地顶，扫掠 ≈ 0；
 *     修好后会顺着边缘滑过去，扫掠随帧数稳定增长。
 *   · **径向抖动量**：与岩石中心距离的变化幅度之和。原地顶 = 每帧来回，
 *     抖动量 ≈ 速度 × 2 × 帧数；顺滑滑走 = 距离恒定，抖动量 ≈ 0。
 */

import { describe, it, expect } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { playerControlSystem } from '../systems/playerControl';
import { aiSystem } from '../systems/ai';
import { worldSystem } from '../systems/world';
import { MAP_CENTER } from '../systems/terrain';
import { CreatureType } from '../data/creatures';
import { GameStatus } from '../types';
import type { FrameContext, GameEvents, GameState, Obstacle } from '../types';

const makeCtx = (mouseX: number, mouseY: number): FrameContext => ({
  mouse: { x: mouseX, y: mouseY },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const rockAt = (x: number, y: number, radius: number): Obstacle => ({
  id: 'rk-slide', x, y, radius, type: 'ROCK',
});

/** 一圈的公共布场：清掉建筑 / 传送门 / 藏宝，只留一块岩石 */
const makeArena = (rockRadius: number): GameState => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  state.buildings = [];
  state.portals = [];
  state.treasures = [];
  state.entities = [];
  state.obstacles = [rockAt(MAP_CENTER.x, MAP_CENTER.y, rockRadius)];
  return state;
};

interface Trace {
  /** 绕岩石转过的总角度（rad） */
  swept: number;
  /** 与岩石中心距离的变化量之和（越小越顺） */
  drift: number;
  /** 贴到表面多少帧 */
  contactFrames: number;
}

const emptyTrace = (): Trace => ({ swept: 0, drift: 0, contactFrames: 0 });

describe('撞上障碍物不顿挫（沿表面滑走）', () => {
  it('玩家顶着岩石：会顺着边缘滑走，不是原地进退', () => {
    const ROCK_R = 200;
    const state = makeArena(ROCK_R);
    const p = state.player;
    p.x = MAP_CENTER.x - (ROCK_R + p.radius + 30);
    p.y = MAP_CENTER.y;
    p.angle = 0; // 正对岩石
    p.isGodMode = true;
    p.invulnerableTimer = 999999;

    // 鼠标一直摆在屏幕正右方 → 玩家持续朝右顶
    const ctx = makeCtx(640 + 300, 360);
    const trace = emptyTrace();
    let prevAngle = Math.atan2(p.y - MAP_CENTER.y, p.x - MAP_CENTER.x);
    let prevR = Math.hypot(p.x - MAP_CENTER.x, p.y - MAP_CENTER.y);

    for (let f = 0; f < 400; f += 1) {
      state.time += 1;
      playerControlSystem(state, ctx);
      worldSystem(state, ctx);
      state.status = GameStatus.PLAYING;

      const a = Math.atan2(p.y - MAP_CENTER.y, p.x - MAP_CENTER.x);
      let d = a - prevAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      trace.swept += Math.abs(d);
      prevAngle = a;

      const r = Math.hypot(p.x - MAP_CENTER.x, p.y - MAP_CENTER.y);
      const surface = ROCK_R + p.radius;
      if (r <= surface + 2) {
        trace.contactFrames += 1;
        trace.drift += Math.abs(r - prevR);
      }
      prevR = r;
    }

    console.log(
      `[玩家顶岩石] 扫掠=${trace.swept.toFixed(2)}rad 贴面帧=${trace.contactFrames} 径向漂移=${trace.drift.toFixed(1)}px`
    );
    expect(trace.contactFrames).toBeGreaterThan(50); // 确实顶上了，否则断言是空过
    expect(trace.swept).toBeGreaterThan(1.0); // 顺着边缘滑走
    expect(trace.drift).toBeLessThan(40); // 距离基本恒定，没有每帧来回
  });

  it('AI 鱼顶着岩石追玩家：同样沿着边缘绕过去', () => {
    const ROCK_R = 100;
    const state = makeArena(ROCK_R);
    const p = state.player;
    p.x = MAP_CENTER.x + 320;
    p.y = MAP_CENTER.y;
    p.speed = 0; // 钉住玩家当靶子
    p.isGodMode = true;
    p.invulnerableTimer = 999999;

    // 双髻鲨 AGGRESSIVE：会主动追比自己小的玩家。心境钉 CALM，
    // 否则抽到「好奇/瞌睡」就不按种族行为走了
    const fish = createEntity(CreatureType.HAMMERHEAD, MAP_CENTER.x - 320, MAP_CENTER.y, {
      moodId: 'CALM',
    });
    fish.angle = 0; // 正对岩石（玩家在岩石另一侧）
    state.entities = [fish];

    const ctx = makeCtx(640, 360);
    const trace = emptyTrace();
    let prevAngle = Math.atan2(fish.y - MAP_CENTER.y, fish.x - MAP_CENTER.x);
    let prevR = Math.hypot(fish.x - MAP_CENTER.x, fish.y - MAP_CENTER.y);

    for (let f = 0; f < 900; f += 1) {
      state.time += 1;
      aiSystem(state, ctx);
      worldSystem(state, ctx);
      state.status = GameStatus.PLAYING;

      const a = Math.atan2(fish.y - MAP_CENTER.y, fish.x - MAP_CENTER.x);
      let d = a - prevAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      trace.swept += Math.abs(d);
      prevAngle = a;

      const r = Math.hypot(fish.x - MAP_CENTER.x, fish.y - MAP_CENTER.y);
      const surface = ROCK_R + fish.radius;
      if (r <= surface + 2) {
        trace.contactFrames += 1;
        trace.drift += Math.abs(r - prevR);
      }
      prevR = r;
    }

    console.log(
      `[鱼顶岩石] 扫掠=${trace.swept.toFixed(2)}rad 贴面帧=${trace.contactFrames} 径向漂移=${trace.drift.toFixed(1)}px`
    );
    expect(trace.contactFrames).toBeGreaterThan(50);
    expect(trace.swept).toBeGreaterThan(0.5);
    expect(trace.drift).toBeLessThan(40);
  });

  it('不动不变向：趴着不动的鱼被推挤时保持原朝向（不能因为被推一下就扭头）', () => {
    const state = makeArena(200);
    const fish = createEntity(CreatureType.HAMMERHEAD, MAP_CENTER.x + 100, MAP_CENTER.y, {
      moodId: 'CALM',
    });
    // 伏击姿态：速度归零，朝向固定朝右
    fish.vx = 0;
    fish.vy = 0;
    fish.angle = 0;
    state.entities = [fish];

    worldSystem(state, makeCtx(640, 360));

    // 位置该被推出去（岩石半径 200 + 鱼 50 = 250，原本只在 100 处）
    expect(Math.hypot(fish.x - MAP_CENTER.x, fish.y - MAP_CENTER.y)).toBeGreaterThan(240);
    // 但朝向不该被掰
    expect(fish.angle).toBe(0);
  });
});
