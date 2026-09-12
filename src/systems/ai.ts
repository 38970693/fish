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
import { isConcealed, CONCEAL_REVEAL_RANGE_SQ } from './concealment';
import { getMood, randomizeMood, randomMoodTimer } from '../data/moods';
import type { MoodId } from '../data/moods';

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

/**
 * 能否察觉到目标 —— **所有锁定判定的唯一收口**。
 *
 * 隐蔽单位（藏在水草里 / 开着隐身技能）默认看不见，只有两种例外：
 *   · 已经贴到脸上（CONCEAL_REVEAL_RANGE）—— 钻草丛不等于无敌
 *   · 猎手刚放过「声呐扫描」（sonarTimer > 0）—— 这是隐蔽的反制手段
 */
const canPerceive = (seeker: Entity, target: Entity, distSq: number): boolean => {
  if (!isConcealed(target)) return true;
  if (seeker.sonarTimer && seeker.sonarTimer > 0) return true;
  return distSq <= CONCEAL_REVEAL_RANGE_SQ;
};

/** 在候选里找最近的满足条件者（隐蔽目标会被 canPerceive 过滤掉） */
const findNearest = (
  origin: Entity,
  candidates: readonly Entity[],
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
  for (const other of candidates) {
    if (other === origin || other.id === origin.id) continue;
    if (other.health <= 0) continue;
    if (!predicate(other)) continue;
    const d = dist2(origin, other);
    // ⚠️ 隐蔽门闸刻意放在**这里**：6 种行为 + 大鱼反制挑目标全都走 findNearest，
    //    收口一处，就不会出现「A 行为尊重隐蔽、B 行为照追」的半吊子状态。
    //    副作用（有意为之）：躲在水草里的大鱼，小鱼也看不见它 —— 天然的伏击。
    if (!ignoreConcealment && !canPerceive(origin, other, d)) continue;
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
    senseRangeSq(entity, 320)
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
    senseRangeSq(entity, 700)
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
  const agility = getAgility(entity);
  const candidates = [state.player, ...state.entities];
  const prey = findNearest(
    entity,
    candidates,
    (other) => isEnemy(entity)(other) && other.level < entity.level,
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
  const agility = getAgility(entity) * 0.7;
  const candidates = [state.player, ...state.entities];
  const prey = findNearest(
    entity,
    candidates,
    (other) => isEnemy(entity)(other) && other.level < entity.level,
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
    [state.player, ...state.entities],
    (other) => isEnemy(entity)(other) && other.level > entity.level,
    senseRangeSq(entity, 260)
  );
  if (threat.entity) {
    // 惊醒：换成警觉并重新计时 —— 打盹被打断的鱼，接下来一阵子都很敏感
    entity.moodId = 'ALERT';
    entity.moodTimer = randomMoodTimer();
    entity.isIdle = false;
    fleeFrom(entity, threat.entity, state, getAgility(entity));
    return;
  }
  entity.isIdle = true;
  entity.y += Math.sin(state.time * 0.02 + entity.animOffset) * 0.25;
  entity.vx = 0;
  entity.vy = 0;
};

/** 好奇：远远跟着玩家，不太近也不动手 —— 像被围观，不像被追杀 */
const curiousMood: AIHandler = (entity, state) => {
  const agility = getAgility(entity);
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
  const agility = getAgility(entity);
  const mate = findNearest(
    entity,
    state.entities,
    (other) => other.type === entity.type,
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
  const agility = getAgility(entity);
  const prey = findNearest(
    entity,
    [state.player, ...state.entities],
    (other) => isEnemy(entity)(other) && other.level < entity.level,
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
  const agility = getAgility(entity);
  const foe = findNearest(
    entity,
    [state.player, ...state.entities],
    (other) => isEnemy(entity)(other),
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
  if (entity.sonarTimer && entity.sonarTimer > 0) entity.sonarTimer--;
  if (entity.vulnerableTimer && entity.vulnerableTimer > 0) entity.vulnerableTimer--;
  if (entity.fearTimer && entity.fearTimer > 0) entity.fearTimer--;
  if (entity.happyTimer && entity.happyTimer > 0) entity.happyTimer--;
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
    [state.player, ...state.entities],
    (other) => isEnemy(entity)(other) && other.radius < entity.radius,
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

export const aiSystem = (state: GameState, ctx: FrameContext): void => {
  for (const entity of state.entities) {
    tickTimers(entity);

    // 战队成员不是野怪：行为归 squad 系统管（跟随玩家）。
    // 这里必须跳过，否则两个系统每帧各写一次位置，成员会原地抽搐。
    if (entity.ownerId === 'player') continue;

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
