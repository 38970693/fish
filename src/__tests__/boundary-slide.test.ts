/**
 * 「碰到边缘会反弹」回归测试。
 *
 * 病根在 `clampToMap` 的硬分支（`currentDist > limit`），它做了两件都过头的事：
 *   ① 把实体往内拉到 `limit * 0.95` —— 约为边界半径的 5%，实测 **159px**，
 *      一次「倒飞」出去，这就是肉眼看得到的反弹；
 *   ② 朝向向心压缩 40%，而且**不限速** —— 一帧最多扭 **1.257rad（72°）**，
 *      连速度归零的伏击鱼贴到边界都会被甩头。
 * 两者叠加，「顶着边界往外按」就变成：弹回 → 再游出去 → 再弹回，
 * 周期约 1/3 秒的顿挫式反弹。
 *
 * 治法与 `resolveObstacles` 同款（两条约束通路共用 `alignToSurface`）：
 * 推回**表面**就好（不再往里多拉），朝向**限速**掰向切向 → 沿边滑走。
 *
 * ⚠️ 场景选取很讲究：花瓣形边界的「花瓣尖」（45°）是径向极值，在那里**正对着**
 *    边界推 = 输入与切向垂直 = 切向分量为零，玩家本来就该停住（不该滑、更不该弹）。
 *    所以「正推不反弹」和「斜推要沿边滑走」是两个场景，分开测。
 */

import { describe, it, expect } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createInitialState } from '../factories/initialState';
import { playerControlSystem } from '../systems/playerControl';
import { worldSystem } from '../systems/world';
import { clampToMap, getMapBoundaryRadius, MAP_CENTER } from '../systems/terrain';
import { GameStatus } from '../types';
import type { FrameContext, GameEvents, GameState } from '../types';

/** 贴约束面时每帧允许的最大转向（与 terrain.ts 的 SLIDE_TURN_PER_FRAME 一致） */
const MAX_TURN_PER_FRAME = 0.35;

/** 花瓣尖（45°）—— 边界在那里是局部极值，近似一段圆弧 */
const TIP_ANGLE = Math.PI / 4;

const makeCtx = (mouseX: number, mouseY: number): FrameContext => ({
  mouse: { x: mouseX, y: mouseY },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

/** 鼠标摆到屏幕中心往外 `angle` 方向 → 玩家的 targetAngle 就是 `angle`（屏幕系＝世界系方向） */
const ctxPressing = (angle: number, reach = 300): FrameContext =>
  makeCtx(1280 / 2 + Math.cos(angle) * reach, 720 / 2 + Math.sin(angle) * reach);

/** 造一个「刚好越过边界 overshoot 像素、正朝外」的实体 */
const makeOverrun = (radius: number, overshoot: number, speed = 5) => {
  const limit = getMapBoundaryRadius(TIP_ANGLE) - radius;
  return {
    limit,
    entity: {
      x: MAP_CENTER.x + Math.cos(TIP_ANGLE) * (limit + overshoot),
      y: MAP_CENTER.y + Math.sin(TIP_ANGLE) * (limit + overshoot),
      radius,
      angle: TIP_ANGLE,
      vx: Math.cos(TIP_ANGLE) * speed,
      vy: Math.sin(TIP_ANGLE) * speed,
    },
  };
};

const distFromCenter = (e: { x: number; y: number }): number =>
  Math.hypot(e.x - MAP_CENTER.x, e.y - MAP_CENTER.y);

interface Trace {
  /** 绕地图中心转过的总角度（rad） */
  swept: number;
  /** 单帧被往内推的最大位移（「倒飞」的直接量化） */
  maxRecoil: number;
  /** 顶在边界上的帧数（r 落在 limit 附近） */
  contactFrames: number;
}

const emptyTrace = (): Trace => ({ swept: 0, maxRecoil: 0, contactFrames: 0 });

/** 把玩家放到花瓣尖附近，朝 `pressAngle` 一直顶，跑 400 帧 */
const pressBoundary = (pressAngle: number): Trace => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  state.buildings = [];
  state.portals = [];
  state.treasures = [];
  state.entities = [];
  state.obstacles = [];

  const p = state.player;
  const limit = getMapBoundaryRadius(TIP_ANGLE) - p.radius;
  p.x = MAP_CENTER.x + Math.cos(TIP_ANGLE) * (limit - 40);
  p.y = MAP_CENTER.y + Math.sin(TIP_ANGLE) * (limit - 40);
  p.angle = TIP_ANGLE;
  p.isGodMode = true;
  p.invulnerableTimer = 999999;

  const ctx = ctxPressing(pressAngle);
  const trace = emptyTrace();
  let prevA = Math.atan2(p.y - MAP_CENTER.y, p.x - MAP_CENTER.x);
  let prevR = distFromCenter(p);

  for (let f = 0; f < 400; f += 1) {
    state.time += 1;
    playerControlSystem(state, ctx);
    worldSystem(state, ctx);
    state.status = GameStatus.PLAYING;

    const a = Math.atan2(p.y - MAP_CENTER.y, p.x - MAP_CENTER.x);
    let d = a - prevA;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    trace.swept += Math.abs(d);
    prevA = a;

    const r = distFromCenter(p);
    trace.maxRecoil = Math.max(trace.maxRecoil, prevR - r); // 单帧往内位移
    // ⚠️ 贴边要用**当帧角度**的局部 limit：花瓣形边界滑动时局部半径一直在变，
    //    拿起点那个 limit 去比会把贴边帧数严重低估
    const localLimit = getMapBoundaryRadius(a) - p.radius;
    if (r >= localLimit - 1) trace.contactFrames += 1;
    prevR = r;
  }
  return trace;
};

describe('碰到地图边缘不反弹（推回表面 + 沿边滑走）', () => {
  it('刚越界 2px：只推回表面，不往内倒飞一大截', () => {
    const { limit, entity } = makeOverrun(56, 2);
    const before = distFromCenter(entity);

    clampToMap(entity);

    const recoil = before - distFromCenter(entity);
    console.log(`[越界 2px] 往内回拉=${recoil.toFixed(1)}px（limit=${limit.toFixed(0)}）`);
    // 坏行为：回拉到 limit*0.95 ≈ 159px；修好后应当只是「推回表面」的 2px
    expect(recoil).toBeGreaterThan(0); // 确实被推回来了
    expect(recoil).toBeLessThan(10); // 但不该倒飞
  });

  it('刚越界 2px：朝向限速掰向切向，不能一帧甩过去', () => {
    const { entity } = makeOverrun(56, 2);
    const before = entity.angle;

    clampToMap(entity);

    const turned = Math.abs(entity.angle - before);
    console.log(`[越界 2px] 单帧转角=${turned.toFixed(3)}rad`);
    // 坏行为：一帧扭 1.257rad（72°）
    expect(turned).toBeLessThanOrEqual(MAX_TURN_PER_FRAME + 1e-9);
    expect(turned).toBeGreaterThan(0); // 但确实在往切向掰
  });

  it('趴着不动的实体被拉回边界时，朝向不变', () => {
    const { limit, entity } = makeOverrun(56, 5, 0);
    const before = entity.angle;

    clampToMap(entity);

    expect(entity.angle).toBe(before);
    expect(distFromCenter(entity)).toBeLessThanOrEqual(limit + 1e-6);
  });

  it('正对着边界推：停在边界上，不往内倒飞', () => {
    const trace = pressBoundary(TIP_ANGLE);
    console.log(
      `[正推] 贴边帧=${trace.contactFrames} 单帧最大回拉=${trace.maxRecoil.toFixed(1)}px ` +
        `绕心扫掠=${trace.swept.toFixed(2)}rad`
    );
    // 场景有效性：确实一直顶在边界上（否则下面的断言是空过）
    expect(trace.contactFrames).toBeGreaterThan(200);
    // 坏行为：一次倒飞 149.8px
    expect(trace.maxRecoil).toBeLessThan(20);
  });

  it('斜着往边界推：沿着边缘滑走（这才是「贴边」，不是原地弹）', () => {
    // 花瓣尖的法线是 45°、切向是 135°；按 120° 推 = 大部分切向 + 一点朝外
    const trace = pressBoundary((120 * Math.PI) / 180);
    console.log(
      `[斜推] 贴边帧=${trace.contactFrames} 单帧最大回拉=${trace.maxRecoil.toFixed(1)}px ` +
        `绕心扫掠=${trace.swept.toFixed(2)}rad`
    );
    expect(trace.contactFrames).toBeGreaterThan(100);
    expect(trace.maxRecoil).toBeLessThan(20);
    expect(trace.swept).toBeGreaterThan(0.15); // 真的沿着边缘走了一段（不是原地弹）
  });
});
