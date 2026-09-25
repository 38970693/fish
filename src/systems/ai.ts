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
// 四叉树宽相位索引：性能基线（scripts/probe-perf.mjs）量出 findNearest 每帧把
// 全部候选扫一到两遍（还每条鱼分配一个 [player, ...entities] 数组），是逻辑层第三贵的一块
import { QuadTree } from '../utils/SpatialHash';
import { getBiome } from './terrain';
import { castSkill } from './skills';
import { dealDamage } from './combat';
import { isConcealed, canPerceive } from './concealment';
import { getMood, randomizeMood, randomMoodTimer } from '../data/moods';
import type { MoodId } from '../data/moods';
import { canHarm } from './factions';

/** 只更新这个范围内的 AI，远处静止不动省性能 */
const AI_ACTIVE_RANGE = 2600;
const AI_ACTIVE_RANGE_SQ = AI_ACTIVE_RANGE * AI_ACTIVE_RANGE;

/** 肉块的香味范围：开诱惑后 800px 内的小鱼都会被吸引 */
const LURE_RANGE_SQ = 800 * 800;

type AIHandler = (entity: Entity, state: GameState) => void;

/** 转向灵敏度：越大越笨重。生态区可追加惩罚（珊瑚区大鱼转向变慢） */
const getAgility = (entity: Entity, state: GameState): number => {
  const base = Math.max(
    0.02,
    GAME_MECHANICS.BASE_TURN_SPEED - entity.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY
  );
  const biome = (entity.currentBiome ?? getBiome(
    entity.x, entity.y, state.worldMode, state.endlessWorld?.seed,
    state.endlessWorld?.originChunkX, state.endlessWorld?.originChunkY,
  )) as BiomeType;
  const penalty = BIOME_EFFECTS[biome]?.bigFishTurnPenalty ?? 0;
  // 心境：警觉的鱼转得快，瞌睡的鱼迟钝
  return Math.max(0.02, base * (1 - penalty) * getMood(entity.moodId).agilityMult);
};

/**
 * 感知范围（平方）—— 心境会缩放它：警觉的鱼看得远，瞌睡的鱼看得近。
 * 所有「锁定目标」的距离都走这里，否则「警觉」就只是个摆设。
 */
const senseRangeSq = (entity: Entity, basePx: number): number => {
  const r = basePx * getMood(entity.moodId).perceptionMult;
  return r * r;
};

interface Nearest {
  entity: Entity | null;
  distSq: number;
}

/* `canPerceive`（锁定唯一收口）已搬到 `systems/concealment.ts` 并导出 ——
 * 集火指令也要用同一份可见性判定，别再在本文件里留第二个副本。 */

/** 在候选里找最近的满足条件者（隐蔽目标会被 canPerceive 过滤掉） */
/**
 * 锁定迟滞：新目标必须比当前锁定目标近 1.25 倍，才允许换目标（比较用平方距离）。
 *
 * 病根：鱼群里往往同时有若干条距离相近的威胁 / 猎物，「最近的那条」每帧都在变，
 * 目标方位角随之每两帧跳 ~2 rad，鱼就一边高频抖动一边转圈 ——
 * 实测 FLEE 小丑鱼 900 帧扫掠 57 圈、转弯半径不到 6px，看上去就是原地打转。
 *
 * 思路与 squad 的 FOLLOW_DEADZONE、好奇 / 群聚的停泊带一脉相承：
 * 在边界处留一段「不改主意」的余量。
 */
const TARGET_HYSTERESIS_SQ = 1.25 * 1.25;

/* ══════════ 本帧空间索引（每帧在 aiSystem 开头重建一次） ══════════ */
/**
 * 候选数组：**player 在前、entities 在后** —— 这个顺序就是旧版
 * `[state.player, ...state.entities]` 的「原数组顺序」，必须原样保留：
 * findNearest 的平局裁决按它来，顺序变了「谁被锁定」就可能变。
 * 数组本身每帧复用（只清空重填），配合下面三样，整条查询路径零分配。
 */
const frameCandidates: Entity[] = [];
const candidateTree = new QuadTree<Entity>();
/** lockId → 实体。旧版是 candidates.find(o => o.id === lockId)（O(n)），现在 O(1)。 */
const candidateById = new Map<string, Entity>();
/** findNearest 的查询结果缓冲（存 frameCandidates 下标，复用） */
const queryBuf: number[] = [];
/** 鱼群查询复用缓冲；只在单条鱼的更新期间使用，避免每帧制造大量临时数组。 */
const schoolNeighborBuf: Entity[] = [];

const findNearest = (
  origin: Entity,
  predicate: (other: Entity) => boolean,
  rangeSq: number,
  /**
   * 无视隐蔽。**只给「已经被咬了一口」的大鱼反制用**：
   * 挨了打就知道附近有东西，于是放声呐把它照出来 —— 这是隐蔽的反制闭环。
   * 普通锁定一律走默认值 false，否则隐蔽就白做了。
   */
  ignoreConcealment = false
): Nearest => {
  let best: Entity | null = null;
  let bestSq = rangeSq;
  /**
   * 平局裁决用：旧版按「候选数组顺序」先到先得（严格 <），四叉树返回顺序不定，
   * 所以这里显式比下标 —— 下标就是 frameCandidates 里的位置，顺序与旧版一致。
   * ⚠️ 初值必须是 -1：bestSq 的初值是 rangeSq，如果允许平局，
   *    「恰好等于 rangeSq」的目标会被错误选中（旧版要求**严格**小于 rangeSq）。
   */
  let bestIdx = -1;

  // 宽相位：先问四叉树「谁可能在附近」，再做原有的精确判定。
  // queryCircle 给的是超集（圆相交判定用 <=），多出来的会被下面的 d < bestSq 过滤掉；
  // 而「真的在 rangeSq 内」的目标一定在结果里 —— 所以最小值不会漏。
  const found = candidateTree.queryCircle(origin.x, origin.y, Math.sqrt(rangeSq), queryBuf);
  for (let k = 0; k < found; k += 1) {
    const other = candidateTree.itemAt(queryBuf[k]);
    if (other === origin || other.id === origin.id) continue;
    if (other.health <= 0) continue;
    const d = dist2(origin, other);
    // 已不可能成为最近目标时，跳过阵营/行为筛选与隐蔽判定。
    // 平局只允许更早的原数组下标胜出；初始 rangeSq 边界仍严格排除。
    if (d > bestSq || (d === bestSq && (bestIdx < 0 || queryBuf[k] >= bestIdx))) continue;
    if (!predicate(other)) continue;
    // ⚠️ 隐蔽门闸刻意放在**这里**：6 种行为 + 大鱼反制挑目标全都走 findNearest，
    //    收口一处，就不会出现「A 行为尊重隐蔽、B 行为照追」的半吊子状态。
    //    副作用（有意为之）：躲在水草里的大鱼，小鱼也看不见它 —— 天然的伏击。
    if (!ignoreConcealment && !canPerceive(origin, other, d)) continue;
    bestSq = d;
    best = other;
    bestIdx = queryBuf[k];
  }

  // 锁定迟滞：上一帧锁的是谁，这帧就还是谁 —— 除非别人明显更近（见上方注释）。
  // 隐蔽仍然一票否决：原本锁定的目标一旦藏起来（且没有声呐），立刻改锁别人。
  // 旧版在这里 candidates.find(o => o.id === lockId ...)（O(n)），现在 O(1) 查表；
  // 「同 id 取先出现那个」的语义由建表时的 first-wins 保持一致。
  const locked = origin.lockId ? candidateById.get(origin.lockId) : undefined;
  if (locked && locked.id !== origin.id && locked.health > 0 && predicate(locked)) {
    const lockedSq = dist2(origin, locked);
    const visible = ignoreConcealment || canPerceive(origin, locked, lockedSq);
    if (visible && lockedSq <= rangeSq && (!best || bestSq * TARGET_HYSTERESIS_SQ >= lockedSq)) {
      return { entity: locked, distSq: lockedSq };
    }
  }

  // 大鱼反制（ignoreConcealment）只是临时探测，不写回锁定记忆，
  // 免得探测结果污染同一帧后面的行为锁定
  if (!ignoreConcealment) origin.lockId = best?.id ?? null;
  return { entity: best, distSq: bestSq };
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
  const biome = (entity.currentBiome ?? getBiome(
    entity.x, entity.y, state.worldMode, state.endlessWorld?.seed,
    state.endlessWorld?.originChunkX, state.endlessWorld?.originChunkY,
  )) as BiomeType;
  const effect = BIOME_EFFECTS[biome];
  // 心境：饥饿 / 狂躁的鱼游得快，瞌睡的鱼慢吞吞
  let speed = entity.speed * speedMult * getMood(entity.moodId).speedMult;

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

const SCHOOL_RADIUS = 430;
const SCHOOL_MAX_NEIGHBORS = 20;
const cruisePhaseCache = new Map<string, number>();

const cruisePhaseFor = (type: string): number => {
  const cached = cruisePhaseCache.get(type);
  if (cached !== undefined) return cached;
  let hash = 0;
  for (let index = 0; index < type.length; index += 1) hash = (hash * 31 + type.charCodeAt(index)) >>> 0;
  const phase = (hash % 6283) / 1000;
  cruisePhaseCache.set(type, phase);
  return phase;
};

const canSchoolTogether = (entity: Entity, other: Entity): boolean => {
  if (other === entity || other.id === entity.id || other.health <= 0 || other.ownerId) return false;
  if ((entity.config.shape ?? 'FISH') !== 'FISH' || (other.config.shape ?? 'FISH') !== 'FISH') return false;
  if (entity.config.tier < 1 || entity.config.tier > 2 || other.config.tier < 1 || other.config.tier > 2) return false;
  if (!['PASSIVE', 'FLEE'].includes(entity.config.behavior) || !['PASSIVE', 'FLEE'].includes(other.config.behavior)) return false;
  if (entity.type === other.type) return true;
  return entity.config.tier === other.config.tier && entity.config.nativeBiome === other.config.nativeBiome;
};

/**
 * Boids 鱼群方向：
 * - separation 防止叠成一团；alignment 让鱼朝同一方向；cohesion 让掉队者回到群体。
 * 返回 null 表示附近没有可组群的鱼，调用方保留原来的单鱼游荡逻辑。
 */
export const calculateSchoolHeading = (entity: Entity, neighbors: readonly Entity[]): number | null => {
  if (neighbors.length === 0) return null;
  let alignX = 0; let alignY = 0;
  let centerX = 0; let centerY = 0; let centerWeight = 0;
  let separateX = 0; let separateY = 0;
  let panicX = 0; let panicY = 0;
  for (const other of neighbors) {
    const dx = other.x - entity.x; const dy = other.y - entity.y;
    const distance = Math.max(0.001, Math.hypot(dx, dy));
    const kinship = other.type === entity.type ? 1 : 0.52;
    const otherSpeed = Math.hypot(other.vx, other.vy);
    alignX += (otherSpeed > 0.01 ? other.vx / otherSpeed : Math.cos(other.angle)) * kinship;
    alignY += (otherSpeed > 0.01 ? other.vy / otherSpeed : Math.sin(other.angle)) * kinship;
    centerX += other.x * kinship; centerY += other.y * kinship; centerWeight += kinship;
    const spacing = Math.max(58, (entity.radius + other.radius) * 2.25);
    if (distance < spacing) {
      const pressure = Math.pow((spacing - distance) / spacing, 1.35) * kinship;
      separateX -= dx / distance * pressure;
      separateY -= dy / distance * pressure;
    }
    if (other.fearTimer && other.fearTimer > 0) {
      panicX += (otherSpeed > 0.01 ? other.vx / otherSpeed : Math.cos(other.angle)) * kinship;
      panicY += (otherSpeed > 0.01 ? other.vy / otherSpeed : Math.sin(other.angle)) * kinship;
    }
  }
  const centerDx = centerX / centerWeight - entity.x;
  const centerDy = centerY / centerWeight - entity.y;
  const centerDistance = Math.max(1, Math.hypot(centerDx, centerDy));
  const currentX = Math.cos(entity.angle); const currentY = Math.sin(entity.angle);
  const desiredX = currentX * 0.55 + alignX / centerWeight * 1.15
    + centerDx / centerDistance * 0.42 + separateX * 2.5 + panicX * 0.75;
  const desiredY = currentY * 0.55 + alignY / centerWeight * 1.15
    + centerDy / centerDistance * 0.42 + separateY * 2.5 + panicY * 0.75;
  return Math.atan2(desiredY, desiredX);
};

/** 有邻居时接管巡游方向；没有邻居时返回 false，由原有 wander 逻辑处理。 */
const schoolCruise = (entity: Entity, state: GameState, agility: number, speedMult: number): boolean => {
  if ((entity.config.shape ?? 'FISH') !== 'FISH' || entity.config.tier < 1 || entity.config.tier > 2) return false;
  schoolNeighborBuf.length = 0;
  const found = candidateTree.queryCircle(entity.x, entity.y, SCHOOL_RADIUS, queryBuf);
  for (let index = 0; index < found && schoolNeighborBuf.length < SCHOOL_MAX_NEIGHBORS; index += 1) {
    const other = candidateTree.itemAt(queryBuf[index]);
    if (!canSchoolTogether(entity, other)) continue;
    const distanceSq = dist2(entity, other);
    if (distanceSq >= SCHOOL_RADIUS * SCHOOL_RADIUS || !canPerceive(entity, other, distanceSq)) continue;
    schoolNeighborBuf.push(other);
  }
  const heading = calculateSchoolHeading(entity, schoolNeighborBuf);
  if (heading === null) return false;
  entity.isIdle = false;
  // 群体转向比单鱼追逐柔和，避免整群像被一根硬杆同时掰弯。
  entity.angle = turnToward(entity.angle, heading, Math.max(0.03, agility * 0.55));
  const densityPace = 0.92 + Math.min(0.12, schoolNeighborBuf.length * 0.012);
  moveForward(entity, state, speedMult * densityPace);
  return true;
};

/** 落单鱼的缓慢蛇形巡游，替代每隔百帧突然抽一个大角度。 */
const gentleCruise = (entity: Entity, state: GameState, agility: number): void => {
  const wave = Math.sin(state.time * 0.011 + cruisePhaseFor(entity.type));
  entity.angle += wave * Math.min(0.009, agility * 0.032);
};

/**
 * 目标是否已经**压在身上**（双方圆相交）—— 「原地转圈」的通用解药。
 *
 * 病根：实体之间没有分离力，可以互相重叠。一旦追 / 逃的双方贴到几乎重合，
 * `atan2` 就掉进奇点 —— 相对位移抖动一丁点，「目标在我哪边」就能翻半圈，
 * 于是鱼每帧都以最大敏捷转向，转弯半径缩到 1px 以内，看上去正是原地打转。
 * 实测（seed 12345，1200 帧）：磷虾 0.84 rad/帧、乌龟 1.44 rad/帧（≈ 满敏捷 × π），
 * 各转上百圈，路程 450px 而净位移只有 12px。
 *
 * 此前给好奇 / 群聚加的「停泊带」属于同一类病的不同表现：那条治的是
 * 「距离边界两侧互抢方向盘」，治不了「目标已经压在身上」这种奇点情形。
 *
 * 治法：双方已经重叠时就**不再追方位角**，保持当前朝向直冲出去，
 * 脱离重叠后自动恢复转向；没重叠时行为零变化。
 * 判定刻意只用半径和、不加额外余量 —— 加余量会把「贴脸识破隐蔽」的正常
 * 追击也吞掉（双髻鲨半径 50，concealment 用例把它摆在 75px 处）。
 */
const isOverlapping = (entity: Entity, target: Entity): boolean => {
  const reach = entity.radius + target.radius;
  return dist2(entity, target) < reach * reach;
};

/** 埋伏型软体鱼暴起时转向很快，在碰撞圆外沿也容易绕猎物打小圈，给它一圈窄缓冲。 */
const isChaseAngleUnstable = (entity: Entity, target: Entity): boolean => {
  const margin = entity.config.behavior === 'AMBUSH' ? 1.1 : 1;
  const reach = (entity.radius + target.radius) * margin;
  return dist2(entity, target) < reach * reach;
};

const fleeFrom = (entity: Entity, threat: Entity, state: GameState, agility: number): void => {
  // 已经压在身上：方位角不可信，保持朝向直接冲出去，别原地打转
  if (!isOverlapping(entity, threat)) {
    const away = Math.atan2(entity.y - threat.y, entity.x - threat.x);
    entity.angle = turnToward(entity.angle, away, agility);
  }
  moveForward(entity, state, 1.1);
  entity.fearTimer = 30;
};

const chaseTo = (entity: Entity, prey: Entity, state: GameState, agility: number, mult = 1): void => {
  // 同上：贴到猎物身上时不再追方位角，直接冲过去
  if (!isChaseAngleUnstable(entity, prey)) {
    const toward = Math.atan2(prey.y - entity.y, prey.x - entity.x);
    entity.angle = turnToward(entity.angle, toward, agility);
  }
  moveForward(entity, state, mult);
};

/* ══════════════ 行为实现 ══════════════ */

/** 温顺：随机游荡，只有被逼近才躲 */
const passiveBehavior: AIHandler = (entity, state) => {
  const agility = getAgility(entity, state);
  const threat = findNearest(
    entity,
    (other) => other !== state.player && canHarm(entity, other) && other.level > entity.level,
    senseRangeSq(entity, 320)
  );
  if (threat.entity) {
    fleeFrom(entity, threat.entity, state, agility);
    return;
  }
  // 保留旧逻辑的随机数消费时机，确保固定种子下后续战斗/掉落序列不漂移；
  // 角度影响缩小，真正的连续弯曲交给 gentleCruise。
  const courseNudge = state.time % 120 === 0 ? (Math.random() - 0.5) * 0.12 : 0;
  if (schoolCruise(entity, state, agility, 0.6)) return;
  entity.angle += courseNudge;
  gentleCruise(entity, state, agility);
  moveForward(entity, state, 0.6);
};

/** 胆小：持续逃离更大的目标 */
const fleeBehavior: AIHandler = (entity, state) => {
  const agility = getAgility(entity, state);
  const threat = findNearest(
    entity,
    (other) => canHarm(entity, other) && other.level > entity.level,
    senseRangeSq(entity, 700)
  );
  if (threat.entity) {
    fleeFrom(entity, threat.entity, state, agility);
    return;
  }
  const courseNudge = state.time % 100 === 0 ? (Math.random() - 0.5) * 0.12 : 0;
  if (schoolCruise(entity, state, agility, 0.8)) return;
  entity.angle += courseNudge;
  gentleCruise(entity, state, agility);
  moveForward(entity, state, 0.8);
};

/** 主动：追击比自己小的目标（含玩家） */
const aggressiveBehavior: AIHandler = (entity, state) => {
  const agility = getAgility(entity, state);
  const prey = findNearest(
    entity,
    (other) => canHarm(entity, other) && other.level < entity.level,
    senseRangeSq(entity, 900)
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
  const agility = getAgility(entity, state);

  /* 威胁优先（2026-09-13 需求：灯笼鱼「来的鱼比自己大则逃跑」）：
   * 体型比自己大的敌人进入感知范围 → 收起诱饵、掉头就跑。
   * 判据用**半径**，和 LURE 吸引是同一把尺子（那边只骗比自己小的鱼）；
   * 同级大鱼靠「同级大吃小」也咬得死我，只看等级会漏掉真正的威胁。 */
  const threat = findNearest(
    entity,
    (other) => canHarm(entity, other) && other.radius > entity.radius,
    senseRangeSq(entity, GAME_MECHANICS.AMBUSH_DISTANCE)
  );
  if (threat.entity) {
    entity.isIdle = false;
    entity.lureActive = false; // 跑路时不再是「大肉块」，别举着香味骗小鱼送死
    fleeFrom(entity, threat.entity, state, agility);
    return;
  }

  const prey = findNearest(
    entity,
    (other) => canHarm(entity, other) && other.level < entity.level,
    senseRangeSq(entity, GAME_MECHANICS.AMBUSH_DISTANCE)
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
  const agility = getAgility(entity, state) * 0.7;
  const prey = findNearest(
    entity,
    (other) => canHarm(entity, other) && other.level < entity.level,
    senseRangeSq(entity, 1400)
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

/* ══════════ 心境行为（AI 鱼的随机状态） ══════════ */

/** 好奇：近于这个距离就退开，保持围观的体面 */
const CURIOUS_STANDOFF = 280;
/**
 * 停泊带外沿：距离落在 [STANDOFF, PARK) 时不再追加任何推力，减速悬停、转身面向玩家。
 * ⚠️ 这条带是「原地转圈」bug 的修复关键：没有它，「追」（≥PARK）和「退」（<STANDOFF）
 * 在边界两侧都是全推力，而转向增益高达 ~0.45/帧 —— 鱼会在 280px 环上每几帧
 * 被抢一次方向盘，原地高频往返打转（用户实测：900 帧穿越 460 次）。
 * 修法与 squad 跟随同款（SQUAD_CONFIG.FOLLOW_DEADZONE）：死区外追，死区内减速滑停。
 */
const CURIOUS_PARK = 380;
const CURIOUS_FOLLOW_RANGE = 900;
/** 群聚：凑到这个距离就配对悬停，免得整群叠在同一个点上（同样是停泊带，防两条鱼互绕对穿） */
const SOCIABLE_KEEP = 135;
const SOCIABLE_RANGE = 700;
/** 饥饿 / 狂躁的搜寻半径 */
const HUNT_RANGE = 1000;

/** 瞌睡：原地上下漂，被逼近就惊醒转成警觉 */
const sleepyMood: AIHandler = (entity, state) => {
  const threat = findNearest(
    entity,
    (other) => canHarm(entity, other) && other.level > entity.level,
    senseRangeSq(entity, 260)
  );
  if (threat.entity) {
    // 惊醒：换成警觉并重新计时 —— 打盹被打断的鱼，接下来一阵子都很敏感
    entity.moodId = 'ALERT';
    entity.moodTimer = randomMoodTimer();
    entity.isIdle = false;
    fleeFrom(entity, threat.entity, state, getAgility(entity, state));
    return;
  }
  entity.isIdle = true;
  entity.y += Math.sin(state.time * 0.02 + entity.animOffset) * 0.25;
  entity.vx = 0;
  entity.vy = 0;
};

/** 好奇：远远跟着玩家，不太近也不动手 —— 像被围观，不像被追杀 */
const curiousMood: AIHandler = (entity, state) => {
  const agility = getAgility(entity, state);
  const d = Math.sqrt(dist2(entity, state.player));
  if (d < CURIOUS_STANDOFF) {
    // 太近：掉头拉开距离。滑出 280 之后会被下面的停泊带接住减速，不会形成往返抖动
    entity.isIdle = false;
    const away = Math.atan2(entity.y - state.player.y, entity.x - state.player.x);
    entity.angle = turnToward(entity.angle, away, agility);
    moveForward(entity, state, 0.8);
    return;
  }
  if (d < CURIOUS_PARK) {
    // 停泊带：不追加推力，速度衰减滑停 + 转身面向玩家 —— 「停下来盯着你看」
    entity.isIdle = true;
    const toward = Math.atan2(state.player.y - entity.y, state.player.x - entity.x);
    entity.angle = turnToward(entity.angle, toward, agility * 0.5);
    entity.vx *= 0.85;
    entity.vy *= 0.85;
    return;
  }
  if (d < CURIOUS_FOLLOW_RANGE * getMood(entity.moodId).perceptionMult) {
    entity.isIdle = false;
    chaseTo(entity, state.player, state, agility, 0.7);
    return;
  }
  // 距离太远失去兴趣：随机游荡
  entity.isIdle = false;
  if (state.time % 120 === 0) entity.angle += (Math.random() - 0.5) * 0.8;
  moveForward(entity, state, 0.6);
};

/** 群聚：往最近的同类身边凑，到位就配对悬停，形成鱼群 */
const sociableMood: AIHandler = (entity, state) => {
  const agility = getAgility(entity, state);
  const mate = findNearest(
    entity,
    (other) => other !== state.player && other.type === entity.type,
    senseRangeSq(entity, SOCIABLE_RANGE)
  );
  if (!mate.entity) {
    entity.isIdle = false;
    if (state.time % 140 === 0) entity.angle += (Math.random() - 0.5) * 0.6;
    moveForward(entity, state, 0.5);
    return;
  }
  if (mate.distSq > SOCIABLE_KEEP * SOCIABLE_KEEP) {
    entity.isIdle = false;
    chaseTo(entity, mate.entity, state, agility, 0.9);
    return;
  }
  // 到位：贴着同伴悬停 —— 速度衰减滑停 + 面向同伴。没有这条带，两条鱼会在
  // 停泊距离上互相穿来穿去打转（「追」在 >KEEP、「漂」在 ≤KEEP，边界互抢方向盘）
  entity.isIdle = true;
  const toward = Math.atan2(mate.entity.y - entity.y, mate.entity.x - entity.x);
  entity.angle = turnToward(entity.angle, toward, agility * 0.5);
  entity.vx *= 0.85;
  entity.vy *= 0.85;
};

/** 饥饿：主动搜寻比自己小的目标，连温顺的鱼也开荤 */
const hungryMood: AIHandler = (entity, state) => {
  const agility = getAgility(entity, state);
  const prey = findNearest(
    entity,
    (other) => canHarm(entity, other) && other.level < entity.level,
    senseRangeSq(entity, HUNT_RANGE)
  );
  if (prey.entity) {
    chaseTo(entity, prey.entity, state, agility, 1.0);
    return;
  }
  if (state.time % 120 === 0) entity.angle += (Math.random() - 0.5) * 0.8;
  moveForward(entity, state, 0.6);
};

/** 狂躁：无视体型差距，见谁咬谁（稀有且危险） */
const frenzyMood: AIHandler = (entity, state) => {
  const agility = getAgility(entity, state);
  const foe = findNearest(
    entity,
    (other) => canHarm(entity, other),
    senseRangeSq(entity, HUNT_RANGE)
  );
  if (foe.entity) {
    chaseTo(entity, foe.entity, state, agility, 1.0);
    return;
  }
  if (state.time % 90 === 0) entity.angle += (Math.random() - 0.5) * 1.2;
  moveForward(entity, state, 0.8);
};

/**
 * 心境注册表 —— 只登记「接管型」心境。
 * 悠闲 / 警觉 / 胆怯不在这里：它们只改速度·灵活度·感知，行为仍归种族管。
 */
export const MOOD_HANDLERS: Partial<Record<MoodId, AIHandler>> = {
  SLEEPY: sleepyMood,
  CURIOUS: curiousMood,
  SOCIABLE: sociableMood,
  HUNGRY: hungryMood,
  FRENZY: frenzyMood,
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

/**
 * 中毒每帧扣血（G1 / FQ-03）。
 *
 * ⚠️ 以前是直接 `entity.health -= maxHealth * 0.001`，绕过统一伤害入口 ——
 *    两个后果：① 无敌帧（闪避）/ 护盾 / 易伤对中毒一律无效；
 *    ② 毒死的人**没有凶手**，死亡结算只能当环境伤害，玩家一分钱拿不到。
 *    现在走 `dealDamage`，来源由 VENOM 写下的 `poisonSourceId` 找回；
 *    找不到施毒者（比如它已经死了）就当环境伤害，不抢别人的归属。
 */
const tickPoison = (
  entity: Entity,
  resolveSource: (id: string) => Entity | undefined
): void => {
  if (!entity.poisonTimer || entity.poisonTimer <= 0) return;
  entity.poisonTimer -= 1;
  const source = entity.poisonSourceId ? resolveSource(entity.poisonSourceId) : undefined;
  dealDamage(entity, entity.maxHealth * COMBAT_CONFIG.POISON_DPS_RATIO, source);
};

/** 每帧递减的计时器集中在这里，避免散落到各系统里忘记清 */
const tickTimers = (
  entity: Entity,
  resolveSource: (id: string) => Entity | undefined
): void => {
  if (entity.aggroTimer && entity.aggroTimer > 0) entity.aggroTimer--;
  if (entity.speedBoostTimer && entity.speedBoostTimer !== 0) {
    entity.speedBoostTimer += entity.speedBoostTimer > 0 ? -1 : 1;
  }
  if (entity.semiGhostTimer && entity.semiGhostTimer > 0) entity.semiGhostTimer--;
  if (entity.biteCooldown && entity.biteCooldown > 0) entity.biteCooldown--;
  if (entity.schoolSkillCooldown && entity.schoolSkillCooldown > 0) entity.schoolSkillCooldown--;
  if (entity.ambushTimer && entity.ambushTimer > 0) entity.ambushTimer--;
  tickPoison(entity, resolveSource);
  if (entity.angerTimer && entity.angerTimer > 0) entity.angerTimer--;
  if (entity.sonarTimer && entity.sonarTimer > 0) entity.sonarTimer--;
  if (entity.vulnerableTimer && entity.vulnerableTimer > 0) entity.vulnerableTimer--;
  if (entity.fearTimer && entity.fearTimer > 0) entity.fearTimer--;
  if (entity.happyTimer && entity.happyTimer > 0) entity.happyTimer--;
  if (entity.hitReactionTimer && entity.hitReactionTimer > 0) entity.hitReactionTimer--;
  if (entity.speechBubble && entity.speechBubble.timer > 0) {
    entity.speechBubble.timer--;
    if (entity.speechBubble.timer <= 0) entity.speechBubble = null;
  }
  // 心境到期就换一个 —— 鱼群才会「活着」换状态。
  // 交战中（愤怒未消）不换：追到一半突然佛系，玩家会觉得 AI 抽风。
  if (typeof entity.moodTimer === 'number') {
    if (entity.moodTimer > 0) entity.moodTimer--;
    else if (!(entity.angerTimer && entity.angerTimer > 0)) {
      entity.moodId = randomizeMood(entity.config);
      entity.moodTimer = randomMoodTimer();
    }
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

  // ⚠️ 这里必须 ignoreConcealment=true：挨了咬就知道附近有东西。
  //    如果也走隐蔽门闸，那隐蔽一旦生效，声呐这个反制技就永远触发不了（分支变成死代码）。
  const foe = findNearest(
    entity,
    (other) => canHarm(entity, other) && other.radius < entity.radius,
    600 * 600,
    true
  );
  if (!foe.entity) return;

  let skillId: SkillId;
  // 对手开着**隐身技能** → 声呐扫描，把它照出来（并让施法者 7 秒内看穿隐蔽）。
  // ⚠️ 这里刻意只认 camoActive，**不认水草掩体**：地形掩体不该被声呐反制，
  //    否则「躲进水草甩掉追杀」都要先硬挨 7 秒，体验上等于没修。
  //    分工：隐身技能 ← 声呐反制；水草掩体 ← 只能靠贴脸（150px）破解。
  if (foe.entity.camoActive || foe.entity.isHidden) skillId = BIG_FISH_COUNTER_SKILLS[1];
  else if (entity.health / Math.max(1, entity.maxHealth) < 0.4) skillId = BIG_FISH_COUNTER_SKILLS[2];
  else skillId = BIG_FISH_COUNTER_SKILLS[0];

  if (castSkill(state, ctx, entity, skillId, 1)) {
    entity.schoolSkillCooldown = COUNTER_COOLDOWN;
  }
};

/**
 * 隐蔽把追杀者甩掉时的反馈：头上冒个「?」。
 * 没有这个提示，玩家分不清「我藏住了」和「AI 只是碰巧没游过来」。
 */
const showConfused = (entity: Entity): void => {
  if (entity.speechBubble) return; // 不抢已有气泡
  entity.speechBubble = { text: '?', timer: 45, color: '#94a3b8' };
};

const followEventRoute = (entity: Entity, state: GameState): boolean => {
  const marker = entity.eventRoute;
  const route = marker && state.pondLayout?.routes.find(candidate => candidate.id === marker.routeId);
  if (!marker || !route || route.points.length === 0) {
    entity.eventRoute = undefined;
    return false;
  }
  const index = Math.max(0, Math.min(marker.waypointIndex, route.points.length - 1));
  const point = route.points[index];
  const dx = point.x - entity.x;
  const dy = point.y - entity.y;
  const distance = Math.hypot(dx, dy);
  if (distance < Math.max(80, entity.radius * 2)) {
    if (index >= route.points.length - 1) {
      entity.eventRoute = undefined;
      return false;
    }
    marker.waypointIndex = index + 1;
    return true;
  }
  entity.angle = turnToward(entity.angle, Math.atan2(dy, dx), Math.max(0.055, getAgility(entity, state)));
  moveForward(entity, state, 1.18);
  return true;
};

export const aiSystem = (state: GameState, ctx: FrameContext): void => {
  /* ── 本帧空间索引：只建一次，下面所有 findNearest 共享 ──
   * 顺序必须是 player 在前（旧版 [player, ...entities] 的原数组顺序），
   * 否则平局裁决会变。全程零分配：数组 / 树 / Map / 结果缓冲都是模块级复用。 */
  frameCandidates.length = 0;
  frameCandidates.push(state.player);
  for (const e of state.entities) frameCandidates.push(e);
  candidateTree.rebuild(frameCandidates);
  candidateById.clear();
  for (const e of frameCandidates) {
    if (!candidateById.has(e.id)) candidateById.set(e.id, e); // first-wins，与 .find 一致
  }

  /* ── 诱惑源：全场只可能有一个。旧版在循环里对每条鱼 find 一遍（O(n²)），
   *    提到循环外只找一次。语义照旧：玩家优先，且**不看玩家血量**（与旧版一致）。 */
  let lurer: Entity | null = state.player.lureActive ? state.player : null;
  if (!lurer) {
    for (const e of state.entities) {
      if (e.lureActive && e.health > 0) {
        lurer = e;
        break;
      }
    }
  }

  // 本帧的 id → 实体查表（含玩家）：中毒要凭 `poisonSourceId` 找回施毒者
  const resolveSource = (id: string): Entity | undefined => candidateById.get(id);

  const managedOwnerIds = new Set<string>([
    'player',
    ...(state.rivalSquads?.map((squad) => squad.id) ?? []),
  ]);

  for (const entity of state.entities) {
    tickTimers(entity, resolveSource);

    // 有阵营归属的队员不是野怪：玩家队由 squad、敌队由 rivalSquads 独占移动。
    // 这里必须跳过，否则两个系统每帧各写一次位置，成员会原地抽搐。
    if (entity.ownerId && managedOwnerIds.has(entity.ownerId)) continue;

    // 深渊星光鱼群的短期路线优先于普通种族 AI；路线完成后恢复原本 FLEE 行为。
    if (entity.eventRoute && followEventRoute(entity, state)) continue;

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
    if (lurer && entity.radius < lurer.radius && dist2(entity, lurer) < LURE_RANGE_SQ) {
      const agility = getAgility(entity, state);
      chaseTo(entity, lurer, state, agility, 1.5);
      continue;
    }

    // 优先级 2：附近有激活的宝藏，一窝蜂去抢
    let lured = false;
    for (const treasure of state.treasures) {
      if (treasure.status !== 'ACTIVE') continue;
      if (dist2(entity, treasure) > TREASURE_CONFIG.SWARM_DETECTION_RANGE ** 2) continue;
      const toward = Math.atan2(treasure.y - entity.y, treasure.x - entity.x);
      entity.angle = turnToward(entity.angle, toward, getAgility(entity, state));
      moveForward(entity, state, TREASURE_CONFIG.SWARM_SPEED_BOOST);
      lured = true;
      break;
    }
    if (lured) continue;

    // 优先级 3：愤怒中 —— 刚被咬过，不讲体型差距，直接扑向附近的敌人，转向也变灵活
    if (entity.angerTimer && entity.angerTimer > 0) {
      tryCounterSkill(entity, state, ctx);
      const agility = getAgility(entity, state) * COMBAT_CONFIG.ANGER_AGILITY_MULT;
      const foe = findNearest(
        entity,
        (other) => canHarm(entity, other),
        900 * 900
      );
      if (foe.entity) {
        chaseTo(entity, foe.entity, state, agility, 1.2);
        continue;
      }
      // 一个敌人都找不到，而玩家正藏在水草里 → 判定为**被甩掉**：愤怒清零，放弃追击。
      // 这就是「躲进水草能甩掉追杀」的落点：不是让你无敌，是让咬过你的那条鱼死心。
      if (isConcealed(state.player) && dist2(entity, state.player) < 900 * 900) {
        entity.angerTimer = 0;
        showConfused(entity);
      }
    }

    // 优先级 4：「接管型」心境先说话 —— 瞌睡 / 好奇 / 群聚 / 饥饿 / 狂躁
    //            会做出种族行为本来做不出的举动；
    //            悠闲 / 警觉 / 胆怯只改数值，仍按种族行为分派。
    const moodHandler = MOOD_HANDLERS[getMood(entity.moodId).id];
    if (moodHandler) {
      moodHandler(entity, state);
    } else {
      const handler = AI_HANDLERS[entity.config.behavior as BehaviorId] ?? passiveBehavior;
      handler(entity, state);
    }

    // 边界与障碍物统一交给 world 系统处理，避免两处各自 clamp 打架
  }
};

export { getAgility, tickTimers };
