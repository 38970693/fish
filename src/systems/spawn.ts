/**
 * 实体工厂 + 生成系统
 *
 * 生成池由 data/creatures.ts 的 SPAWN_POOL_BY_TIER 自动推导，
 * 所以往注册表里加一条鱼，它就会按 tier 自动进入刷怪池，不用改这里。
 */

import { CREATURES, CreatureType } from '../data/creatures';
import { randomizeCosmetics } from '../data/cosmetics';
import { MAX_ENTITIES, TREASURE_CONFIG, WORLD_SIZE } from '../data/world';
import { getPond } from '../data/ponds';
import { type Entity, type GameState, type FrameContext } from '../types';
import { uuid } from '../core/math';
import { isPositionValid } from './terrain';

/** 创建一条鱼。配置缺失时回退到小丑鱼，绝不返回 undefined */
export const createEntity = (type: string, x: number, y: number): Entity => {
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
    poisonTimer: 0,
    angerTimer: 0,
    /** 新生成的鱼有半虚保护期，避免刚出生就被秒 / 刚出生就秒人 */
    semiGhostTimer: TREASURE_CONFIG.SEMI_GHOST_DURATION,
  };
};

/** 在地图内随机位置生成一条鱼（位置不合法则放弃，返回 null） */
export const spawnCreature = (state: GameState, type: string): Entity | null => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const x = Math.random() * WORLD_SIZE;
    const y = Math.random() * WORLD_SIZE;
    if (!isPositionValid(x, y, 50)) continue;
    const entity = createEntity(type, x, y);
    state.entities.push(entity);
    return entity;
  }
  return null;
};

/**
 * 按玩家等级决定刷什么。
 * 玩家越强，解锁的 tier 越高；刷食物的概率与 tier 上限由**当前鱼塘**决定
 * （安全塘喂饱你，危险塘更早出大鱼）。
 */
export const spawnSystem = (state: GameState, _ctx: FrameContext): void => {
  if (state.entities.length >= MAX_ENTITIES) return;

  const pond = getPond(state.pondId);
  const maxTier = Math.min(4, Math.max(1, Math.floor(state.player.level / 2) + 1 + pond.maxTierBonus));

  // 新增：附近才刷，远处刷了玩家也看不见，白白浪费实体预算
  const targetTier = Math.floor(Math.random() * maxTier) + 1;
  const pool = SPAWN_TIER_POOL[targetTier as 1 | 2 | 3 | 4];

  if (Math.random() < pond.foodRatio || !pool || pool.length === 0) {
    spawnCreature(state, CreatureType.PLANKTON);
    return;
  }

  const pickType = pool[Math.floor(Math.random() * pool.length)];
  spawnCreature(state, pickType);
};

/** 生成池（从 data 层导入并重导出，方便测试和调试时查看当前池子） */
import { SPAWN_POOL_BY_TIER } from '../data/creatures';

const SPAWN_TIER_POOL: Record<1 | 2 | 3 | 4, string[]> = {
  1: SPAWN_POOL_BY_TIER[1] ?? [],
  2: SPAWN_POOL_BY_TIER[2] ?? [],
  3: SPAWN_POOL_BY_TIER[3] ?? [],
  4: SPAWN_POOL_BY_TIER[4] ?? [],
};

export { SPAWN_TIER_POOL };
