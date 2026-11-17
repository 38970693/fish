import type { GameState, PlayerState } from '../types';
import { sec, ARENA_RULE_VERSION } from './runRules';

export const ARENA_RULES = {
  version: ARENA_RULE_VERSION, duration: sec(240), radius: 900, spawnRadius: 550,
  protection: sec(8), foodCap: 36, eliminationScore: 50,
  growthPerLevel: 12, maxLevel: 12, foodSpacing: 90,
  stages: [
    { at: 0, ratio: 1 }, { at: sec(45), ratio: 0.75 },
    { at: sec(120), ratio: 0.5 }, { at: sec(180), ratio: 0.25 },
  ],
  warning: sec(10), shrinkDuration: sec(10),
} as const;

export interface ArenaStats { score: number; damage: number; kills: number }
export interface ArenaContestant {
  body: PlayerState; name: string; color: string; eliminatedAt: number | null;
}
export interface ArenaState {
  center: { x: number; y: number };
  contestants: ArenaContestant[];
  randomState: number;
  nextId: number;
  result?: { reason: 'ELIMINATED' | 'LAST_SURVIVOR' | 'TIME_LIMIT'; rank: number };
}

/** One authoritative circle for gameplay, HUD and both renderers. */
export const getArenaCircle = (state: GameState) => {
  const clock = state.run?.clock ?? 0;
  const stages = ARENA_RULES.stages;
  let index = 0;
  while (index + 1 < stages.length && clock >= stages[index + 1].at) index++;
  const current = stages[index];
  const previous = stages[Math.max(0, index - 1)];
  const progress = index === 0 ? 1 : Math.min(1, (clock - current.at) / ARENA_RULES.shrinkDuration);
  const radius = ARENA_RULES.radius * (previous.ratio + (current.ratio - previous.ratio) * progress);
  const next = stages[index + 1];
  return { radius, targetRadius: ARENA_RULES.radius * (index > 0 && progress < 1 ? current.ratio : next?.ratio ?? current.ratio),
    warning: !!next && next.at - clock <= ARENA_RULES.warning,
    shrinking: index > 0 && progress < 1,
    nextIn: next ? Math.max(0, next.at - clock) : 0, stage: index };
};

/** Food density follows the playable area, rather than packing the initial budget into the final circle. */
export const getArenaFoodCap = (state: GameState): number => [36, 24, 16, 8][getArenaCircle(state).stage];

export const compareArenaContestants = (a: ArenaContestant, b: ArenaContestant): number => {
  if (a.eliminatedAt === null && b.eliminatedAt !== null) return -1;
  if (b.eliminatedAt === null && a.eliminatedAt !== null) return 1;
  if (a.eliminatedAt !== null && b.eliminatedAt !== null) return b.eliminatedAt - a.eliminatedAt;
  return (b.body.arenaStats?.score ?? 0) - (a.body.arenaStats?.score ?? 0)
    || (b.body.arenaStats?.damage ?? 0) - (a.body.arenaStats?.damage ?? 0);
};

export const getArenaStandings = (state: GameState) => {
  const sorted = [...(state.arena?.contestants ?? [])].sort(compareArenaContestants);
  return sorted.map((contestant, index) => ({ ...contestant,
    rank: 1 + sorted.filter(other => compareArenaContestants(other, contestant) < 0).length,
    order: index,
  }));
};

export const arenaRandom = (arena: ArenaState): number => {
  arena.randomState = (Math.imul(arena.randomState, 1664525) + 1013904223) >>> 0;
  return arena.randomState / 4294967296;
};
