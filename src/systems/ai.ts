/**
 * AI 系统 —— 按 data/creatures.ts 里的 behavior 字段分发行为。
 *
 * 重构前：所有鱼无条件追玩家（`// 简化版AI，始终追逐玩家`），
 *         config.behavior 定义的六种行为形同虚设，鱼与鱼之间也从不互动。
 * 重构后：每种行为一个 handler，加新行为 = 在 AI_HANDLERS 加一条 + 在 BehaviorId 加一个类型。
 */

import { CREATURES, CreatureType, type BehaviorId } from '../data/creatures';
import { GAME_MECHANICS, TREASURE_CONFIG, COMBAT_CONFIG } from '../data/world';
import { BIOME_EFFECTS, BiomeType } from '../data/biomes';
import { BIG_FISH_COUNTER_SKILLS } from '../data/schools';
import type { SkillId } from '../data/skills';
import type { Entity, GameState, FrameContext } from '../types';
import { dist2, turnToward, num } from '../core/math';
import { getBiome } from './terrain';
import { castSkill } from './skills';

/** 只更新这个范围内的 AI，远处静止不动省性能 */
const AI_ACTIVE_RANGE = 2600;
const AI_ACTIVE_RANGE_SQ = AI_ACTIVE_RANGE * AI_ACTIVE_RANGE;

/** 肉块的香味范围：开诱惑后 800px 内的小鱼都会被吸引 */
const LURE_RANGE_SQ = 800 * 800;

type AIHandler = (entity: Entity, state: GameState) => void;

/** 转向灵敏度：越大越笨重。生态区可追加惩罚（珊瑚区大鱼转向变慢） */
const getAgility = (entity: Entity): number => {
  const base = Math.max(
    0.02,
    GAME_MECHANICS.BASE_TURN_SPEED - entity.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY
  );
  const biome = (entity.currentBiome ?? getBiome(entity.x, entity.y)) as BiomeType;
  const penalty = BIOME_EFFECTS[biome]?.bigFishTurnPenalty ?? 0;
  return Math.max(0.02, base * (1 - penalty));
};

interface Nearest {
  entity: Entity | null;
  distSq: number;
}

/** 在候选里找最近的满足条件者 */
const findNearest = (
  origin: Entity,
  candidates: readonly Entity[],
  predicate: (other: Entity) => boolean,
  rangeSq: number
): Nearest => {
  let best: Entity | null = null;
  let bestSq = rangeSq;
  for (const other of candidates) {
    if (other === origin || other.id === origin.id) continue;
    if (other.health <= 0) continue;
    if (!predicate(other)) continue;
    const d = dist2(origin, other);
    if (d < bestSq) {
      bestSq = d;
      best = other;
    }
  }
  return { entity: best, distSq: bestSq };
};

const isEnemy = (self: Entity) => (other: Entity): boolean => {
  // 同战队不互相攻击
  if (self.ownerId && other.ownerId && self.ownerId === other.ownerId) return false;
  return true;
};

const wander = (entity: Entity, state: GameState, agility: number): void => {
  // 每 90 帧左右换一次方向，避免抖动
  if (!entity.targetId || state.time % 90 === 0) {
    entity.targetId = null;
    entity.angle += (Math.random() - 0.5) * 0.6;
  }
  entity.angle = turnToward(entity.angle, entity.angle, agility);
};

const moveForward = (entity: Entity, state: GameState, speedMult = 1): void => {
  const biome = (entity.currentBiome ?? getBiome(entity.x, entity.y)) as BiomeType;
  const effect = BIOME_EFFECTS[biome];
  let speed = entity.speed * speedMult;

  // 浅滩对小型鱼的速度加成
  if (effect && entity.config.tier <= effect.speedBonusMaxTier) {
    speed *= effect.speedMult;
  }
  // 减速 / 麻痹
  if (entity.speedBoostTimer && entity.speedBoostTimer < 0) speed *= 0.4;

  entity.vx = Math.cos(entity.angle) * speed;
  entity.vy = Math.sin(entity.angle) * speed;
  entity.x += entity.vx;
  entity.y += entity.vy;
};

const fleeFrom = (entity: Entity, threat: Entity, state: GameState, agility: number): void => {
  const away = Math.atan2(entity.y - threat.y, entity.x - threat.x);
  entity.angle = turnToward(entity.angle, away, agility);
  moveForward(entity, state, 1.1);
  entity.fearTimer = 30;
};

const chaseTo = (entity: Entity, prey: Entity, state: GameState, agility: number, mult = 1): void => {
  const toward = Math.atan2(prey.y - entity.y, prey.x - entity.x);
  entity.angle = turnToward(entity.angle, toward, agility);
  moveForward(entity, state, mult);
};

/* ══════════════ 行为实现 ══════════════ */

/** 温顺：随机游荡，只有被逼近才躲 */
const passiveBehavior: AIHandler = (entity, state) => {
  const agility = getAgility(entity);
  const candidates = state.entities;
  const threat = findNearest(
    entity,
    candidates,
    (other) => isEnemy(entity)(other) && other.level > entity.level,
    320 * 320
  );
  if (threat.entity) {
    fleeFrom(entity, threat.entity, state, agility);
    return;
  }
  if (state.time % 120 === 0) entity.angle += (Math.random() - 0.5) * 0.8;
  moveForward(entity, state, 0.6);
};

/** 胆小：持续逃离更大的目标 */
const fleeBehavior: AIHandler = (entity, state) => {
  const agility = getAgility(entity);
  const candidates = [state.player, ...state.entities];
  const threat = findNearest(
    entity,
    candidates,
    (other) => isEnemy(entity)(other) && other.level > entity.level,
    700 * 700
  );
  if (threat.entity) {
    fleeFrom(entity, threat.entity, state, agility);
    return;
  }
  if (state.time % 100 === 0) entity.angle += (Math.random() - 0.5) * 0.7;
  moveForward(entity, state, 0.8);
};

/** 主动：追击比自己小的目标（含玩家） */
const aggressiveBehavior: AIHandler = (entity, state) => {
  const agility = getAgility(entity);
  const candidates = [state.player, ...state.entities];
  const prey = findNearest(
    entity,
    candidates,
    (other) => isEnemy(entity)(other) && other.level < entity.level,
    900 * 900
  );
  if (prey.entity) {
    chaseTo(entity, prey.entity, state, agility, 1.0);
    return;
  }
  if (state.time % 140 === 0) entity.angle += (Math.random() - 0.5) * 0.8;
  moveForward(entity, state, 0.7);
};

/** 埋伏：静止漂浮，猎物进入范围才暴起 */
const ambushBehavior: AIHandler = (entity, state) => {
  const agility = getAgility(entity);
  const candidates = [state.player, ...state.entities];
  const prey = findNearest(
    entity,
    candidates,
    (other) => isEnemy(entity)(other) && other.level < entity.level,
    GAME_MECHANICS.AMBUSH_DISTANCE * GAME_MECHANICS.AMBUSH_DISTANCE
  );

  if (prey.entity) {
    entity.isIdle = false;
    entity.ambushTimer = GAME_MECHANICS.AMBUSH_BONUS_FRAMES;
    chaseTo(entity, prey.entity, state, agility, GAME_MECHANICS.AMBUSH_SPEED_BONUS);
    return;
  }

  // 埋伏中：几乎不动。灯笼鱼点亮「大肉块」引诱猎物，其余鱼隐身伪装
  entity.isIdle = true;
  if (entity.config.special === 'LURE') {
    entity.lureActive = true;
    entity.camoActive = false;
  } else {
    entity.lureActive = false;
    entity.camoActive = entity.config.special === 'CAMO';
  }
  entity.y += Math.sin(state.time * 0.02 + entity.animOffset) * 0.3;
  entity.vx = 0;
  entity.vy = 0;
};

/** 首领：大范围巡逻，见小就吃，转向稳但压迫感强 */
const bossBehavior: AIHandler = (entity, state) => {
  const agility = getAgility(entity) * 0.7;
  const candidates = [state.player, ...state.entities];
  const prey = findNearest(
    entity,
    candidates,
    (other) => isEnemy(entity)(other) && other.level < entity.level,
    1400 * 1400
  );
  if (prey.entity) {
    chaseTo(entity, prey.entity, state, agility, 1.0);
    return;
  }
  if (state.time % 200 === 0) entity.angle += (Math.random() - 0.5) * 0.5;
  moveForward(entity, state, 0.5);
};

/** 吉祥物：只做上下浮动，不参与任何交互 */
const mascotBehavior: AIHandler = (entity, state) => {
  entity.y += Math.sin(state.time * 0.05) * 1.5;
};

/** 行为注册表：加行为就在这里加一条 */
export const AI_HANDLERS: Record<BehaviorId, AIHandler> = {
  PASSIVE: passiveBehavior,
  FLEE: fleeBehavior,
  AGGRESSIVE: aggressiveBehavior,
  AMBUSH: ambushBehavior,
  BOSS: bossBehavior,
  MASCOT: mascotBehavior,
};

/** 每帧递减的计时器集中在这里，避免散落到各系统里忘记清 */
const tickTimers = (entity: Entity): void => {
  if (entity.aggroTimer && entity.aggroTimer > 0) entity.aggroTimer--;
  if (entity.speedBoostTimer && entity.speedBoostTimer !== 0) {
    entity.speedBoostTimer += entity.speedBoostTimer > 0 ? -1 : 1;
  }
  if (entity.semiGhostTimer && entity.semiGhostTimer > 0) entity.semiGhostTimer--;
  if (entity.biteCooldown && entity.biteCooldown > 0) entity.biteCooldown--;
  if (entity.schoolSkillCooldown && entity.schoolSkillCooldown > 0) entity.schoolSkillCooldown--;
  if (entity.ambushTimer && entity.ambushTimer > 0) entity.ambushTimer--;
  if (entity.poisonTimer && entity.poisonTimer > 0) {
    entity.poisonTimer--;
    entity.health -= entity.maxHealth * 0.001;
  }
  if (entity.angerTimer && entity.angerTimer > 0) entity.angerTimer--;
  if (entity.vulnerableTimer && entity.vulnerableTimer > 0) entity.vulnerableTimer--;
  if (entity.fearTimer && entity.fearTimer > 0) entity.fearTimer--;
  if (entity.happyTimer && entity.happyTimer > 0) entity.happyTimer--;
  if (entity.speechBubble && entity.speechBubble.timer > 0) {
    entity.speechBubble.timer--;
    if (entity.speechBubble.timer <= 0) entity.speechBubble = null;
  }
  if (entity.renderScale > 1) entity.renderScale = Math.max(1, entity.renderScale - 0.01);
  // 数值兜底：一旦出现 NaN 立刻修复，防止污染后续所有计算
  if (!Number.isFinite(entity.health)) entity.health = entity.maxHealth;
  if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) {
    entity.x = num(entity.x, 0);
    entity.y = num(entity.y, 0);
  }
};

/* ══════════ 大鱼反制（P1-2） ══════════ */

/** 反制技能冷却（帧）：约 7 秒一次，避免大鱼被小鱼无限刷技能 */
const COUNTER_COOLDOWN = 420;

/**
 * 被小鱼咬到之后，大鱼不再傻站着挨打 —— 按场上情况自动挑一记反制技：
 *   · 对手隐身 / 潜行 → 声呐扫描，先照出来
 *   · 自己血量见底   → 硬鳞展开，先保命
 *   · 其余情况       → 尾浪震荡，把围上来的小鱼轰开
 *
 * 这让「小鱼偷袭大鱼」从稳赚变成有风险：偷袭成功不等于安全。
 */
const tryCounterSkill = (entity: Entity, state: GameState, ctx: FrameContext): void => {
  if (entity.schoolSkillCooldown && entity.schoolSkillCooldown > 0) return;

  const foe = findNearest(
    entity,
    [state.player, ...state.entities],
    (other) => isEnemy(entity)(other) && other.radius < entity.radius,
    600 * 600
  );
  if (!foe.entity) return;

  let skillId: SkillId;
  if (foe.entity.camoActive || foe.entity.isHidden) skillId = BIG_FISH_COUNTER_SKILLS[1];
  else if (entity.health / Math.max(1, entity.maxHealth) < 0.4) skillId = BIG_FISH_COUNTER_SKILLS[2];
  else skillId = BIG_FISH_COUNTER_SKILLS[0];

  if (castSkill(state, ctx, entity, skillId, 1)) {
    entity.schoolSkillCooldown = COUNTER_COOLDOWN;
  }
};

export const aiSystem = (state: GameState, ctx: FrameContext): void => {
  for (const entity of state.entities) {
    tickTimers(entity);

    // 远离玩家的鱼不必每帧思考
    if (dist2(entity, state.player) > AI_ACTIVE_RANGE_SQ) continue;

    const mascotType = CREATURES[CreatureType.MASCOT]?.type;
    if (mascotType && entity.type === mascotType) {
      mascotBehavior(entity, state);
      continue;
    }

    // 优先级 1：谁开着「诱惑」（变肉块），附近比自己小的鱼都会被香味骗过去。
    // 比自己大的鱼不受骗 —— 它们没兴趣，肉块对它们只是可疑物。
    // （灯笼鱼玩家注意：大鱼不会来，但来的小鱼就是送上门的食物）
    const lurer = state.player.lureActive
      ? state.player
      : state.entities.find((e) => e.lureActive && e.health > 0);
    if (lurer && entity.radius < lurer.radius && dist2(entity, lurer) < LURE_RANGE_SQ) {
      const agility = getAgility(entity);
      chaseTo(entity, lurer, state, agility, 1.5);
      continue;
    }

    // 优先级 2：附近有激活的宝藏，一窝蜂去抢
    let lured = false;
    for (const treasure of state.treasures) {
      if (treasure.status !== 'ACTIVE') continue;
      if (dist2(entity, treasure) > TREASURE_CONFIG.SWARM_DETECTION_RANGE ** 2) continue;
      const toward = Math.atan2(treasure.y - entity.y, treasure.x - entity.x);
      entity.angle = turnToward(entity.angle, toward, getAgility(entity));
      moveForward(entity, state, TREASURE_CONFIG.SWARM_SPEED_BOOST);
      lured = true;
      break;
    }
    if (lured) continue;

    // 优先级 3：愤怒中 —— 刚被咬过，不讲体型差距，直接扑向附近的敌人，转向也变灵活
    if (entity.angerTimer && entity.angerTimer > 0) {
      tryCounterSkill(entity, state, ctx);
      const agility = getAgility(entity) * COMBAT_CONFIG.ANGER_AGILITY_MULT;
      const foe = findNearest(
        entity,
        [state.player, ...state.entities],
        (other) => isEnemy(entity)(other),
        900 * 900
      );
      if (foe.entity) {
        chaseTo(entity, foe.entity, state, agility, 1.2);
        continue;
      }
    }

    // 优先级 4：按自身行为分派
    const handler = AI_HANDLERS[entity.config.behavior as BehaviorId] ?? passiveBehavior;
    handler(entity, state);

    // 边界与障碍物统一交给 world 系统处理，避免两处各自 clamp 打架
  }
};

export { getAgility, tickTimers };
