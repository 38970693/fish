/**
 * 无敌模式「绝对承诺」的回归防护（2026-09-13 用户报障：无敌还会失败）。
 *
 * 报障现象：按 G 开了无敌，血量照样掉，约 20 秒后弹出「战斗失败」。
 *
 * 根因（源码级）：
 *   1. `world.ts` 沼泽腐蚀原来是 `player.health -= player.maxHealth * 0.0008`
 *      —— 直接对血量做减法，**绕过了唯一伤害入口 `dealDamage`**，
 *         于是无敌模式 / 无敌帧 / 护盾 / 易伤四个状态字段全部失效。
 *         腐蚀 0.0008/帧 × 60 帧 = 4.8%/秒 → 满血约 20.8 秒归零，与现象完全吻合。
 *   2. `skills.ts` 里 14 处技能伤害同样是直接减法，同类隐患（AI 的闪避 / 缩壳对技能无效）。
 *
 * 修法：
 *   - 所有伤害路径收口到 `dealDamage`（`hitTarget` 是 skills 侧的薄包装）；
 *   - `progressionSystem` 死亡判定前加兜底闸：`isGodMode && health <= 0` → 血量保底 1。
 *
 * 本文件钉四件事：
 *   ① 沼泽腐蚀对无敌玩家完全无效（阴性对照：普通玩家照掉血，证明环境真的触发了腐蚀）
 *   ② 真·帧循环 60 秒（3600 帧）跑满，无敌玩家满血且仍是 PLAYING
 *   ③ 兜底闸：即便有未知路径把血扣成负数，也不会判死
 *   ④ 技能伤害同样走统一入口（无敌帧目标吃技能不掉血 + 阳性对照）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { worldSystem, __resetObstacleIndex, __resetTeleportLock } from '../systems/world';
import { progressionSystem } from '../systems/progression';
import { SKILL_HANDLERS } from '../systems/skills';
import { CreatureType } from '../data/creatures';
import { BIOME_EFFECTS, BiomeType } from '../data/biomes';
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

/** 沼泽在左下象限（x < WORLD_SIZE/2 && y >= WORLD_SIZE/2），起点挪到 (1000, 4000) */
const SWAMP_X = 1000;
const SWAMP_Y = 4000;

const makeState = () => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  state.player.x = SWAMP_X;
  state.player.y = SWAMP_Y;
  state.player.health = state.player.maxHealth;
  return state;
};

/** worldSystem 内部有模块级缓存的传送锁 / 障碍索引，单测必须逐例重置 */
beforeEach(() => {
  __resetObstacleIndex();
  __resetTeleportLock();
});

describe('无敌模式：沼泽腐蚀不再绕过统一伤害入口', () => {
  it('无敌玩家在沼泽里 60 秒满血不死', () => {
    const state = makeState();
    state.player.isGodMode = true;
    const maxHealth = state.player.maxHealth;
    const ctx = makeCtx();

    // 60 秒 × 60 帧 = 3600 帧；纯腐蚀在修复前会扣掉 288% 最大生命
    for (let i = 0; i < 3600; i += 1) {
      worldSystem(state, ctx);
      progressionSystem(state, ctx);
    }

    expect(state.player.health).toBe(maxHealth);
    expect(state.status).toBe(GameStatus.PLAYING);
  });

  it('阴性对照：普通玩家在沼泽照样被腐蚀掉血（证明环境真的触发了腐蚀）', () => {
    const state = makeState();
    const maxHealth = state.player.maxHealth;
    const ctx = makeCtx();

    // 10 秒 → 期望扣 600 帧 × 0.0008 = 48%
    for (let i = 0; i < 600; i += 1) worldSystem(state, ctx);

    expect(state.player.health).toBeLessThan(maxHealth * 0.6);
    expect(state.player.health).toBeGreaterThan(0);
    // 沼泽确实是腐蚀源，配置没被误改
    expect(BIOME_EFFECTS[BiomeType.SWAMP].corrosionPerFrame).toBeGreaterThan(0);
  });

  it('兜底闸：血被扣成负数也不判死（防将来又出现绕过路径）', () => {
    const state = makeState();
    state.player.isGodMode = true;
    state.player.health = -50;
    const ctx = makeCtx();

    progressionSystem(state, ctx);

    expect(state.player.health).toBe(1);
    expect(state.status).toBe(GameStatus.PLAYING);
  });

  it('关掉无敌后死亡判定恢复正常（兜底闸不会误伤普通死亡）', () => {
    const state = makeState();
    state.player.isGodMode = false;
    state.player.health = 0;
    const ctx = makeCtx();

    progressionSystem(state, ctx);

    expect(state.status).toBe(GameStatus.GAME_OVER);
  });
});

describe('技能伤害同样走统一伤害入口', () => {
  /** 造一对 200px 内的施法者 / 受击者（SONIC 范围 500，够得着） */
  const makePair = () => {
    const state = createInitialState({ skipWorldGen: true });
    state.status = GameStatus.PLAYING;
    const caster = createEntity(CreatureType.ORCA, 3000, 3000, { moodId: 'CALM' });
    caster.semiGhostTimer = 0;
    const victim = createEntity(CreatureType.ANGLER_FISH, 3200, 3000, { moodId: 'CALM' });
    victim.semiGhostTimer = 0;
    victim.invulnerableTimer = 0;
    victim.health = victim.maxHealth;
    state.entities.push(caster, victim);
    return { state, caster, victim };
  };

  it('阳性对照：普通目标吃技能会掉血', () => {
    const { state, caster, victim } = makePair();
    const before = victim.health;

    SKILL_HANDLERS.SONIC(caster, state, 1);

    expect(victim.health).toBeLessThan(before);
  });

  it('无敌帧（闪避 / 翻滚）目标吃技能不掉血', () => {
    const { state, caster, victim } = makePair();
    victim.invulnerableTimer = 30; // ROLL 技能给的正是这个字段
    const before = victim.health;

    SKILL_HANDLERS.SONIC(caster, state, 1);

    expect(victim.health).toBe(before);
  });

  it('护盾目标只吃 1 - SHIELD_ABSORB_RATIO 的伤害', () => {
    const { state, caster, victim } = makePair();
    const before = victim.health;
    victim.shieldTimer = 30;

    SKILL_HANDLERS.SONIC(caster, state, 1);

    const taken = before - victim.health;
    const raw = caster.config.damage * 2; // SONIC 是 2 倍伤害 × power 1
    expect(taken).toBeGreaterThan(0);
    expect(taken).toBeLessThan(raw);
  });
});
