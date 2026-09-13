/**
 * 灯笼鱼「大肉块」行为闭环的回归防护（2026-09-13 需求补全）。
 *
 * 用户规则：「灯笼鱼有诱惑技能，变成一个大肉块，吸引小鱼来吃；
 *          如果来的鱼比自己小，可以直接吃；如果来的鱼比自己大，则逃跑。」
 *
 * 补全前的缺口：埋伏 AI 只会追猎物 / 原地亮诱饵，**体型更大的鱼凑上来照样傻站着**，
 * 技能描述里写的「遇到大鱼自动逃跑」没有实现；「大肉块」视觉也只给了玩家
 * （AI 灯笼鱼只是一条发着灯的鮟鱇，伪装不成立）。
 *
 * 本文件钉三件事：
 *   ① 没威胁 → 点亮诱饵待机（lureActive = true，渲染层按它画成肉块）
 *   ② 大鱼靠近 → 收起诱饵、掉头拉开距离（威胁优先级高于猎物）
 *   ③ 威胁离开 → 重新点亮诱饵（回到肉块形态继续钓鱼）
 *
 * ⚠️ 威胁判据用**半径**（和 LURE 吸引同一把尺子），不是等级 ——
 *    同级大鱼靠「同级大吃小」也咬得死我。
 * ⚠️ 逃跑对战的对照物（虎鲸）钉了 speedBoostTimer 负值减速，
 *    否则 BOSS 也追着跑、距离变化不可断言。
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { aiSystem } from '../systems/ai';
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

const makeScene = (threatNearby: boolean) => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;

  // 灯笼鱼：tier3 → Lv4，radius 45。钉 CALM 心境防随机 flake（MoodHandler 会改行为倍率）
  const angler = createEntity(CreatureType.ANGLER_FISH, 3000, 3000, { moodId: 'CALM' });
  angler.semiGhostTimer = 0;
  state.entities.push(angler);

  if (threatNearby) {
    // 威胁：虎鲸 radius 100 > 45，摆在 300px（< AMBUSH_DISTANCE 400 感知范围内）
    const boss = createEntity(CreatureType.ORCA, 3300, 3000, { moodId: 'CALM' });
    boss.semiGhostTimer = 0;
    boss.speedBoostTimer = -6000; // 减速钉死：它追不上逃跑的灯笼鱼，距离差才可断言
    state.entities.push(boss);
  }

  // 玩家摆在 2100px 处 —— 必须 < AI_ACTIVE_RANGE(2600) 鱼才会被 AI 模拟（LOD 门闸，
  // 太远直接 continue），又必须 > AMBUSH_DISTANCE(400) 不被当成猎物/威胁感知到。
  // 玩家半径 15 < 45 本来就不是威胁，放在身边反而会变成「猎物」污染待机判定。
  state.player.x = 900;
  state.player.y = 3000;

  return { state, angler };
};

describe('灯笼鱼「大肉块」行为闭环', () => {
  it('周围没有大鱼：点亮诱饵待机（肉块形态）', () => {
    const { state, angler } = makeScene(false);
    for (let i = 0; i < 30; i += 1) aiSystem(state, makeCtx());
    expect(angler.lureActive).toBe(true);
    expect(angler.isIdle).toBe(true);
  });

  it('体型更大的鱼靠近：收起诱饵掉头逃跑，距离越拉越远', () => {
    const { state, angler } = makeScene(true);
    const boss = state.entities.find((e) => e.type === CreatureType.ORCA)!;
    const dist0 = Math.hypot(angler.x - boss.x, angler.y - boss.y);

    for (let i = 0; i < 120; i += 1) aiSystem(state, makeCtx());

    expect(angler.lureActive).toBe(false); // 逃跑时不再是肉块，别举着香味骗人
    expect(angler.isIdle).toBe(false);
    const dist = Math.hypot(angler.x - boss.x, angler.y - boss.y);
    expect(dist).toBeGreaterThan(dist0); // 净效果：在拉开距离，不是傻站着
  });

  it('威胁离开后重新点亮诱饵（回到肉块形态继续钓鱼）', () => {
    const { state, angler } = makeScene(true);
    const boss = state.entities.find((e) => e.type === CreatureType.ORCA)!;
    for (let i = 0; i < 60; i += 1) aiSystem(state, makeCtx());
    expect(angler.lureActive).toBe(false);

    boss.x = 5500; // 挪出感知范围（> 400px），但没有走出世界
    boss.y = 5500;
    for (let i = 0; i < 30; i += 1) aiSystem(state, makeCtx());
    expect(angler.lureActive).toBe(true);
  });
});
