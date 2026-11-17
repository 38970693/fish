import { ARENA_RULES } from '../data/arena';
import type { Entity, FrameContext, GameState, PlayerState } from '../types';
import { awardPlayerGrowth } from './playerGrowth';

export const awardArenaKill = (state: GameState, ctx: FrameContext, victim: Entity, killer: Entity): void => {
  if (!killer.arenaStats || killer.health <= 0) return;
  const body = killer as PlayerState;
  const gain = victim.config.weightValue;
  killer.health = Math.min(killer.maxHealth, killer.health + gain * 2);
  killer.arenaStats.score += victim.arenaStats ? ARENA_RULES.eliminationScore : gain;
  if (victim.arenaStats) killer.arenaStats.kills++;
  awardPlayerGrowth({ ...state, player: body }, ctx, Math.min(gain, body.config.tier * 30));
  body.eatenHistory[victim.type] = (body.eatenHistory[victim.type] ?? 0) + 1;
  state.score = state.player.arenaStats?.score ?? 0;
};
