import type { ExplorationEventState } from '../types';

export const SHIPWRECK_EXPLORATION = {
  SEARCH_DURATION: 3 * 60,
  INTERACT_PADDING: 70,
  DANGER_RANGE: 280,
  SCORE_REWARD: 30,
  COIN_DROPS: 5,
} as const;

export const createExplorationEventState = (): ExplorationEventState => ({
  id: null,
  phase: 'IDLE',
  targetBuildingId: null,
  timer: 0,
  duration: SHIPWRECK_EXPLORATION.SEARCH_DURATION,
  startHitCounter: 0,
  interactHeld: false,
  claimedByPond: {},
  lastResult: null,
});
