import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { QUEST_CHAPTERS, createVoyageQuests, questProgress, questValue } from '../data/quests';
import { createInitialState } from '../factories/initialState';
import { beginQuestFrame, endQuestFrame, questsSystem } from '../systems/quests';
import { GameStatus, type FrameContext, type GameEvents, type GameState, type Entity } from '../types';
import { updateGame } from '../gameEngine';
import { CreatureType } from '../data/creatures';

const context = (): FrameContext => ({ mouse: { x: 840, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 }, events: new EventBus<GameEvents>(), dt: 1 });
const playing = (worldMode: 'FINITE' | 'ENDLESS' = 'FINITE') => {
  const state = createInitialState({ skipWorldGen: true, mode: 'LEGACY', worldMode, worldSeed: 42 });
  state.status = GameStatus.PLAYING; return state;
};
const frame = (state: GameState, ctx: FrameContext, action: () => void = () => {}) => {
  beginQuestFrame(state, ctx);
  try { action(); questsSystem(state, ctx); } finally { endQuestFrame(ctx); }
};
const readyChapter = (state: GameState) => {
  const run = state.quests!;
  for (const quest of run.quests) {
    const value = quest.baseline + quest.definition.goal;
    if (quest.definition.metric === 'biomes') run.stats.biomes = ['SHALLOWS', 'REEF'];
    else if (quest.definition.metric === 'levels') state.player.level = run.stats.startingLevel + value;
    else run.stats[quest.definition.metric] = value;
  }
};

describe('冒险任务与一次性奖励', () => {
  it('默认从三个明确目标出发，高阶初始鱼的升级任务也从自身等级计数', () => {
    const state = playing();
    expect(state.quests!.quests).toHaveLength(3);
    expect(state.quests!.completedTotal).toBe(0);
    expect(state.quests!.quests.map(q => questProgress(state.quests!, q))).toEqual([0, 0, 0]);
    const high = createInitialState({ skipWorldGen: true, startType: CreatureType.SWORD_FISH });
    expect(questValue(high.quests!, 'levels')).toBe(0);
  });

  it('只统计玩家的真实动作，未释放的按键、其他鱼和破岩提示不刷任务', () => {
    const state = playing(), ctx = context();
    const npc = { id: 'other' } as Entity;
    frame(state, ctx, () => {
      ctx.events.emit('eat', { attacker: npc, victim: npc, isBackAttack: false, x: 0, y: 0 });
      ctx.events.emit('skill', { entity: npc, skillId: 'X', skillName: 'X' });
      ctx.events.emit('pickup', { x: 0, y: 0, label: '岩层破碎', color: '#fff' });
    });
    expect(state.quests!.stats).toMatchObject({ eaten: 0, skills: 0, pickups: 0 });
    frame(state, ctx, () => {
      ctx.events.emit('eat', { attacker: state.player, victim: npc, isBackAttack: false, x: 0, y: 0 });
      ctx.events.emit('skill', { entity: state.player, skillId: 'X', skillName: 'X' });
      ctx.events.emit('coin', { x: 0, y: 0, value: 15 });
      ctx.events.emit('pickup', { x: 0, y: 0, label: '护盾', color: '#fff' });
    });
    expect(state.quests!.stats).toMatchObject({ eaten: 1, skills: 1, pickups: 2 });
    ctx.events.emit('coin', { x: 0, y: 0, value: 15 }); // Outside a live frame.
    expect(state.quests!.stats.pickups).toBe(2);
  });

  it('奖励立即同步体重、进化点、等级与半径，不会重复发放', () => {
    const state = playing(), ctx = context();
    const p = state.player; p.weight = 19; p.evolutionPoints = 19;
    const radius = p.radius;
    let awarded = 0; ctx.events.on('questReward', () => awarded++);
    frame(state, ctx, () => { state.quests!.stats.eaten = 3; });
    expect(p.weight).toBe(23); expect(p.evolutionPoints).toBe(23);
    expect(p.level).toBe(3); expect(p.radius).toBeGreaterThan(radius);
    expect(state.score).toBe(20); expect(awarded).toBe(1);
    for (let i = 0; i < 20; i++) frame(state, ctx);
    expect(p.weight).toBe(23); expect(state.score).toBe(20); expect(awarded).toBe(1);
  });

  it('一章三个任务加一份阶段礼包，奖励产生的等级不会在同帧连锁完成下章', () => {
    const state = playing(), ctx = context(); readyChapter(state);
    const weight = state.player.weight;
    beginQuestFrame(state, ctx);
    questsSystem(state, ctx); const distance = state.quests!.stats.distance;
    questsSystem(state, ctx); endQuestFrame(ctx);
    expect(state.quests!.chapter).toBe(1);
    expect(state.quests!.completedTotal).toBe(3);
    expect(state.player.weight).toBe(weight + 4 + 3 + 4);
    expect(state.score).toBe(20 + 30 + 40);
    expect(state.quests!.stats.distance).toBe(distance);
    expect(state.quests!.quests.every(q => !q.completed)).toBe(true);
    expect(state.quests!.notice?.chapterComplete).toBe(true);
  });

  it('生命恢复封顶，已有更长的护盾不会被任务缩短', () => {
    const state = playing(), ctx = context();
    state.player.health = state.player.maxHealth * 0.95; state.player.shieldTimer = 1200;
    readyChapter(state); frame(state, ctx);
    expect(state.player.health).toBe(state.player.maxHealth);
    expect(state.player.shieldTimer).toBe(1200);
  });

  it('任务奖励不能复活致命受击的鱼，也不改写胜利后的结算', () => {
    const state = playing(), ctx = context(); readyChapter(state);
    state.player.health = 0; const weight = state.player.weight;
    frame(state, ctx);
    expect(state.player.health).toBe(0); expect(state.player.weight).toBe(weight);
    expect(state.quests!.completedTotal).toBe(0);
    state.player.health = state.player.maxHealth;
    beginQuestFrame(state, ctx); state.status = GameStatus.VICTORY;
    questsSystem(state, ctx); endQuestFrame(ctx);
    expect(state.quests!.completedTotal).toBe(0);
  });

  it('早于任务解锁的拾取和技能会保留，进度属于本局而非全局订阅', () => {
    const state = playing(), fresh = playing(), ctx = context();
    frame(state, ctx, () => { for (let i = 0; i < 3; i++) ctx.events.emit('coin', { x: 0, y: 0, value: 15 }); });
    readyChapter(state); frame(state, ctx); frame(state, ctx);
    expect(state.quests!.quests[0].completed).toBe(true);
    frame(fresh, ctx);
    expect(fresh.quests!.stats.pickups).toBe(0);
    expect(fresh.quests!.completedTotal).toBe(0);
    expect(ctx.events.listenerCount('coin')).toBe(1);
  });

  it('三章后持续提供委托，新一轮从新动作计数且任务存储不会增长', () => {
    const state = playing(), ctx = context();
    for (let i = 0; i < QUEST_CHAPTERS.length; i++) { readyChapter(state); frame(state, ctx); }
    expect(state.quests!.completedTotal).toBe(9);
    expect(state.quests!.round).toBe(1);
    expect(state.quests!.quests.map(q => questProgress(state.quests!, q))).toEqual([0, 0, 0]);
    for (let i = 0; i < 10; i++) { readyChapter(state); frame(state, ctx); }
    expect(state.quests!.round).toBe(11);
    expect(state.quests!.quests).toHaveLength(3);
    expect(state.quests!.quests.map(q => questProgress(state.quests!, q))).toEqual([0, 0, 0]);
  });

  it('游动和加速只计算实际位移，原地按空格与传送不会刷进度', () => {
    const state = playing(), ctx = context(); state.player.boost.active = true;
    frame(state, ctx); expect(state.quests!.stats.dashFrames).toBe(0);
    frame(state, ctx, () => { state.player.x += 6; state.player.y += 8; });
    expect(state.quests!.stats.distance).toBe(10); expect(state.quests!.stats.dashFrames).toBe(1);
    frame(state, ctx, () => { state.player.x += 1000; });
    frame(state, ctx, () => { state.pondId = 'CORAL'; state.player.x += 5; });
    frame(state, ctx, () => { state.squad.possessCount++; state.player.x += 5; });
    expect(state.quests!.stats.distance).toBe(10);
  });

  it('超大原点的无尽海域重定位只计算真实游动，进度不跳变', () => {
    const state = playing('ENDLESS'), ctx = context();
    const origin = 9007199254741993n;
    state.endlessWorld!.originChunkX = String(origin); state.player.x = 1805;
    frame(state, ctx, () => { state.endlessWorld!.originChunkX = String(origin + 1n); state.player.x = 10; });
    expect(state.quests!.stats.distance).toBe(5);
  });

  it('菜单和暂停不推进任务，复活继续进度，真正重开重新出发', () => {
    const state = playing(), ctx = context(); state.quests!.stats.eaten = 2;
    state.status = GameStatus.SHOP;
    frame(state, ctx, () => ctx.events.emit('coin', { x: 0, y: 0, value: 15 }));
    expect(state.quests!.stats.pickups).toBe(0);
    state.status = GameStatus.PLAYING; frame(state, ctx);
    expect(state.quests!.stats.eaten).toBe(2);
    expect(playing().quests!.stats.eaten).toBe(0);
  });

  it('实际引擎帧会跟踪游动并结算奖励，而非只有独立测试系统可用', () => {
    const state = playing(); state.player.isGodMode = true;
    state.quests!.stats.eaten = 3;
    updateGame(state, { x: 840, y: 360 }, true, false, false, 1280, 720);
    expect(state.quests!.stats.distance).toBeGreaterThan(0);
    expect(state.quests!.completedTotal).toBe(1);
    expect(state.score).toBe(20);
  });
});
