import type { FeedingEventState } from '../types';

/** FQ-07 投食事件首轮参数，时间单位均为逻辑帧（60 帧 = 1 秒）。 */
export const FEEDING_EVENT_CONFIG = {
  FIRST_DELAY_MIN: 45 * 60,
  FIRST_DELAY_MAX: 60 * 60,
  REPEAT_DELAY_MIN: 75 * 60,
  REPEAT_DELAY_MAX: 100 * 60,
  WARNING_DURATION: 8 * 60,
  DROP_DURATION: 25 * 60,
  LINGER_DURATION: 10 * 60,
  RETRY_DELAY: 5 * 60,
  PLACEMENT_MIN_DISTANCE: 520,
  PLACEMENT_MAX_DISTANCE: 850,
  PLACEMENT_ATTEMPTS: 24,
  ROUTE_SAMPLE_STEP: 70,
  ROUTE_START_SKIP: 180,
  CLEARANCE: 80,
  EVENT_RADIUS: 230,
  DROP_RADIUS: 12,
  DROP_VALUE: 8,
  DROP_BATCH_SIZE: 3,
  DROP_INTERVAL: 150,
  DROP_TOTAL_LIMIT: 30,
  DROP_PLACEMENT_ATTEMPTS: 8,
  PICKUP_HEAL_MULTIPLIER: 2,
} as const;

export const randomFeedingDelay = (min: number, max: number): number =>
  Math.floor(min + Math.random() * (max - min + 1));

export const createFeedingEventState = (): FeedingEventState => ({
  id: null,
  phase: 'WAITING',
  // 初始化不能消耗 Math.random：固定场景依赖创建后的随机流保持不变。
  // 首场采用区间下沿（45 秒），后续场次才在清理时抽 75～100 秒冷却。
  timer: FEEDING_EVENT_CONFIG.FIRST_DELAY_MIN,
  x: null,
  y: null,
  lastX: null,
  lastY: null,
  drops: [],
  nextDropIn: 0,
  totalSpawned: 0,
  claims: {},
});
