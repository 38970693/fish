import { FEEDING_EVENT_CONFIG, randomFeedingDelay } from '../data/feedingEvents';
import { MAX_ENTITIES, RIVALS_SPAWN_CONFIG } from '../data/world';
import type { Entity, FeedingDrop, FeedingEventState, FrameContext, GameState, PlayerState } from '../types';
import { dist2, uuid } from '../core/math';
import { factionOf, FACTION } from './factions';
import { isPositionValid } from './terrain';

const isPointClear = (state: GameState, x: number, y: number, clearance: number): boolean => {
  if (!isPositionValid(x, y, clearance, state.pondId, state.worldMode)) return false;
  const obstacleHit = state.obstacles.some(
    (item) => item.featureState !== 'BROKEN' && Math.hypot(x - item.x, y - item.y) < item.radius + clearance
  );
  if (obstacleHit) return false;
  return !state.buildings.some(
    (item) => Math.hypot(x - item.x, y - item.y) < item.radius + clearance
  );
};

const hasClearRoute = (state: GameState, x: number, y: number): boolean => {
  const length = Math.hypot(x - state.player.x, y - state.player.y);
  const steps = Math.max(1, Math.ceil(length / FEEDING_EVENT_CONFIG.ROUTE_SAMPLE_STEP));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (length * t <= FEEDING_EVENT_CONFIG.ROUTE_START_SKIP) continue;
    const px = state.player.x + (x - state.player.x) * t;
    const py = state.player.y + (y - state.player.y) * t;
    if (!isPointClear(state, px, py, FEEDING_EVENT_CONFIG.CLEARANCE)) return false;
  }
  return true;
};

export const findFeedingEventLocation = (state: GameState): { x: number; y: number } | null => {
  const candidateAt = (angle: number, distance: number): { x: number; y: number } | null => {
    const x = state.player.x + Math.cos(angle) * distance;
    const y = state.player.y + Math.sin(angle) * distance;
    if (isPointClear(state, x, y, FEEDING_EVENT_CONFIG.EVENT_RADIUS) && hasClearRoute(state, x, y)) {
      return { x, y };
    }
    return null;
  };
  for (let attempt = 0; attempt < FEEDING_EVENT_CONFIG.PLACEMENT_ATTEMPTS; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = FEEDING_EVENT_CONFIG.PLACEMENT_MIN_DISTANCE
      + Math.random() * (FEEDING_EVENT_CONFIG.PLACEMENT_MAX_DISTANCE - FEEDING_EVENT_CONFIG.PLACEMENT_MIN_DISTANCE);
    const candidate = candidateAt(angle, distance);
    if (candidate) return candidate;
  }
  const event = state.feedingEvent;
  if (event?.lastX !== null && event?.lastX !== undefined && event.lastY !== null && event.lastY !== undefined) {
    const lastDistance = Math.hypot(event.lastX - state.player.x, event.lastY - state.player.y);
    if (lastDistance >= FEEDING_EVENT_CONFIG.PLACEMENT_MIN_DISTANCE
        && lastDistance <= FEEDING_EVENT_CONFIG.PLACEMENT_MAX_DISTANCE
        && isPointClear(state, event.lastX, event.lastY, FEEDING_EVENT_CONFIG.EVENT_RADIUS)
        && hasClearRoute(state, event.lastX, event.lastY)) {
      return { x: event.lastX, y: event.lastY };
    }
  }
  // 随机候选可能连续落在同一片阻挡区；固定环扫保证普通地形不会因为坏手气反复推迟。
  const distances = [
    FEEDING_EVENT_CONFIG.PLACEMENT_MIN_DISTANCE,
    (FEEDING_EVENT_CONFIG.PLACEMENT_MIN_DISTANCE + FEEDING_EVENT_CONFIG.PLACEMENT_MAX_DISTANCE) / 2,
    FEEDING_EVENT_CONFIG.PLACEMENT_MAX_DISTANCE,
  ];
  for (const distance of distances) {
    for (let step = 0; step < 32; step += 1) {
      const candidate = candidateAt((step / 32) * Math.PI * 2, distance);
      if (candidate) return candidate;
    }
  }
  return null;
};

const beginWarning = (state: GameState, ctx: FrameContext, event: FeedingEventState): void => {
  const location = findFeedingEventLocation(state);
  if (!location) {
    event.timer = FEEDING_EVENT_CONFIG.RETRY_DELAY;
    return;
  }
  Object.assign(event, {
    id: uuid(), phase: 'WARNING', timer: FEEDING_EVENT_CONFIG.WARNING_DURATION,
    x: location.x, y: location.y, drops: [], nextDropIn: 0, totalSpawned: 0, claims: {},
  });
  ctx.events.emit('treasure', {
    x: location.x, y: location.y, label: '投食即将开始！', color: '#fb923c',
  });
};

const makeDrop = (state: GameState, event: FeedingEventState): FeedingDrop | null => {
  if (event.x === null || event.y === null) return null;
  for (let attempt = 0; attempt < FEEDING_EVENT_CONFIG.DROP_PLACEMENT_ATTEMPTS; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * FEEDING_EVENT_CONFIG.EVENT_RADIUS;
    const x = event.x + Math.cos(angle) * distance;
    const y = event.y + Math.sin(angle) * distance;
    if (!isPointClear(state, x, y, FEEDING_EVENT_CONFIG.DROP_RADIUS)) continue;
    return { id: uuid(), x, y, radius: FEEDING_EVENT_CONFIG.DROP_RADIUS, value: FEEDING_EVENT_CONFIG.DROP_VALUE };
  }
  return null;
};

const spawnDropBatch = (state: GameState, event: FeedingEventState): void => {
  const remaining = FEEDING_EVENT_CONFIG.DROP_TOTAL_LIMIT - event.totalSpawned;
  const count = Math.min(FEEDING_EVENT_CONFIG.DROP_BATCH_SIZE, remaining);
  for (let i = 0; i < count; i += 1) {
    const drop = makeDrop(state, event);
    if (drop) {
      event.drops.push(drop);
      event.totalSpawned += 1;
    }
  }
};

const findCollector = (state: GameState, drop: FeedingDrop): Entity | PlayerState | null => {
  const candidates: Array<Entity | PlayerState> = [state.player, ...state.entities.filter((e) => e.health > 0)];
  let winner: Entity | PlayerState | null = null;
  let winnerDistance = Infinity;
  for (const candidate of candidates) {
    const threshold = candidate.radius + drop.radius;
    const distance = dist2(candidate, drop);
    if (distance <= threshold * threshold && distance < winnerDistance) {
      winner = candidate;
      winnerDistance = distance;
    }
  }
  return winner;
};

const awardDrop = (state: GameState, ctx: FrameContext, collector: Entity | PlayerState, drop: FeedingDrop): void => {
  const event = state.feedingEvent!;
  const faction = factionOf(collector);
  event.claims[faction] = (event.claims[faction] ?? 0) + drop.value;
  collector.health = Math.min(collector.maxHealth, collector.health + drop.value * FEEDING_EVENT_CONFIG.PICKUP_HEAL_MULTIPLIER);
  if (faction !== FACTION.PLAYER) return;
  state.player.weight += drop.value;
  state.player.evolutionPoints += drop.value;
  state.player.speechBubble = { text: `抢到投食 +${drop.value}`, timer: 45, color: '#fb923c' };
  ctx.events.emit('pickup', { x: drop.x, y: drop.y, label: `投食 +${drop.value}`, color: '#fb923c' });
};

export const resolveFeedingPickups = (state: GameState, ctx: FrameContext): void => {
  const event = state.feedingEvent;
  if (!event || event.drops.length === 0) return;
  const remaining: FeedingDrop[] = [];
  for (const drop of event.drops) {
    const collector = findCollector(state, drop);
    if (collector) awardDrop(state, ctx, collector, drop);
    else remaining.push(drop);
  }
  event.drops = remaining;
};

const enterCooldown = (event: FeedingEventState): void => {
  event.lastX = event.x;
  event.lastY = event.y;
  event.phase = 'COOLDOWN';
  event.timer = randomFeedingDelay(
    FEEDING_EVENT_CONFIG.REPEAT_DELAY_MIN,
    FEEDING_EVENT_CONFIG.REPEAT_DELAY_MAX
  );
  event.x = null;
  event.y = null;
  event.drops = [];
};

export const isFeedingEventMajorPhase = (state: GameState): boolean =>
  !!state.feedingEvent && ['WARNING', 'DROPPING', 'LINGERING'].includes(state.feedingEvent.phase);

const releaseEventSlot = (state: GameState, event: FeedingEventState): void => {
  const preparing = event.phase === 'WAITING' || event.phase === 'COOLDOWN';
  if (preparing && event.timer > RIVALS_SPAWN_CONFIG.RESERVE_LEAD_FRAMES) return;
  const target = MAX_ENTITIES - RIVALS_SPAWN_CONFIG.RESERVED_EVENT_SLOTS;
  if (state.entities.length <= target) return;
  const minDistanceSq = (RIVALS_SPAWN_CONFIG.NEAR_MAX_DISTANCE + 350) ** 2;
  const index = state.entities.findIndex((entity) =>
    !entity.ownerId && entity.health > 0 && !entity.aggroTimer && !entity.targetId
    && dist2(entity, state.player) > minDistanceSq
  );
  if (index >= 0) state.entities.splice(index, 1);
};

export const feedingEventSystem = (state: GameState, ctx: FrameContext): void => {
  const event = state.feedingEvent;
  if (!state.run || !event) return;
  releaseEventSlot(state, event);
  // 探索占用主要事件槽时暂停候选倒计时；已经开始的投食不会被取消。
  if (state.exploration?.phase === 'SEARCHING'
      && (event.phase === 'WAITING' || event.phase === 'COOLDOWN')) return;
  event.timer -= 1;

  if (event.phase === 'WAITING' || event.phase === 'COOLDOWN') {
    if (event.timer <= 0) beginWarning(state, ctx, event);
    return;
  }
  if (event.phase === 'WARNING') {
    if (event.timer <= 0) {
      event.phase = 'DROPPING';
      event.timer = FEEDING_EVENT_CONFIG.DROP_DURATION;
      event.nextDropIn = 0;
    }
    return;
  }
  if (event.phase === 'DROPPING') {
    event.nextDropIn -= 1;
    if (event.nextDropIn <= 0 && event.totalSpawned < FEEDING_EVENT_CONFIG.DROP_TOTAL_LIMIT) {
      spawnDropBatch(state, event);
      event.nextDropIn = FEEDING_EVENT_CONFIG.DROP_INTERVAL;
    }
    resolveFeedingPickups(state, ctx);
    if (event.timer <= 0) {
      event.phase = 'LINGERING';
      event.timer = FEEDING_EVENT_CONFIG.LINGER_DURATION;
    }
    return;
  }
  resolveFeedingPickups(state, ctx);
  if (event.timer <= 0) enterCooldown(event);
};
