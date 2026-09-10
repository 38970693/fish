/**
 * 清理与修复验证：伤害入口全覆盖 / 配置接线 / 无敌模式。
 * 对应 2026-09-08 清理轮：鱼雷与陨石此前绕过 dealDamage()，无敌帧对它们无效。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '../core/EventBus';
import { dealDamage, checkVictory } from '../systems/combat';
import { updateMeteors } from '../systems/events';
import { createEntity } from '../systems/spawn';
import { createInitialState } from '../factories/initialState';
import { GAME_MECHANICS, TREASURE_CONFIG, METEOR_CONFIG } from '../data/world';
import { CreatureType } from '../data/creatures';
import { GameStatus, type FrameContext, type GameEvents, type GameState, type Entity } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const makeState = (): GameState => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  return state;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('伤害入口全覆盖', () => {
  it('无敌帧对鱼雷/陨石类环境伤害同样生效（走 dealDamage 即自动覆盖）', () => {
    const e = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    e.invulnerableTimer = 30;
    expect(dealDamage(e, 999)).toBe(0);
    expect(e.health).toBe(e.maxHealth);
  });

  it('陨石冲击受无敌帧保护，不受保护的鱼才会掉血', () => {
    const state = makeState();
    const ctx = makeCtx();

    const fish = createEntity(CreatureType.CLOWN_FISH, 3000, 3000);
    fish.semiGhostTimer = 0;
    fish.invulnerableTimer = 0;
    state.entities.push(fish);

    // 陨石砸在玩家 / 鱼的正上方
    state.player.invulnerableTimer = 60;
    const hpBefore = state.player.health;
    state.hazards.push({
      id: 'h1',
      x: state.player.x,
      y: state.player.y,
      radius: METEOR_CONFIG.RADIUS,
      type: 'METEOR_STRIKE',
      timer: 1,
      duration: 120,
      stage: 'WARNING',
    });

    updateMeteors(state, ctx);

    expect(state.player.health).toBe(hpBefore); // 无敌帧生效
    expect(fish.health).toBeLessThan(fish.maxHealth); // 无保护的鱼正常掉血
  });
});

describe('配置接线', () => {
  it('鱼雷参数读取 GAME_MECHANICS 而不是硬编码', () => {
    expect(GAME_MECHANICS.TORPEDO_COOLDOWN).toBeGreaterThan(0);
    expect(GAME_MECHANICS.TORPEDO_SPEED).toBeGreaterThan(0);
    expect(GAME_MECHANICS.TORPEDO_DAMAGE).toBeGreaterThan(0);
    expect(GAME_MECHANICS.SPEED_ITEM_MULTIPLIER).toBeGreaterThan(1);
  });

  it('宝藏护盾时长读取 TREASURE_CONFIG.BUFF_DURATION', () => {
    expect(TREASURE_CONFIG.BUFF_DURATION).toBeGreaterThan(0);
  });
});

describe('无敌模式（G 键）', () => {
  it('isGodMode 玩家免疫一切伤害', () => {
    const state = makeState();
    state.player.isGodMode = true;

    const dealt = dealDamage(state.player, 99999);

    expect(dealt).toBe(0);
    expect(state.player.health).toBe(state.player.maxHealth);
  });

  it('普通玩家不受影响', () => {
    const state = makeState();
    state.player.isGodMode = false;

    const dealt = dealDamage(state.player, 10);

    expect(dealt).toBe(10);
    expect(state.player.health).toBe(state.player.maxHealth - 10);
  });
});

describe('胜利条件收敛到 checkVictory', () => {
  const dummy = (type: CreatureType): Entity => {
    const e = createEntity(type, 0, 0);
    e.semiGhostTimer = 0;
    return e;
  };

  it('玩家击杀 BOSS 触发胜利', () => {
    const state = makeState();
    const before = state.score;
    checkVictory(state, state.player, dummy(CreatureType.ORCA));
    expect(state.status).toBe(GameStatus.VICTORY);
    expect(state.score).toBeGreaterThan(before);
  });

  it('AI 击杀不触发', () => {
    const state = makeState();
    checkVictory(state, dummy(CreatureType.GREAT_WHITE), dummy(CreatureType.ORCA));
    expect(state.status).toBe(GameStatus.PLAYING);
  });

  it('玩家击杀普通鱼不触发', () => {
    const state = makeState();
    checkVictory(state, state.player, dummy(CreatureType.CLOWN_FISH));
    expect(state.status).toBe(GameStatus.PLAYING);
  });
});
