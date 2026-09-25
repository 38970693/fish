import type { PondOpportunityState } from '../types';

/** 首轮实验值；设计文档只规定“观察 2 秒、少量治疗和基础分数”。 */
export const LILY_OBSERVATION = {
  DURATION: 2 * 60,
  INTERACT_PADDING: 100,
  HEAL_RATIO: 0.1,
  BASE_SCORE: 20,
} as const;

export const createPondOpportunityState = (): PondOpportunityState => ({
  kind: 'LILY_OBSERVATION',
  targetLandmarkId: null,
  phase: 'AVAILABLE',
  timer: 0,
  duration: LILY_OBSERVATION.DURATION,
  interactHeld: false,
  claimedByPond: {},
  prompt: null,
  lastResult: null,
});
