import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { CreatureType } from '../data/creatures';
import { createInitialState } from '../factories/initialState';
import { aiSystem } from '../systems/ai';
import { createBoostParticles, DEFAULT_BOOST_EFFECT } from '../data/boostEffects';
import { boostTrailSystem } from '../systems/boostTrail';
import { playerControlSystem } from '../systems/playerControl';
import { progressionSystem } from '../systems/progression';
import { createEntity } from '../systems/spawn';
import { GameStatus, type FrameContext, type GameEvents } from '../types';

const setup = () => {
  const state = createInitialState({ skipWorldGen: true, mode: 'LEGACY' });
  state.status = GameStatus.PLAYING;
  state.entities = []; state.treasures = [];
  const ctx: FrameContext = {
    mouse: { x: 840, y: 360 },
    input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
    screen: { width: 1280, height: 720 }, events: new EventBus<GameEvents>(), dt: 1,
  };
  return { state, ctx };
};

describe('所有鱼共用加速尾迹', () => {
  it('搭配只改变自己的外观，AI 保持独立配置，常速仍清除', () => {
    const { state, ctx } = setup();
    const player = state.player;
    player.cosmetics.boostEffect = { style: 'FLAME', color: '#fb923c', length: 1.6, width: 0.6, bubbles: false };
    ctx.input.space = true;
    playerControlSystem(state, ctx);
    const npc = createEntity(CreatureType.BLUE_TANG, player.x + 200, player.y);
    npc.id = 'npc'; npc.accelerationMult = 2; npc.vx = 3;
    state.entities = [npc];
    const baseline = createBoostParticles({ ...player, cosmetics: { ...player.cosmetics, boostEffect: undefined } }, state.time, true)[0];
    boostTrailSystem(state, ctx);
    const mine = state.particles.filter(p => p.sourceId === player.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ shape: 'BOOST_JET', boostStyle: 'FLAME', color: '#fb923c' });
    expect(mine[0].length).toBeCloseTo(baseline.length! * 1.6);
    expect(mine[0].size).toBeCloseTo(baseline.size * 0.6);
    expect(state.particles.find(p => p.sourceId === npc.id)).toMatchObject({ boostStyle: 'JET', color: DEFAULT_BOOST_EFFECT.color });
    ctx.input.space = false;
    playerControlSystem(state, ctx); boostTrailSystem(state, ctx);
    expect(state.particles.some(p => p.sourceId === player.id)).toBe(false);
  });

  it('气泡模式只产生气泡，关闭会移除旧尾迹而保留其他粒子', () => {
    const { state, ctx } = setup();
    const player = state.player;
    player.cosmetics.boostEffect = { ...DEFAULT_BOOST_EFFECT, style: 'BUBBLES', bubbles: false };
    ctx.input.space = true;
    playerControlSystem(state, ctx); boostTrailSystem(state, ctx);
    expect(state.particles).toHaveLength(1);
    expect(state.particles[0].shape).toBe('BOOST_BUBBLE');
    state.particles.push({ id: 'other', x: 0, y: 0, vx: 0, vy: 0, color: '#fff', life: 1, maxLife: 1, size: 1 });
    player.cosmetics.boostEffect.style = 'NONE';
    boostTrailSystem(state, ctx);
    expect(state.particles.map(p => p.id)).toEqual(['other']);
  });

  it('玩家加速才发射，尾迹出现在鱼尾后面，松开立即清除', () => {
    const { state, ctx } = setup();
    playerControlSystem(state, ctx); boostTrailSystem(state, ctx);
    expect(state.particles).toHaveLength(0);
    ctx.input.space = true;
    playerControlSystem(state, ctx); boostTrailSystem(state, ctx);
    const jet = state.particles.find(p => p.shape === 'BOOST_JET')!;
    expect(jet.sourceId).toBe('player');
    expect(jet.x).toBeLessThan(state.player.x - state.player.radius);
    expect(jet.vx).toBeLessThan(0);
    ctx.input.space = false;
    playerControlSystem(state, ctx); boostTrailSystem(state, ctx);
    expect(state.particles).toHaveLength(0);
  });

  it('AI 真实逃跑时也发射同样的尾迹，巡游时不显示', () => {
    const { state, ctx } = setup();
    state.player.level = 10;
    const npc = createEntity(CreatureType.BLUE_TANG, state.player.x + 200, state.player.y, { moodId: 'CALM' });
    npc.id = 'npc'; npc.level = 2; npc.semiGhostTimer = 0;
    state.entities = [npc];
    aiSystem(state, ctx); boostTrailSystem(state, ctx);
    expect(npc.accelerationMult).toBeGreaterThan(1.05);
    expect(state.particles.some(p => p.sourceId === 'npc' && p.shape === 'BOOST_JET')).toBe(true);
    state.player.level = 1;
    state.time = 1;
    aiSystem(state, ctx); boostTrailSystem(state, ctx);
    expect(npc.accelerationMult).toBeLessThanOrEqual(1);
    expect(state.particles).toHaveLength(0);
  });

  it('没有能量、停止或死亡的鱼不会留下尾迹', () => {
    const { state, ctx } = setup();
    ctx.input.space = true; state.player.boost.current = 0;
    playerControlSystem(state, ctx); boostTrailSystem(state, ctx);
    expect(state.particles).toHaveLength(0);
    state.player.accelerationMult = 3; state.player.vx = 0; state.player.vy = 0;
    boostTrailSystem(state, ctx);
    expect(state.particles).toHaveLength(0);
    state.player.vx = 10; state.player.health = 0;
    boostTrailSystem(state, ctx);
    expect(state.particles).toHaveLength(0);
  });

  it('大量 AI 同时加速时有粒子上限，玩家仍保留喷流', () => {
    const { state, ctx } = setup();
    state.entities = Array.from({ length: 300 }, (_, i) => {
      const npc = createEntity(CreatureType.BLUE_TANG, state.player.x + i % 10, state.player.y);
      npc.id = `npc-${i}`; npc.accelerationMult = 2; npc.vx = 3; npc.vy = 0;
      return npc;
    });
    for (let frame = 0; frame < 60; frame++) {
      state.time = frame;
      boostTrailSystem(state, ctx); progressionSystem(state, ctx);
      expect(state.particles.length).toBeLessThanOrEqual(800);
    }
    ctx.input.space = true;
    playerControlSystem(state, ctx); boostTrailSystem(state, ctx);
    expect(state.particles.some(p => p.sourceId === 'player')).toBe(true);
  });
});
