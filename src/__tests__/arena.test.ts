import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { updateGame } from '../gameEngine';
import { ARENA_RULES, getArenaCircle, getArenaStandings, getArenaFoodCap } from '../data/arena';
import { normalizeRunMode, sec } from '../data/runRules';
import { EventBus } from '../core/EventBus';
import { GameStatus, type FrameContext, type GameEvents } from '../types';
import { arenaAiSystem, arenaFinishSystem, maintainArenaFood } from '../systems/arena';
import { seedArenaFood } from '../factories/arena';
import { getArenaObjective } from '../systems/arenaObjective';
import { castSkill } from '../systems/skills';
import { combatSystem, dealDamage, processCollision, resolveDeath, checkVictory } from '../systems/combat';
import { createEntity } from '../systems/spawn';
import { queueSquadAction } from '../systems/squad';
import { clearLeaderboard, getLeaderboard, recordRun } from '../systems/leaderboard';
import { awardPlayerGrowth } from '../systems/playerGrowth';

const context = (): FrameContext => ({ mouse: { x: 801, y: 450 },
  screen: { width: 1600, height: 900 }, input: { space: false, q: false, rightMouseDown: false,
    mouseDown: false, interact: false }, events: new EventBus<GameEvents>(), dt: 1 });
const match = () => {
  const state = createInitialState({ mode: 'ARENA', skipWorldGen: true, pondSeed: 42 });
  state.status = GameStatus.PLAYING;
  return state;
};
beforeEach(() => { localStorage.clear(); clearLeaderboard(); });

describe('短局开局与规则隔离', () => {
  it('强制统一 T1、有限地图与技能等级，不继承高阶选择或跨局属性', () => {
    localStorage.setItem('skillLevel', '50');
    const s = createInitialState({ mode: 'ARENA', startType: 'KRAKEN', worldMode: 'ENDLESS', pondId: 'ABYSS' });
    expect(normalizeRunMode('arena')).toBe('ARENA');
    expect(s.player.type).toBe('CLOWN_FISH'); expect(s.worldMode).toBe('FINITE');
    expect(s.player.skillLevel).toBe(1); expect(s.player.level).toBe(2);
    expect(s.arena!.contestants).toHaveLength(6);
    expect(new Set(s.arena!.contestants.map(c => c.body.id)).size).toBe(6);
    for (const { body } of s.arena!.contestants) {
      expect(body.weight).toBe(s.player.weight); expect(body.radius).toBe(s.player.radius);
      expect(body.health).toBe(s.player.health); expect(body.speed).toBe(s.player.speed);
      expect(body.invulnerableTimer).toBe(ARENA_RULES.protection);
      expect(body.arenaStats).not.toBeUndefined();
    }
    expect(s.arena!.contestants[1].body.boost).not.toBe(s.player.boost);
    expect(s.quests).toBeUndefined(); expect(s.feedingEvent).toBeUndefined(); expect(s.rivalSquads).toBeUndefined();
    expect(s.portals).toHaveLength(0); expect(s.buildings).toHaveLength(0);
  });
  it('普通和争霸开局保持原有体系', () => {
    const legacy = createInitialState({ mode: 'LEGACY', skipWorldGen: true, startType: 'SWORD_FISH' });
    const rivals = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    expect(legacy.arena).toBeUndefined(); expect(legacy.run).toBeUndefined();
    expect(legacy.player.type).toBe('SWORD_FISH'); expect(legacy.quests).toBeDefined();
    expect(rivals.arena).toBeUndefined(); expect(rivals.feedingEvent).toBeDefined();
  });
  it('不会通过旧 BOSS 通关、收编、指令或冒险榜获得竞技外收益', () => {
    const s = match(); const ctx = context();
    const boss = createEntity('ORCA', 3000, 3000);
    checkVictory(s, s.player, boss); expect(s.status).toBe(GameStatus.PLAYING);
    resolveDeath(s, ctx, boss, s.player);
    expect(s.squad.pending).toHaveLength(0);
    queueSquadAction(s, { kind: 'POSSESS_NEXT' }); expect(s.squad.pendingActions).toHaveLength(0);
    recordRun(s); expect(getLeaderboard()).toHaveLength(0);
  });
});

describe('公平战斗与成长', () => {
  it('中立食物不会用零伤害攻击触发玩家恐惧或反击', () => {
    const s = match(); s.player.invulnerableTimer = 0;
    const food = createEntity('PLANKTON', s.player.x + 10, s.player.y);
    food.semiGhostTimer = 0; food.angle = Math.PI;
    processCollision(food, s.player, s, context());
    expect(s.player.health).toBe(s.player.maxHealth);
    expect(s.player.angerTimer).toBe(0); expect(s.player.counterWindup).toBeUndefined();
  });
  it('短局使用独立成长曲线、等级上限，旧玩法阈值不变', () => {
    const s = match(); const ctx = context();
    awardPlayerGrowth(s, ctx, 11); expect(s.player.level).toBe(2);
    awardPlayerGrowth(s, ctx, 1); expect(s.player.level).toBe(3);
    awardPlayerGrowth(s, ctx, 1000); expect(s.player.level).toBe(12);
    const legacy = createInitialState({ mode: 'LEGACY', skipWorldGen: true });
    awardPlayerGrowth(legacy, ctx, 5); expect(legacy.player.level).toBe(3);
  });
  it('同种敌对参赛者可咬，旧玩法仍不互咬', () => {
    for (const mode of ['ARENA', 'LEGACY'] as const) {
      const s = createInitialState({ mode, skipWorldGen: true }); const ctx = context();
      const attacker = s.player; const victim = mode === 'ARENA' ? s.arena!.contestants[1].body : createEntity('CLOWN_FISH', 0, 0);
      attacker.x = 3000; attacker.y = 3000; attacker.angle = 0;
      victim.x = 3020; victim.y = 3000; victim.angle = 0;
      victim.invulnerableTimer = 0; victim.semiGhostTimer = 0;
      const hp = victim.health; processCollision(attacker, victim, s, ctx);
      expect(victim.health < hp).toBe(mode === 'ARENA');
    }
  });
  it('有效伤害只记真实扣血，盾、无敌与重复死尸命中不虚增', () => {
    const s = match(); const bot = s.arena!.contestants[1].body;
    bot.invulnerableTimer = 0; bot.shieldTimer = 60;
    expect(dealDamage(bot, 10, s.player)).toBeCloseTo(3);
    expect(s.player.arenaStats!.damage).toBeCloseTo(3);
    bot.invulnerableTimer = 10; expect(dealDamage(bot, 100, s.player)).toBe(0);
    bot.invulnerableTimer = 0; bot.shieldTimer = 0; bot.health = 2;
    expect(dealDamage(bot, 100, s.player)).toBe(2);
    expect(s.player.arenaStats!.damage).toBeCloseTo(5);
    expect(dealDamage(bot, 100, s.player)).toBe(0);
  });
  it('AI 与玩家都从食物得到同等成长和分数，一次死亡只领奖一次', () => {
    const s = match(); const ctx = context(); const bot = s.arena!.contestants[1].body;
    for (const body of [s.player, bot]) {
      const food = createEntity('PLANKTON', body.x, body.y); const weight = body.weight;
      resolveDeath(s, ctx, food, body); resolveDeath(s, ctx, food, body);
      expect(body.weight).toBe(weight + 1); expect(body.arenaStats!.score).toBe(1);
    }
    const victim = s.arena!.contestants[2].body;
    resolveDeath(s, ctx, victim, bot); resolveDeath(s, ctx, victim, bot);
    expect(bot.arenaStats!.score).toBe(51); expect(bot.arenaStats!.kills).toBe(1);
    expect(s.squad.pending).toHaveLength(0);
  });
  it('已经死亡的凶手不会因同帧奖励回血复活', () => {
    const s = match(); const ctx = context(); const bot = s.arena!.contestants[1].body;
    s.player.health = 0;
    resolveDeath(s, ctx, bot, s.player);
    expect(s.player.health).toBe(0); expect(s.player.arenaStats!.score).toBe(0);
  });
  it('AI 技能能击中玩家并正确排除自身，与玩家同一技能规则', () => {
    const s = match(); const ctx = context(); const bot = s.arena!.contestants[1].body;
    s.entities = [bot]; s.player.x = 3000; s.player.y = 3000; bot.x = 3050; bot.y = 3000;
    s.player.invulnerableTimer = 0; bot.invulnerableTimer = 0;
    const hp = bot.health;
    castSkill(s, ctx, bot, 'SONIC', 1);
    expect(s.player.health).toBeLessThan(s.player.maxHealth); expect(bot.health).toBe(hp);
    expect(bot.arenaStats!.damage).toBeGreaterThan(0);
  });
  it('AI 状态、体力与两个技能冷却使用玩家控制器递减', () => {
    const s = match(); const ctx = context(); const bot = s.arena!.contestants[1].body;
    bot.shieldTimer = 100; bot.invulnerableTimer = 100; bot.vulnerableTimer = 100;
    bot.skillCooldown = 100; bot.schoolSkillCooldown = 100;
    arenaAiSystem(s, ctx);
    expect(bot.shieldTimer).toBe(99); expect(bot.invulnerableTimer).toBe(99);
    expect(bot.vulnerableTimer).toBe(99); expect(bot.skillCooldown).toBe(99); expect(bot.schoolSkillCooldown).toBe(99);
  });
  it('范围吸能也保留归属且按真实伤害治疗', () => {
    const s = match(); const ctx = context(); const bot = s.arena!.contestants[1].body;
    s.entities = [bot]; bot.x = s.player.x + 50; bot.y = s.player.y;
    bot.invulnerableTimer = 0; bot.health = 1; s.player.health = 10;
    castSkill(s, ctx, s.player, 'ENERGY_DRAIN', 100);
    expect(s.player.health).toBeCloseTo(10.8); expect(bot.lastHitById).toBe('player');
    combatSystem(s, ctx); expect(s.player.arenaStats!.kills).toBe(1);
  });
});

describe('画面密度与当前目标', () => {
  it('开局食物最多 36 份、互不挤叠，出生点附近仍有成长机会', () => {
    for (const seed of [1, 42, 777]) {
      const s = createInitialState({ mode: 'ARENA', pondSeed: seed });
      const foods = s.entities.filter(e => !e.arenaStats);
      expect(foods.length).toBeLessThanOrEqual(36);
      for (const { body } of s.arena!.contestants)
        expect(foods.filter(e => Math.hypot(e.x - body.x, e.y - body.y) < 300).length).toBeGreaterThanOrEqual(3);
      for (const food of foods) {
        for (const other of foods.filter(e => e !== food))
          expect(Math.hypot(food.x - other.x, food.y - other.y)).toBeGreaterThanOrEqual(90);
      }
    }
  });
  it('缩圈减少预算、清走圈外食物，密集补刷请求也不贴脸', () => {
    const s = match();
    for (const [seconds, budget] of [[55, 24], [130, 16], [190, 8]]) {
      s.run!.clock = sec(seconds);
      maintainArenaFood(s); seedArenaFood(s, 1000);
      const foods = s.entities.filter(e => !e.arenaStats);
      expect(getArenaFoodCap(s)).toBe(budget); expect(foods.length).toBeLessThanOrEqual(budget);
      for (const food of foods) {
        expect(Math.hypot(food.x - 3000, food.y - 3000)).toBeLessThan(getArenaCircle(s).radius - 19);
        for (const other of foods.filter(e => e !== food))
          expect(Math.hypot(food.x - other.x, food.y - other.y)).toBeGreaterThanOrEqual(90);
      }
      expect(s.arena!.contestants).toHaveLength(6);
      expect(s.player.arenaStats!.score).toBe(0);
    }
  });
  it('从技能解锁到争分、决赛只显示一个目标，圈外逃生优先', () => {
    const s = match();
    expect(getArenaObjective(s)).toMatchObject({ stage: 0, progress: 0, title: '吃磷虾，解锁技能' });
    awardPlayerGrowth(s, context(), 12);
    expect(getArenaObjective(s).stage).toBe(1);
    s.run!.clock = sec(190); s.player.x = 3000; s.player.y = 3000;
    expect(getArenaObjective(s)).toMatchObject({ stage: 2, title: '守住第一名' });
    s.arena!.contestants[1].body.arenaStats!.score = 50;
    expect(getArenaObjective(s).title).toBe('决赛：争取第一名');
    s.player.x = 3800;
    expect(getArenaObjective(s)).toMatchObject({ title: '先回安全区', target: s.arena!.center });
  });
  it('没有食物或食物藏在掩体后时不制造虚假目标', () => {
    const s = match(); s.entities = s.entities.filter(e => !!e.arenaStats);
    expect(getArenaObjective(s).target).toBeUndefined();
    const food = createEntity('PLANKTON', s.player.x + 140, s.player.y);
    s.entities.push(food); food.inCover = true;
    expect(getArenaObjective(s).target).toBeUndefined();
    food.inCover = false;
    s.obstacles = [{ id: 'wall', type: 'ROCK', x: s.player.x + 70, y: s.player.y, radius: 30 }];
    expect(getArenaObjective(s).target).toBeUndefined();
    s.obstacles = [];
    expect(getArenaObjective(s).target).toBe(food);
  });
});

describe('缩圈、结束条件与计时', () => {
  it('十秒预告、十秒线性收缩，提示与伤害共用安全区半径', () => {
    const s = match();
    s.run!.clock = sec(35); expect(getArenaCircle(s).warning).toBe(true);
    expect(getArenaCircle(s).radius).toBe(900); expect(getArenaCircle(s).targetRadius).toBe(675);
    s.run!.clock = sec(50); expect(getArenaCircle(s).radius).toBe(787.5);
    expect(getArenaCircle(s).targetRadius).toBe(675);
    s.run!.clock = sec(55); expect(getArenaCircle(s).radius).toBe(675);
    s.run!.clock = sec(190); expect(getArenaCircle(s).radius).toBe(225);
  });
  it('圈外玩家与 AI 相同百分比伤害，保护同样有效', () => {
    const s = match(); const ctx = context(); const bot = s.arena!.contestants[1].body;
    s.run!.clock = sec(190);
    for (const body of [s.player, bot]) {
      body.x = 3800; body.y = 3000; body.invulnerableTimer = 0;
    }
    arenaFinishSystem(s, ctx); expect(s.player.health).toBeCloseTo(bot.health);
    expect(s.player.health).toBeLessThan(s.player.maxHealth);
  });
  it('暂停与结算不推进有效时钟', () => {
    const s = match(); s.status = GameStatus.EVOLVING;
    updateGame(s, { x: 0, y: 0 }, false, false, false, 1600, 900);
    expect(s.run!.clock).toBe(0); expect(s.time).toBe(0);
    s.status = GameStatus.PLAYING;
    updateGame(s, { x: 801, y: 450 }, false, false, false, 1600, 900);
    expect(s.run!.clock).toBe(1);
  });
  it('提前淘汰直接结算且不会进入附身／复活路径', () => {
    const s = match(); s.player.health = 0;
    arenaFinishSystem(s, context());
    expect(s.status).toBe(GameStatus.GAME_OVER); expect(s.arena!.result).toEqual({ reason: 'ELIMINATED', rank: 6 });
    expect(s.player.reviveCount).toBe(0);
  });
  it('最后存活立即获胜，即使开启挂机也不无限继续', () => {
    const s = match(); s.autopilotEnabled = true;
    for (const c of s.arena!.contestants.slice(1)) c.body.health = 0;
    arenaFinishSystem(s, context());
    expect(s.status).toBe(GameStatus.VICTORY); expect(s.arena!.result!.reason).toBe('LAST_SURVIVOR');
  });
  it('到时优先存活，再按竞技分与真实伤害；完全相同并列', () => {
    const s = match(); s.run!.clock = ARENA_RULES.duration;
    for (const c of s.arena!.contestants) { c.body.x = 3000; c.body.y = 3000; }
    s.player.arenaStats!.score = 10; s.player.arenaStats!.damage = 20;
    const bot = s.arena!.contestants[1].body; bot.arenaStats!.score = 10; bot.arenaStats!.damage = 20;
    arenaFinishSystem(s, context());
    expect(s.arena!.result).toEqual({ reason: 'TIME_LIMIT', rank: 1 });
    expect(getArenaStandings(s).filter(c => c.rank === 1)).toHaveLength(2);
    const clock = s.run!.clock;
    updateGame(s, { x: 0, y: 0 }, false, false, false, 1600, 900);
    expect(s.run!.clock).toBe(clock);
  });
  it('同帧全灭按同一时点并列，遍历顺序不产生获胜者', () => {
    const s = match(); s.run!.clock = 500;
    for (const c of s.arena!.contestants) c.body.health = 0;
    arenaFinishSystem(s, context());
    expect(s.status).toBe(GameStatus.GAME_OVER);
    expect(getArenaStandings(s).every(c => c.rank === 1)).toBe(true);
    expect(s.arena!.contestants.every(c => c.eliminatedAt === 500)).toBe(true);
  });
  it('走完整逻辑保持资源预算，没有冒险事件或额外参赛者', () => {
    const s = match();
    for (let i = 0; i < 600 && s.status === GameStatus.PLAYING; i++) {
      updateGame(s, { x: 1100, y: 450 }, false, false, false, 1600, 900);
    }
    expect(s.arena!.contestants).toHaveLength(6); expect(s.run!.clock).toBe(600);
    expect(s.entities.filter(e => !e.arenaStats).length).toBeLessThanOrEqual(ARENA_RULES.foodCap);
    expect(s.treasures).toHaveLength(0); expect(s.powerUps).toHaveLength(0);
    expect(s.squad.pending).toHaveLength(0); expect(s.status).toBe(GameStatus.PLAYING);
    expect(s.arena!.contestants.every(c => Number.isFinite(c.body.x) && Number.isFinite(c.body.health))).toBe(true);
  });
  it('三个种子自然推进到结束，无无敌、强制淘汰或跳时钟', () => {
    for (const seed of [1, 42, 777]) {
      const s = createInitialState({ mode: 'ARENA', pondSeed: seed }); s.status = GameStatus.PLAYING;
      let frames = 0;
      while (s.status === GameStatus.PLAYING && frames <= ARENA_RULES.duration) {
        const p = s.player; const circle = getArenaCircle(s);
        const center = s.arena!.center;
        const food = s.entities.filter(e => !e.arenaStats && Math.hypot(e.x - center.x, e.y - center.y) < circle.radius - 25)
          .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        const target = Math.hypot(p.x - center.x, p.y - center.y) > circle.radius - 40 ? center : food ?? center;
        const angle = Math.atan2(target.y - p.y, target.x - p.x);
        updateGame(s, { x: 800 + Math.cos(angle) * 200, y: 450 + Math.sin(angle) * 200 },
          false, false, true, 1600, 900, true);
        frames++;
        expect(s.entities.length).toBeLessThanOrEqual(ARENA_RULES.foodCap + 5);
        expect(s.particles.length).toBeLessThanOrEqual(240);
      }
      expect(s.arena!.result).toBeDefined(); expect(s.status).not.toBe(GameStatus.PLAYING);
      expect(s.run!.clock).toBeLessThanOrEqual(ARENA_RULES.duration);
      expect(s.run!.practice).toBe(false);
      expect(s.arena!.contestants.every(c => Number.isFinite(c.body.health))).toBe(true);
      console.info('Arena natural run', { seed, frames, result: s.arena!.result, level: s.player.level });
    }
  }, 20_000);
});
