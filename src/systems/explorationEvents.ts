import { SHIPWRECK_EXPLORATION } from '../data/explorationEvents';
import { BuildingType } from '../data/buildings';
import { CreatureType } from '../data/creatures';
import { MAX_ENTITIES } from '../data/world';
import { scoreGain } from '../data/ponds';
import type { Building, ExplorationEventState, FrameContext, GameState } from '../types';
import { dist, uuid } from '../core/math';
import { createParticle } from './combat';
import { createEntity } from './spawn';
import { isFeedingEventMajorPhase } from './feedingEvents';

const findWreck = (state: GameState): Building | undefined =>
  state.buildings.find(building => building.type === BuildingType.SHIPWRECK);

const nearbyDanger = (state: GameState): boolean => state.entities.some(entity => {
  if (entity.health <= 0 || entity.ownerId === 'player') return false;
  if (dist(entity, state.player) > SHIPWRECK_EXPLORATION.DANGER_RANGE + entity.radius) return false;
  return Boolean(entity.ownerId) || entity.radius >= state.player.radius * 1.05;
});

const cancelSearch = (state: GameState, event: ExplorationEventState, reason: string): void => {
  event.phase = 'AVAILABLE';
  event.timer = 0;
  event.lastResult = { text: reason, timer: 90 };
  state.player.speechBubble = { text: reason, timer: 60, color: '#fb923c' };
};

const finishSearch = (
  state: GameState,
  ctx: FrameContext,
  event: ExplorationEventState,
  wreck: Building
): void => {
  const gained = scoreGain(state.pondId, SHIPWRECK_EXPLORATION.SCORE_REWARD);
  state.score += gained;
  for (let i = 0; i < SHIPWRECK_EXPLORATION.COIN_DROPS; i += 1) {
    const angle = (i / SHIPWRECK_EXPLORATION.COIN_DROPS) * Math.PI * 2 + Math.random() * 0.45;
    const distance = 55 + Math.random() * 75;
    state.powerUps.push({
      id: uuid(), x: wreck.x + Math.cos(angle) * distance,
      y: wreck.y + Math.sin(angle) * distance, type: 'COIN', radius: 14,
    });
  }
  if (state.entities.length < MAX_ENTITIES) {
    const ambusher = createEntity(CreatureType.VAMPIRE_SQUID, wreck.x, wreck.y - wreck.radius - 40);
    ambusher.angerTimer = 600;
    ambusher.semiGhostTimer = 0;
    ambusher.speechBubble = { text: '谁动了我的宝藏！', timer: 90, color: '#9f1239' };
    state.entities.push(ambusher);
  }
  for (let i = 0; i < 18; i += 1) state.particles.push(createParticle(wreck.x, wreck.y, '#fbbf24'));

  event.phase = 'COMPLETED';
  event.timer = 0;
  event.claimedByPond[state.pondId] = true;
  event.lastResult = { text: `探索完成 +${gained} 金币`, timer: 150 };
  wreck.activity = { progress: 1, color: '#fbbf24' };
  wreck.prompt = { text: '沉船已搜空', color: '#94a3b8' };
  state.player.speechBubble = { text: `找到遗落物资 +${gained}！`, timer: 90, color: '#fbbf24' };
  ctx.events.emit('buildingUse', { type: BuildingType.SHIPWRECK });
  ctx.events.emit('building', { x: wreck.x, y: wreck.y, label: '沉船搜索完成……小心伏击！', color: '#fbbf24' });
};

export const isExplorationMajorPhase = (state: GameState): boolean =>
  state.exploration?.phase === 'SEARCHING';

export const explorationEventSystem = (state: GameState, ctx: FrameContext): void => {
  const event = state.exploration;
  if (!event) return;
  const risingInteract = ctx.input.interact && !event.interactHeld;
  event.interactHeld = ctx.input.interact;
  if (event.lastResult) {
    event.lastResult.timer -= 1;
    if (event.lastResult.timer <= 0) event.lastResult = null;
  }

  const wreck = findWreck(state);
  if (!wreck) {
    event.id = null;
    event.targetBuildingId = null;
    event.phase = 'IDLE';
    event.timer = 0;
    return;
  }
  event.id = `shipwreck:${state.pondId}`;
  event.targetBuildingId = wreck.id;
  wreck.activity = null;

  if (event.claimedByPond[state.pondId]) {
    event.phase = 'COMPLETED';
    wreck.prompt = dist(state.player, wreck) <= wreck.radius + SHIPWRECK_EXPLORATION.INTERACT_PADDING
      ? { text: '沉船已搜空', color: '#94a3b8' }
      : null;
    return;
  }

  const inRange = dist(state.player, wreck) <= wreck.radius + SHIPWRECK_EXPLORATION.INTERACT_PADDING;
  if (event.phase === 'SEARCHING') {
    const progress = 1 - event.timer / event.duration;
    wreck.activity = { progress: Math.max(0, Math.min(1, progress)), color: '#fbbf24' };
    wreck.prompt = { text: `搜索中 ${Math.ceil(event.timer / 60)}s · 离开或受击会中断`, color: '#fbbf24' };
    if (!inRange) return cancelSearch(state, event, '离开沉船，搜索中断');
    if ((state.player.hostileHitCounter ?? 0) !== event.startHitCounter) return cancelSearch(state, event, '受到攻击，搜索中断');
    if (nearbyDanger(state)) return cancelSearch(state, event, '危险逼近，搜索中断');
    event.timer -= 1;
    if (event.timer <= 0) finishSearch(state, ctx, event, wreck);
    return;
  }

  event.phase = 'AVAILABLE';
  if (!inRange) return;
  if (isFeedingEventMajorPhase(state)) {
    wreck.prompt = { text: '投食争夺进行中，稍后再搜索', color: '#fb923c' };
    return;
  }
  if (nearbyDanger(state)) {
    wreck.prompt = { text: '附近有危险，无法搜索', color: '#ef4444' };
    return;
  }
  wreck.prompt = { text: '按 E 搜索沉船（3秒）', color: '#fbbf24' };
  if (!risingInteract) return;
  event.phase = 'SEARCHING';
  event.timer = event.duration;
  event.startHitCounter = state.player.hostileHitCounter ?? 0;
  event.lastResult = null;
  wreck.activity = { progress: 0, color: '#fbbf24' };
};
