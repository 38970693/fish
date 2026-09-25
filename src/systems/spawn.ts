/**
 * 实体工厂 + 生成系统
 *
 * 生成池由 data/creatures.ts 自动推导：spawnSystem 走 getSpawnPool(塘, tier) ——
 * 塘限定物种（特产鱼）只出现在所属塘；往注册表里加一条鱼，它会自动进对应塘的池子。
 */

import { CREATURES, CreatureType, getSpawnPool } from '../data/creatures';
import { randomizeCosmetics } from '../data/cosmetics';
import { randomizeMood, randomMoodTimer } from '../data/moods';
import { rareVariantRollFromId, rollRareVariant } from '../data/rareVariants';
import type { MoodId } from '../data/moods';
import { MAX_ENTITIES, RIVALS_SPAWN_CONFIG, TREASURE_CONFIG, WORLD_SIZE } from '../data/world';
import { getPond } from '../data/ponds';
import { type Entity, type GameState, type FrameContext } from '../types';
import { uuid } from '../core/math';
import { isPositionValid } from './terrain';

/** 可选覆盖项 —— 测试要钉住随机性时用（比钉 `Math.random` 干净得多） */
export interface CreateEntityOptions {
  /** 钉死心境；不给则按种族加权随机抽 */
  moodId?: MoodId;
}

/** 创建一条鱼。配置缺失时回退到小丑鱼，绝不返回 undefined */
export const createEntity = (
  type: string,
  x: number,
  y: number,
  options?: CreateEntityOptions
): Entity => {
  const config = CREATURES[type as CreatureType] ?? CREATURES.CLOWN_FISH;
  return {
    id: uuid(),
    type: config.type,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: config.baseRadius,
    angle: Math.random() * Math.PI * 2,
    health: config.health,
    maxHealth: config.health,
    speed: config.speed,
    config,
    mouthOpenValue: 0,
    isHidden: false,
    isIdle: false,
    lureActive: false,
    camoActive: false,
    ambushTimer: 0,
    animOffset: Math.random() * 100,
    renderScale: 1.0,
    isInvulnerable: false,
    aggroTimer: 0,
    speedBoostTimer: 0,
    happyTimer: 0,
    fearTimer: 0,
    speechBubble: null,
    evolutionVisualTimer: 0,
    level: config.tier + 1,
    // AI 鱼随机穿搭：让鱼群各有各的样子（玩家走 initialState，用自己的装扮，不受影响）
    cosmetics: randomizeCosmetics(config),
    // AI 鱼随机心境：同一品种也有不同性格（悠闲 / 警觉 / 饥饿 / 瞌睡…）
    moodId: options?.moodId ?? randomizeMood(config),
    moodTimer: randomMoodTimer(),
    poisonTimer: 0,
    angerTimer: 0,
    /** 新生成的鱼有半虚保护期，避免刚出生就被秒 / 刚出生就秒人 */
    semiGhostTimer: TREASURE_CONFIG.SEMI_GHOST_DURATION,
  };
};

/** 只给自然生成的野生鱼抽稀有外观；脚本、敌队和测试创建保持确定语义。 */
export const applyWildRareVariant = (entity: Entity, roll?: number): Entity => {
  const rareVariant = rollRareVariant(
    entity.type as CreatureType,
    roll ?? rareVariantRollFromId(entity.id)
  );
  if (!rareVariant || !entity.cosmetics) return entity;
  entity.cosmetics = {
    ...entity.cosmetics,
    rareVariant,
    skinColor: 'DEFAULT',
    pattern: 'NONE',
    scaleType: 'NONE',
    trailType: 'GLITTER',
  };
  return entity;
};

/** 在地图内随机位置生成一条鱼（位置不合法则放弃，返回 null） */
export const spawnCreature = (state: GameState, type: string): Entity | null => {
  if (state.worldMode === 'ENDLESS') return spawnCreatureNearPlayer(state, type);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const x = Math.random() * WORLD_SIZE;
    const y = Math.random() * WORLD_SIZE;
    if (!isPositionValid(x, y, 50, state.pondId, state.worldMode)) continue;
    const entity = applyWildRareVariant(createEntity(type, x, y));
    state.entities.push(entity);
    return entity;
  }
  return null;
};

const isNearbySpawnClear = (state: GameState, x: number, y: number): boolean => {
  if (!isPositionValid(x, y, RIVALS_SPAWN_CONFIG.SPAWN_BUFFER, state.pondId, state.worldMode)) return false;
  const blockedByObstacle = state.obstacles.some(
    (obstacle) => obstacle.featureState !== 'BROKEN'
      && Math.hypot(x - obstacle.x, y - obstacle.y) < obstacle.radius + RIVALS_SPAWN_CONFIG.SPAWN_BUFFER
  );
  if (blockedByObstacle) return false;
  return !state.buildings.some(
    (building) => Math.hypot(x - building.x, y - building.y) < building.radius + RIVALS_SPAWN_CONFIG.SPAWN_BUFFER
  );
};

/** 在玩家周边环带生成，让新生物从视野边缘附近进入而不是贴脸出现。 */
export const spawnCreatureNearPlayer = (state: GameState, type: string): Entity | null => {
  const spec = CREATURES[type as CreatureType] ?? CREATURES.CLOWN_FISH;
  const isThreat = spec.tier > state.player.config.tier;
  const minDistance = isThreat
    ? Math.max(RIVALS_SPAWN_CONFIG.NEAR_MIN_DISTANCE, RIVALS_SPAWN_CONFIG.THREAT_MIN_DISTANCE)
    : RIVALS_SPAWN_CONFIG.NEAR_MIN_DISTANCE;

  for (let attempt = 0; attempt < RIVALS_SPAWN_CONFIG.POSITION_ATTEMPTS; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = minDistance + Math.random() * (RIVALS_SPAWN_CONFIG.NEAR_MAX_DISTANCE - minDistance);
    const x = state.player.x + Math.cos(angle) * distance;
    const y = state.player.y + Math.sin(angle) * distance;
    if (!isNearbySpawnClear(state, x, y)) continue;
    const entity = applyWildRareVariant(createEntity(type, x, y));
    state.entities.push(entity);
    return entity;
  }
  return null;
};

const nearbyWildlife = (state: GameState): Entity[] => {
  const maxDistanceSq = RIVALS_SPAWN_CONFIG.NEAR_MAX_DISTANCE ** 2;
  return state.entities.filter((entity) => {
    if (entity.ownerId === state.player.id || entity.health <= 0) return false;
    const dx = entity.x - state.player.x;
    const dy = entity.y - state.player.y;
    return dx * dx + dy * dy <= maxDistanceSq;
  });
};

const pickStarterType = (state: GameState, nearby: Entity[]): CreatureType | null => {
  if (!state.run || state.run.clock > RIVALS_SPAWN_CONFIG.STARTER_WINDOW_FRAMES) return null;
  const foodCount = nearby.filter((entity) => entity.type === CreatureType.PLANKTON).length;
  const recruitCount = nearby.filter((entity) => entity.config.tier === 1).length;
  const needsFood = foodCount < RIVALS_SPAWN_CONFIG.STARTER_FOOD_MIN;
  const needsRecruit = recruitCount < RIVALS_SPAWN_CONFIG.STARTER_RECRUIT_MIN;
  if (!needsFood && !needsRecruit) return null;
  if (needsFood && (!needsRecruit || foodCount <= recruitCount * 3)) return CreatureType.PLANKTON;
  const pool = getSpawnPool(state.pondId, 1);
  return pool[Math.floor(Math.random() * pool.length)] ?? CreatureType.CLOWN_FISH;
};

const pickRegularType = (state: GameState): CreatureType => {
  const pond = getPond(state.pondId);
  const maxTier = Math.min(4, Math.max(1, Math.floor(state.player.level / 2) + 1 + pond.maxTierBonus));
  const targetTier = Math.floor(Math.random() * maxTier) + 1;
  const pool = getSpawnPool(state.pondId, targetTier);
  if (Math.random() < pond.foodRatio || pool.length === 0) return CreatureType.PLANKTON;
  return pool[Math.floor(Math.random() * pool.length)] ?? CreatureType.PLANKTON;
};

/**
 * 按玩家等级决定刷什么。
 * 玩家越强，解锁的 tier 越高；刷食物的概率、tier 上限与**生成池**都由当前鱼塘决定
 * （安全塘喂饱你，危险塘更早出大鱼、且有本塘特产）。
 */
export const spawnSystem = (state: GameState, _ctx: FrameContext): void => {
  const feeding = state.feedingEvent;
  const reserveForEvent = !!state.run && !!feeding && (
    ['WARNING', 'DROPPING', 'LINGERING'].includes(feeding.phase)
    || feeding.timer <= RIVALS_SPAWN_CONFIG.RESERVE_LEAD_FRAMES
  );
  const globalEntityLimit = reserveForEvent
    ? MAX_ENTITIES - RIVALS_SPAWN_CONFIG.RESERVED_EVENT_SLOTS
    : MAX_ENTITIES;
  const entityLimit = state.worldMode === 'ENDLESS'
    ? Math.floor(globalEntityLimit / 2)
    : globalEntityLimit;
  if (state.entities.length >= entityLimit) return;

  if (state.run) {
    const nearby = nearbyWildlife(state);
    if (nearby.length < RIVALS_SPAWN_CONFIG.NEARBY_TARGET) {
      const type = pickStarterType(state, nearby) ?? pickRegularType(state);
      spawnCreatureNearPlayer(state, type);
      return;
    }
  }

  const pond = getPond(state.pondId);
  const maxTier = Math.min(4, Math.max(1, Math.floor(state.player.level / 2) + 1 + pond.maxTierBonus));

  // 新增：附近才刷，远处刷了玩家也看不见，白白浪费实体预算
  const targetTier = Math.floor(Math.random() * maxTier) + 1;
  const pool = getSpawnPool(state.pondId, targetTier);

  if (Math.random() < pond.foodRatio || pool.length === 0) {
    spawnCreature(state, CreatureType.PLANKTON);
    return;
  }

  const pickType = pool[Math.floor(Math.random() * pool.length)];
  spawnCreature(state, pickType);
};
