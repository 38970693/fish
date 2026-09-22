import type { GameState, RivalSquadStatus } from '../types';

export type ContestDangerLevel = 'CALM' | 'WATCH' | 'DANGER';

export interface ContestSquadIntel {
  id: string;
  name: string;
  tactic: '抢食' | '伏击';
  status: RivalSquadStatus;
  alive: number;
}

export interface ContestIntel {
  level: ContestDangerLevel;
  label: string;
  color: string;
  nearbyEnemies: number;
  nearestEnemyDistance: number | null;
  squads: ContestSquadIntel[];
}

const ACTIVE_PHASES = new Set(['WARNING', 'DROPPING', 'LINGERING']);

export const getContestIntel = (state: GameState): ContestIntel => {
  const eventActive = !!state.feedingEvent && ACTIVE_PHASES.has(state.feedingEvent.phase);
  const squads = (state.rivalSquads ?? []).map((squad) => {
    const memberIds = new Set(squad.memberIds);
    const alive = state.entities.filter((entity) => memberIds.has(entity.id) && entity.health > 0).length;
    return {
      id: squad.id,
      name: squad.name,
      tactic: squad.kind === 'AMBUSHER' ? '伏击' as const : '抢食' as const,
      status: squad.status,
      alive,
    };
  });
  if (!eventActive) {
    return { level: 'CALM', label: '平静', color: '#94a3b8', nearbyEnemies: 0, nearestEnemyDistance: null, squads };
  }

  const rivalIds = new Set((state.rivalSquads ?? []).map((squad) => squad.id));
  const distances = state.entities
    .filter((entity) => entity.health > 0 && !!entity.ownerId && rivalIds.has(entity.ownerId))
    .map((entity) => Math.hypot(entity.x - state.player.x, entity.y - state.player.y));
  const nearestEnemyDistance = distances.length > 0 ? Math.min(...distances) : null;
  const nearbyEnemies = distances.filter((distance) => distance <= 560).length;
  const ambushTriggered = squads.some((squad) => squad.tactic === '伏击' && squad.status === 'CONTESTING');
  const playerWounded = state.player.health / state.player.maxHealth <= 0.5;
  const danger = nearestEnemyDistance !== null && (
    nearestEnemyDistance <= 180
    || (playerWounded && nearestEnemyDistance <= 520)
    || (ambushTriggered && nearestEnemyDistance <= 360)
  );
  if (danger) {
    return { level: 'DANGER', label: '高危险', color: '#fb7185', nearbyEnemies, nearestEnemyDistance, squads };
  }
  return {
    level: 'WATCH',
    label: nearbyEnemies > 0 ? '敌队接近' : '敌队入场',
    color: '#fbbf24',
    nearbyEnemies,
    nearestEnemyDistance,
    squads,
  };
};
