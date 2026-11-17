import type { FrameContext, GameState } from '../types';
import { PLAYER_GROWTH_CONFIG } from '../data/world';
import { ARENA_RULES } from '../data/arena';
import { getReefPassages } from '../data/reefClusters';
import { pointSegmentDistance, segmentClearance, REEF_MARGIN } from '../core/obstacleGeometry';

const levelRadiusBonus = (baseRadius: number, level: number): number => Math.min(
  Math.max(0, level - 1) * PLAYER_GROWTH_CONFIG.RADIUS_PER_LEVEL,
  baseRadius * (PLAYER_GROWTH_CONFIG.MAX_RADIUS_MULT - 1),
);

export const getPlayerGrowthRadius = (baseRadius: number, level: number): number =>
  baseRadius + levelRadiusBonus(baseRadius, level);

/** Reserve earned radius growth while either the body or the refuge's exit is too narrow. */
export const getPlayerRadiusCapacity = (state: GameState): number => {
  const p = state.player;
  let capacity = segmentClearance(p, p, state.obstacles) - REEF_MARGIN;
  for (const passage of getReefPassages(state.obstacles)) {
    const a = passage.points[0], b = passage.points[2];
    // A chamber may be roomy even though both exits are narrower than the grown fish.
    if (pointSegmentDistance(p, a, b) < passage.clearance + 16) capacity = Math.min(capacity, passage.clearance - REEF_MARGIN);
  }
  return capacity;
};

export const applyPlayerRadiusGrowth = (state: GameState, amount = 0): void => {
  const p = state.player;
  const desired = Math.min(p.radius + (p.pendingRadiusGrowth ?? 0) + amount,
    p.config.baseRadius * PLAYER_GROWTH_CONFIG.MAX_RADIUS_MULT);
  const capacity = getPlayerRadiusCapacity(state);
  const applied = Math.max(p.radius, Math.min(desired, capacity,
    amount === 0 ? p.radius + 0.5 : desired));
  p.pendingRadiusGrowth = Math.max(0, desired - applied);
  p.radius = applied;
};

/** 所有玩家经验奖励在同一处同步体重、等级与体型，避免延迟到下一次击杀才补算。 */
export const awardPlayerGrowth = (
  state: GameState, ctx: FrameContext, weight: number,
  options: { evolutionPoints?: number; bonusLevels?: number } = {},
): boolean => {
  const p = state.player;
  p.weight += weight;
  p.evolutionPoints += options.evolutionPoints ?? weight;
  const level = state.arena
    ? Math.min(ARENA_RULES.maxLevel, Math.max(p.level, 2 + Math.floor(Math.max(0, p.weight - 15) / ARENA_RULES.growthPerLevel)))
    : Math.max(p.level + (options.bonusLevels ?? 0), Math.floor(p.weight / 10) + 1);
  if (level <= p.level) return false;
  const baseRadius = p.config.baseRadius;
  applyPlayerRadiusGrowth(state, levelRadiusBonus(baseRadius, level) - levelRadiusBonus(baseRadius, p.level));
  p.level = level;
  ctx.events.emit('levelup', { entity: p, level });
  return true;
};
