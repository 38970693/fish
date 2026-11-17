import { createBoostParticles, getBoostEffect } from '../data/boostEffects';
import type { Entity, FrameContext, GameState, Particle } from '../types';

const TRAIL_BUDGET = 800;
const isTrail = (p: Particle) => p.shape === 'BOOST_JET' || p.shape === 'BOOST_BUBBLE';

/** 所有鱼用同一套推进尾迹。停下加速立即清除，转弯留下的粒子保留在世界坐标。 */
export const boostTrailSystem = (state: GameState, ctx: FrameContext): void => {
  const zoom = state.camera.zoom || 1;
  const halfWidth = ctx.screen.width / zoom / 2 + 180;
  const halfHeight = ctx.screen.height / zoom / 2 + 180;
  const actors = [state.player, ...state.entities].filter(e => e.health > 0 &&
    (e.accelerationMult ?? 1) > 1.05 && Math.hypot(e.vx, e.vy) > 0.15 &&
    getBoostEffect(e.cosmetics).style !== 'NONE' &&
    Math.abs(e.x - state.camera.x) < halfWidth + e.radius &&
    Math.abs(e.y - state.camera.y) < halfHeight + e.radius);
  const active = new Set(actors.map(e => e.id));
  state.particles = state.particles.filter(p => !isTrail(p) || (!!p.sourceId && active.has(p.sourceId)));
  let count = state.particles.reduce((total, p) => total + (isTrail(p) ? 1 : 0), 0);
  const emit = (e: Entity, bubble: boolean) => {
    if (count >= TRAIL_BUDGET) return;
    if (e !== state.player && count >= TRAIL_BUDGET - 64) return;
    const available = (e === state.player ? TRAIL_BUDGET : TRAIL_BUDGET - 64) - count;
    const particles = createBoostParticles(e, state.time, bubble).slice(0, available);
    state.particles.push(...particles);
    count += particles.length;
  };
  // 玩家保持连续喷流；AI 分帧发射并轮换顺序，鱼群冲刺时限制粒子数量。
  if (active.has(state.player.id)) emit(state.player, state.time % 2 === 0);
  const npcs = actors.filter(e => e !== state.player);
  const start = npcs.length ? Math.floor(state.time / 3) % npcs.length : 0;
  for (let i = 0; i < npcs.length; i++) {
    if ((state.time + i) % 3 === 0) emit(npcs[(start + i) % npcs.length], state.time % 2 === 0);
  }
};
