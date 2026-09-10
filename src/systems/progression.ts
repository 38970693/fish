/**
 * 进度与收尾系统 —— 死亡判定、进化检查、粒子与飘字回收、相机跟随。
 *
 * 放在每帧最后执行，负责「打扫战场」。
 */

import { EVOLUTION_THRESHOLDS } from '../data/world';
import { GameStatus } from '../types';
import type { GameState, FrameContext } from '../types';

export const progressionSystem = (state: GameState, ctx: FrameContext): void => {
  const player = state.player;

  /* ── 1. 粒子推进与回收 ── */
  for (const p of state.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.02;
  }
  if (state.particles.some((p) => p.life <= 0)) {
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  /* ── 2. 飘字回收（重构前只 push 不清理，会无限堆积） ── */
  for (const l of state.labels) {
    if (l.timer === undefined) l.timer = 60;
    l.timer -= 1;
  }
  if (state.labels.some((l) => (l.timer ?? 0) <= 0)) {
    state.labels = state.labels.filter((l) => (l.timer ?? 0) > 0);
  }

  /* ── 3. 死亡判定 ── */
  if (player.health <= 0 && state.status === GameStatus.PLAYING) {
    state.status = GameStatus.GAME_OVER;
    ctx.events.emit('death', { victim: player });
    return;
  }

  /* ── 4. 进化检查 ── */
  const nextThreshold = EVOLUTION_THRESHOLDS.find((t) => t.tier === player.config.tier + 1);
  if (nextThreshold && player.evolutionPoints >= nextThreshold.weight) {
    state.status = GameStatus.EVOLVING;
    ctx.events.emit('evolve', { entity: player });
    return;
  }

  /* ── 5. 相机平滑跟随 ── */
  state.camera.x += (player.x - state.camera.x) * 0.1;
  state.camera.y += (player.y - state.camera.y) * 0.1;
};
