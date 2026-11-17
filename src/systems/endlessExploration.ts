import { BUILDING_DATA, BuildingType } from '../data/buildings';
import { ENDLESS_WORLD_CONFIG, type EndlessExplorationLocation } from '../data/endlessWorld';
import { SHIPWRECK_EXPLORATION } from '../data/explorationEvents';
import { CreatureType } from '../data/creatures';
import { MAX_ENTITIES } from '../data/world';
import { scoreGain } from '../data/ponds';
import type { Building, FrameContext, GameState } from '../types';
import { dist, uuid } from '../core/math';
import { createParticle } from './combat';
import { createEntity } from './spawn';
import { isFeedingEventMajorPhase } from './feedingEvents';

const SHELTER_REST_DURATION = 2 * 60;
const SHELTER_HEAL_RATIO = 0.45;
const SHELTER_SHIELD_FRAMES = 3 * 60;

const pushUnique = (items: string[], id: string): void => {
  if (!items.includes(id)) items.push(id);
};

const nearbyDanger = (state: GameState): boolean => state.entities.some(entity => {
  if (entity.health <= 0 || entity.ownerId === 'player') return false;
  if (dist(entity, state.player) > SHIPWRECK_EXPLORATION.DANGER_RANGE + entity.radius) return false;
  return Boolean(entity.ownerId) || entity.radius >= state.player.radius * 1.05;
});

const locationName = (location: EndlessExplorationLocation): string =>
  location.kind === 'SHIPWRECK' ? '沉船残骸' : '暖流庇护所';

const findLocationBuilding = (state: GameState, location: EndlessExplorationLocation): Building | undefined =>
  state.buildings.find(building => building.id === location.id);

const chooseNearestDiscoveredTarget = (state: GameState): string | null => {
  const endless = state.endlessWorld;
  if (!endless) return null;
  const record = endless.exploration;
  let best: { id: string; distance: number } | null = null;
  for (const location of record.activeLocations) {
    if (!record.discoveredIds.includes(location.id) || record.completedIds.includes(location.id)) continue;
    const distance = Math.hypot(location.x - state.player.x, location.y - state.player.y);
    if (!best || distance < best.distance) best = { id: location.id, distance };
  }
  return best?.id ?? null;
};

const cancelInteraction = (state: GameState, text: string): void => {
  const record = state.endlessWorld!.exploration;
  record.phase = 'IDLE';
  record.timer = 0;
  record.lastResult = { text, timer: 90 };
  state.player.speechBubble = { text, timer: 60, color: '#fb923c' };
};

const finishShipwreck = (
  state: GameState,
  ctx: FrameContext,
  location: EndlessExplorationLocation,
  building: Building,
): void => {
  const record = state.endlessWorld!.exploration;
  const gained = scoreGain(state.pondId, SHIPWRECK_EXPLORATION.SCORE_REWARD);
  state.score += gained;
  for (let i = 0; i < SHIPWRECK_EXPLORATION.COIN_DROPS; i += 1) {
    const angle = (i / SHIPWRECK_EXPLORATION.COIN_DROPS) * Math.PI * 2 + Math.random() * 0.45;
    const distance = 55 + Math.random() * 75;
    state.powerUps.push({
      id: uuid(),
      x: building.x + Math.cos(angle) * distance,
      y: building.y + Math.sin(angle) * distance,
      type: 'COIN',
      radius: 14,
    });
  }
  if (state.entities.length < MAX_ENTITIES) {
    const ambusher = createEntity(CreatureType.VAMPIRE_SQUID, building.x, building.y - building.radius - 40);
    ambusher.angerTimer = 600;
    ambusher.semiGhostTimer = 0;
    ambusher.speechBubble = { text: '谁动了我的宝藏！', timer: 90, color: '#9f1239' };
    state.entities.push(ambusher);
  }
  for (let i = 0; i < 18; i += 1) state.particles.push(createParticle(building.x, building.y, '#fbbf24'));
  pushUnique(record.completedIds, location.id);
  record.phase = 'IDLE';
  record.timer = 0;
  record.lastResult = { text: `沉船搜索完成 +${gained} 金币`, timer: 150 };
  record.targetId = chooseNearestDiscoveredTarget(state);
  building.activity = { progress: 1, color: '#fbbf24' };
  building.prompt = { text: '沉船已搜空', color: '#94a3b8' };
  state.player.speechBubble = { text: `找到遗落物资 +${gained}！`, timer: 90, color: '#fbbf24' };
  ctx.events.emit('buildingUse', { type: BuildingType.SHIPWRECK });
  ctx.events.emit('building', { x: building.x, y: building.y, label: '沉船搜索完成……小心伏击！', color: '#fbbf24' });
};

const finishShelter = (
  state: GameState,
  ctx: FrameContext,
  location: EndlessExplorationLocation,
  building: Building,
): void => {
  const record = state.endlessWorld!.exploration;
  const healed = Math.max(0, Math.min(
    state.player.maxHealth - state.player.health,
    state.player.maxHealth * SHELTER_HEAL_RATIO,
  ));
  state.player.health += healed;
  state.player.shieldTimer = Math.max(state.player.shieldTimer, SHELTER_SHIELD_FRAMES);
  pushUnique(record.completedIds, location.id);
  record.phase = 'IDLE';
  record.timer = 0;
  record.lastResult = { text: `暖流休整完成 · 恢复 ${Math.round(healed)} 生命`, timer: 150 };
  record.targetId = chooseNearestDiscoveredTarget(state);
  building.activity = { progress: 1, color: BUILDING_DATA.WARM_SHELTER.color };
  building.prompt = { text: '暖流已经平息', color: '#94a3b8' };
  state.player.speechBubble = { text: '暖流让身体重新有了力气', timer: 90, color: '#fb923c' };
  ctx.events.emit('buildingUse', { type: BuildingType.WARM_SHELTER });
  ctx.events.emit('building', { x: building.x, y: building.y, label: '暖流庇护：恢复生命并获得短暂护盾', color: '#fb923c' });
};

export const endlessExplorationSystem = (state: GameState, ctx: FrameContext): void => {
  if (state.worldMode !== 'ENDLESS' || !state.endlessWorld) return;
  const record = state.endlessWorld.exploration;
  const risingInteract = ctx.input.interact && !record.interactHeld;
  record.interactHeld = ctx.input.interact;

  if (record.lastResult) {
    record.lastResult.timer -= 1;
    if (record.lastResult.timer <= 0) record.lastResult = null;
  }

  // EXP-02：进入发现圈就写航海记录；未完成目标自动选最近的一处。
  for (const location of record.activeLocations) {
    const distance = Math.hypot(location.x - state.player.x, location.y - state.player.y);
    if (distance <= location.discoveryRadius && !record.discoveredIds.includes(location.id)) {
      pushUnique(record.discoveredIds, location.id);
      state.player.speechBubble = {
        text: `发现：${locationName(location)}`,
        timer: 90,
        color: location.kind === 'SHIPWRECK' ? '#fbbf24' : '#fb923c',
      };
    }
  }
  if (!record.targetId || record.completedIds.includes(record.targetId)) {
    record.targetId = chooseNearestDiscoveredTarget(state);
  }

  const target = record.activeLocations.find(location => location.id === record.targetId)
    ?? record.activeLocations.find(location => record.discoveredIds.includes(location.id) && !record.completedIds.includes(location.id));
  if (!target) {
    record.phase = 'IDLE';
    record.timer = 0;
    return;
  }
  record.targetId = target.id;

  const building = findLocationBuilding(state, target);
  if (!building) return;
  building.activity = null;
  const completed = record.completedIds.includes(target.id);
  const inRange = dist(state.player, building) <= building.radius + SHIPWRECK_EXPLORATION.INTERACT_PADDING;
  if (completed) {
    if (inRange) building.prompt = { text: target.kind === 'SHIPWRECK' ? '沉船已搜空' : '暖流已经平息', color: '#94a3b8' };
    return;
  }

  if (record.phase === 'SEARCHING' || record.phase === 'RESTING') {
    if (state.player.health <= 0) {
      return cancelInteraction(state, target.kind === 'SHIPWRECK' ? '搜索因死亡中断' : '休整因死亡中断');
    }
    if (isFeedingEventMajorPhase(state)) {
      return cancelInteraction(state, '主要事件开始，探索中断');
    }
    const progress = 1 - record.timer / Math.max(1, record.duration);
    building.activity = { progress: Math.max(0, Math.min(1, progress)), color: target.kind === 'SHIPWRECK' ? '#fbbf24' : '#fb923c' };
    building.prompt = {
      text: target.kind === 'SHIPWRECK'
        ? `搜索中 ${Math.ceil(record.timer / 60)}s · 离开或受击会中断`
        : `暖流休整 ${Math.ceil(record.timer / 60)}s · 离开会中断`,
      color: target.kind === 'SHIPWRECK' ? '#fbbf24' : '#fb923c',
    };
    if (!inRange) return cancelInteraction(state, target.kind === 'SHIPWRECK' ? '离开沉船，搜索中断' : '离开暖流，休整中断');
    if (target.kind === 'SHIPWRECK') {
      if ((state.player.hostileHitCounter ?? 0) !== record.startHitCounter) return cancelInteraction(state, '受到攻击，搜索中断');
      if (nearbyDanger(state)) return cancelInteraction(state, '危险逼近，搜索中断');
    }
    record.timer -= 1;
    if (record.timer <= 0) {
      if (target.kind === 'SHIPWRECK') finishShipwreck(state, ctx, target, building);
      else finishShelter(state, ctx, target, building);
    }
    return;
  }

  if (!inRange) return;
  if (isFeedingEventMajorPhase(state)) {
    building.prompt = { text: '主要事件进行中，稍后再探索', color: '#fb923c' };
    return;
  }
  if (target.kind === 'SHIPWRECK' && nearbyDanger(state)) {
    building.prompt = { text: '附近有危险，无法搜索', color: '#ef4444' };
    return;
  }
  building.prompt = {
    text: target.kind === 'SHIPWRECK' ? '按 E 搜索沉船（3秒）' : '按 E 在暖流庇护所休整（2秒）',
    color: target.kind === 'SHIPWRECK' ? '#fbbf24' : '#fb923c',
  };
  if (!risingInteract) return;
  record.phase = target.kind === 'SHIPWRECK' ? 'SEARCHING' : 'RESTING';
  record.duration = target.kind === 'SHIPWRECK' ? SHIPWRECK_EXPLORATION.SEARCH_DURATION : SHELTER_REST_DURATION;
  record.timer = record.duration;
  record.startHitCounter = state.player.hostileHitCounter ?? 0;
  record.lastResult = null;
  building.activity = { progress: 0, color: target.kind === 'SHIPWRECK' ? '#fbbf24' : '#fb923c' };
};

export const getEndlessNavigationInfo = (state: GameState): {
  target: EndlessExplorationLocation | null;
  distance: number | null;
  hint: EndlessExplorationLocation | null;
} => {
  if (state.worldMode !== 'ENDLESS' || !state.endlessWorld) return { target: null, distance: null, hint: null };
  const record = state.endlessWorld.exploration;
  const target = record.activeLocations.find(location => location.id === record.targetId) ?? null;
  const distance = target ? Math.hypot(target.x - state.player.x, target.y - state.player.y) : null;
  let hint: EndlessExplorationLocation | null = null;
  let hintDistance = Infinity;
  for (const location of record.activeLocations) {
    if (record.discoveredIds.includes(location.id) || record.completedIds.includes(location.id)) continue;
    const d = Math.hypot(location.x - state.player.x, location.y - state.player.y);
    if (d <= ENDLESS_WORLD_CONFIG.LOCATION_HINT_RANGE && d < hintDistance) {
      hint = location;
      hintDistance = d;
    }
  }
  return { target, distance, hint };
};
