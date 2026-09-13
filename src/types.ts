/**
 * 类型总表 —— 现在是「结构定义 + 数据层门面」。
 *
 * 内容型类型（生物 / 生态区 / 技能 / 建筑）全部由 data/ 层的数据自动推导，
 * 加数据即加类型，不用再来这里手改 enum。
 * 这里只负责「结构」：实体长什么样、游戏状态有哪些字段、每帧上下文是什么。
 */

import type { EventBus } from './core/EventBus';
import type { CreatureConfig, CreatureType } from './data/creatures';
import type { PondId } from './data/ponds';
import type { MoodId } from './data/moods';

/* ══════════════ 内容型类型（从 data 层转发） ══════════════ */

export { CreatureType } from './data/creatures';
export type { CreatureConfig, CreatureSpec, BehaviorId, SpecialId } from './data/creatures';
export type { MoodId } from './data/moods';

export { BiomeType } from './data/biomes';
export type { BiomeType as BiomeTypeId, BiomeEffect } from './data/biomes';

export { SkillId } from './data/skills';

export { BuildingType } from './data/buildings';

export type { PondId, PondConfig } from './data/ponds';

/* ══════════════ 游戏状态机 ══════════════ */

export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  EVOLVING = 'EVOLVING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY',
  SHOP = 'SHOP',
  BATTLE_TEST = 'BATTLE_TEST',
}

/* ══════════════ 装扮 ══════════════ */

export type TeethType =
  | 'NORMAL' | 'SHARP' | 'VAMPIRE' | 'BRACES' | 'GOLD'
  | 'CURVED' | 'DOUBLE_ROW' | 'SABER' | 'GAPPED' | 'DIAMOND'
  | 'RAINBOW' | 'BUGS' | 'BLOCKY';

export type PatternType =
  | 'NONE' | 'STRIPES' | 'SPOTS' | 'TIGER'
  | 'DOTS' | 'CAMO' | 'ZEBRA' | 'LEOPARD'
  | 'HEART' | 'STAR' | 'CIRCUIT' | 'LAVA' | 'KOI' | 'SKELETON'
  | 'LIGHTNING' | 'CLOUD' | 'CHECKER' | 'VINES' | 'TARGET'
  | 'GALAXY' | 'SMILEY' | 'FIREY' | 'RUNE' | 'CANDY';

export type ScaleType =
  | 'NONE' | 'SHINY' | 'DRAGON' | 'STONE'
  | 'FEATHER' | 'MECHANICAL' | 'GLOW' | 'MOSAIC'
  | 'CRYSTAL' | 'VOID' | 'PIXEL'
  | 'ARMOR' | 'DIAMOND_PLATE' | 'SLIME' | 'BIO_HAZARD';

export type AccessoryType =
  | 'NONE' | 'GOLD_CHAIN' | 'PEARL_NECKLACE' | 'JADE_PENDANT'
  | 'SUNGLASSES' | 'CROWN' | 'BOW_TIE' | 'DIAMOND_RING'
  | 'MEDAL' | 'SCARF' | 'HEADPHONES' | 'FLOWER' | 'EYEPATCH' | 'HALO' | 'UNICORN_HORN';

export type TailType =
  | 'DEFAULT' | 'CRESCENT' | 'FORKED' | 'FAN' | 'TRIDENT'
  | 'LOBSTER' | 'MECHANICAL' | 'GHOST' | 'RIBBON';

export type BodyType =
  | 'DEFAULT' | 'ROUND' | 'SLENDER' | 'CHUNKY' | 'BOX'
  | 'STAR' | 'MERMAID' | 'RAY' | 'EEL';

export type MouthType = 'TRIANGLE' | 'CIRCLE' | 'SQUARE' | 'FLAT' | 'BEAK' | 'CURVE';

export type EyeType =
  | 'NORMAL' | 'ANIME' | 'MAD' | 'DERP' | 'CYBORG' | 'DEAD'
  | 'LOVE' | 'HYPNO' | 'CAT' | 'FIRE' | 'BUTTON' | 'GOGGLES';

export type EyebrowType = 'NONE' | 'ANGRY' | 'SAD' | 'CONFUSED' | 'THICK' | 'UNI' | 'TIERED';

export type TrailType = 'NONE' | 'BUBBLES' | 'RAINBOW' | 'FIRE' | 'GLITTER' | 'HEARTS' | 'ELECTRIC' | 'SLIME';

export interface Cosmetics {
  teeth: TeethType;
  skinColor: string;
  pattern: PatternType;
  scaleType: ScaleType;
  accessory: AccessoryType;
  tailType: TailType;
  bodyType: BodyType;
  mouthType: MouthType;
  eyeType: EyeType;
  eyebrowType: EyebrowType;
  trailType: TrailType;
}

export const DEFAULT_COSMETICS: Cosmetics = {
  teeth: 'NORMAL',
  skinColor: 'DEFAULT',
  pattern: 'NONE',
  scaleType: 'NONE',
  accessory: 'NONE',
  tailType: 'DEFAULT',
  bodyType: 'DEFAULT',
  mouthType: 'TRIANGLE',
  eyeType: 'NORMAL',
  eyebrowType: 'NONE',
  trailType: 'NONE',
};

/* ══════════════ 实体 ══════════════ */

export interface Entity {
  id: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  health: number;
  maxHealth: number;
  speed: number;
  config: CreatureConfig;

  targetId?: string | null;
  /**
   * AI 上一帧锁定的目标（追 / 逃 / 群聚），用于「锁定迟滞」。
   * 与 targetId 分开：targetId 会被技能（混乱）改写，AI 不能拿它当自己的记忆。
   */
  lockId?: string | null;
  ownerId?: string;
  aggroTimer?: number;
  /** 声呐反制（帧）：> 0 时看穿隐蔽 —— 由 skills 的「声呐扫描」写入，ai 读 */
  sonarTimer?: number;
  mouthOpenValue: number;
  isHidden?: boolean;
  /** 当前是否藏在水草掩体里（每帧由 systems/concealment.ts 刷新） */
  inCover?: boolean;

  isIdle: boolean;
  lureActive: boolean;
  camoActive: boolean;
  ambushTimer: number;

  animOffset: number;
  renderScale: number;
  isInvulnerable?: boolean;
  speedBoostTimer?: number;

  happyTimer?: number;
  fearTimer?: number;
  speechBubble?: { text: string; timer: number; color: string } | null;
  evolutionVisualTimer?: number;
  cosmetics?: Cosmetics;
  level: number;

  /** 半虚状态：新生成的鱼不能吃也不能被吃（帧） */
  semiGhostTimer?: number;
  /** 中毒持续伤害（帧），由 VENOM 等技能施加 */
  poisonTimer?: number;
  /** 当前所在生态区，每帧由 systems/world.ts 更新 */
  currentBiome?: string;
  /** 大鱼反制：被偷袭后的愤怒值 */
  angerTimer?: number;
  /** 撕咬冷却（帧）：防止同一帧反复判定把对手瞬秒 */
  biteCooldown?: number;
  /** 易伤标记（帧）：被「弱点标记」等技能点名，受到的伤害翻倍 */
  vulnerableTimer?: number;
  /** 流派技能冷却（帧），仅玩家使用第二技能槽 */
  schoolSkillCooldown?: number;
  /** 无敌帧（DODGE / ROLL 等技能） */
  invulnerableTimer?: number;
  /** 护盾剩余帧（SHELL / INFLATE 等技能） */
  shieldTimer?: number;

  /**
   * 当前心境（「AI 鱼随机状态」）—— 叠在种族行为之上的个体性格。
   * 缺省 = CALM（所有倍率 1），等于「没有心境」，旧实体行为不变。
   */
  moodId?: MoodId;
  /** 心境剩余帧：到 0 重新抽一次，鱼群才会「活着」换状态 */
  moodTimer?: number;
}

export interface PlayerState extends Entity {
  weight: number;
  evolutionPoints: number;
  stats: {
    speedMult: number;
    sizeMult: number;
    defenseMult: number;
    visionRadius: number;
  };
  eatenHistory: Record<string, number>;
  boost: {
    current: number;
    max: number;
    active: boolean;
  };
  isGodMode?: boolean;
  reviveCount: number;

  shieldTimer: number;
  invulnerableTimer: number;

  currentBiome: string;
  biomeDebuffTimer: number;

  skillCooldown: number;
  skillMaxCooldown: number;
  skillLevel: number;

  /** 流派技能（第二技能槽，Q 键释放），来自生物所属流派 */
  schoolSkillId?: string;
  schoolSkillCooldown: number;

  cosmetics: Cosmetics;
  semiGhostTimer?: number;
}

/* ══════════════ 战队 ══════════════ */

/**
 * 待入队的俘虏。
 *
 * 为什么不是一个直接的实体？—— 吞噬发生在 combat 系统的碰撞遍历中间，
 * 此时往 `state.entities` 里 push 会让当前这轮 for 循环多跑新元素，
 * 既可能重复判定也容易长出无限队。所以 combat 只登记「谁被收编了」，
 * 由 squad 系统在遍历结束后统一转成实体。
 */
export interface SquadRecruit {
  type: string;
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
  level: number;
  cosmetics?: Cosmetics;
}

export interface SquadState {
  /** 本帧待入队的俘虏，squad 系统消费后清空 */
  pending: SquadRecruit[];
  /** 主动切换冷却（帧） */
  switchCooldown: number;
  /** 累计收编人数（HUD 展示用，成员阵亡不减少） */
  recruitedTotal: number;
  /** 夺舍次数（HUD 展示用） */
  possessCount: number;
}

/* ══════════════ 世界物件 ══════════════ */

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  interactionType?: 'SHRINK';
  /** 粒子形状：默认圆点，'COOKIE' 画成迷你金色小饼干 */
  shape?: 'COOKIE';
  /** 饼干的旋转角（每颗朝向随机，更像撒出来的饼干渣） */
  spin?: number;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  radius: number;
  type: 'ROCK' | 'CORAL' | 'SEAWEED';
}

export interface PowerUp {
  id: string;
  x: number;
  y: number;
  type: 'SPEED' | 'SHIELD' | 'BOTTLE' | 'SHELL' | 'COIN';
  radius: number;
}

export interface Fountain {
  id: string;
  x: number;
  y: number;
  timer: number;
  radius: number;
}

export interface Hazard {
  id: string;
  x: number;
  y: number;
  radius: number;
  type: 'METEOR_STRIKE';
  timer: number;
  duration: number;
  stage: 'WARNING' | 'STRIKE' | 'COOLDOWN';
  /** 预警倒计时（秒），小地图与 UI 显示用，由 systems/events.ts 每帧同步 */
  countdown?: number;
}

export interface Portal {
  id: string;
  x: number;
  y: number;
  radius: number;
  angle: number;
  name?: string;
  /**
   * 门的种类（「多鱼塘」阶段 2a）：
   *   LOCAL  塘内门 —— 在**本塘**的门之间随机传送（阶段 1 及以前的唯一行为）
   *   POND   塘际门 —— 通往另一个塘，触发世界重建
   * 缺省视为 LOCAL（旧存档 / 旧测试构造的门都按塘内门处理）
   */
  kind?: 'LOCAL' | 'POND';
  /** 塘际门的目的地（kind === 'POND' 时有意义） */
  targetPond?: string;
}

export interface Building {
  id: string;
  x: number;
  y: number;
  type: string;
  radius: number;
  cooldown: number;
  /**
   * 建筑的交互提示（如商场的「按 E 进入商场换装」），渲染在建筑下方。
   * 由 world 系统每帧按需写入/清除，不再写 player.speechBubble ——
   * 以前写在那个槽里跟战斗气泡互相顶掉（而且 speechBubble 的渲染在 v2 重构时丢过）。
   */
  prompt?: { text: string; color: string } | null;
}

export interface Treasure {
  id: string;
  x: number;
  y: number;
  type: 'FEAST' | 'CHEST' | 'GEM' | 'FOOD';
  status: 'WARNING' | 'ACTIVE';
  timer: number;
  radius: number;
  effect?: 'EXP' | 'GOLD' | 'SKILL' | 'SHIELD';
  rewardValue?: number;
}

export interface Label {
  x: number;
  y: number;
  text: string;
  color: string;
  /** 存活帧数。重构前 labels 只增不减，属于内存泄漏，现在统一由 progression 系统回收 */
  timer?: number;
  /** 字号（默认 28）。逆转这类高光时刻用大字（44）撑场面 */
  size?: number;
}

/* ══════════════ 事件（逻辑层 → 表现层） ══════════════ */

export interface GameEvents {
  eat: { attacker: Entity; victim: Entity; isBackAttack: boolean; x: number; y: number };
  hurt: { target: Entity; amount: number; source?: Entity };
  death: { victim: Entity; killer?: Entity };
  reversal: { x: number; y: number; score: number };
  levelup: { entity: Entity; level: number };
  evolve: { entity: Entity };
  skill: { entity: Entity; skillId: string; skillName: string };
  treasure: { x: number; y: number; label: string; color: string };
  pickup: { x: number; y: number; label: string; color: string };
  biome: { from: string; to: string };
  building: { x: number; y: number; label: string; color: string };
  /**
   * 建筑被**真正触发**（world 的建筑统一派发点发出，只发给真触发、不发提示帧）。
   * 与 `building` 分开是刻意的：`building` 承担着 toast 与音效（audio 已订阅），
   * 复用它会让一次触发播两遍音效。
   */
  buildingUse: { type: string };
  particle: { x: number; y: number; color: string; count: number };
  /** 成就解锁（achievementsSystem 发出，UI 弹 toast） */
  achievement: { id: string; name: string; desc: string; icon: string };
  /** 金币拾取（items 的 COIN 发出，成就「守财奴」统计） */
  coin: { x: number; y: number; value: number };
}

/* ══════════════ 每帧上下文 ══════════════ */

export interface FrameInput {
  space: boolean;
  mouseDown: boolean;
  rightMouseDown: boolean;
  /** Q 键：释放流派技能 */
  q: boolean;
  /** E 键：交互确认（进商场等需要主动按下，防止路过大建筑被误触发） */
  interact: boolean;
}

export interface FrameContext {
  mouse: { x: number; y: number };
  input: FrameInput;
  screen: { width: number; height: number };
  events: EventBus<GameEvents>;
  /** 固定为 1 帧，保留字段便于将来支持变速 / 暂停 */
  dt: number;
}

/* ══════════════ 游戏总状态 ══════════════ */

export interface GameState {
  status: GameStatus;
  player: PlayerState;
  entities: Entity[];
  /** 战队：成员就是 entities 里 ownerId === 'player' 的那些实体，这里只放队列与统计 */
  squad: SquadState;
  particles: Particle[];
  obstacles: Obstacle[];
  powerUps: PowerUp[];
  hazards: Hazard[];
  portals: Portal[];
  buildings: Building[];
  treasures: Treasure[];
  fountains: Fountain[];
  labels: Label[];
  /** 当前所在的鱼塘（「多鱼塘」阶段 1：开局选塘，影响刷怪/计分/开局生态区） */
  pondId: PondId;
  /**
   * 过场闪屏（「多鱼塘」阶段 2a）：塘际传送瞬间全屏染一次目标塘的颜色，
   * 由 GameCanvas 按 timer 递减绘制。null / 缺省 = 不画。
   */
  screenFlash?: { timer: number; color: string } | null;
  /**
   * 本次进化方向的候选快照（进化触发那一刻抽一次，UI 直接渲染）。
   *
   * ⚠️ 存在的意义就是「冻结」：抽取要洗牌且依赖当时的吃鱼历史，如果让 UI 每次渲染现算，
   * 100ms 一次的状态同步会让候选每秒变脸 10 次（2026-09-13 修复的 bug）。
   * 由 `systems/progression.ts` 写入，`App.tsx` 的 onEvolve 清空。缺省 / 空数组 = 未在进化中。
   */
  evolveOptions?: CreatureType[];
  worldWidth: number;
  worldHeight: number;
  camera: { x: number; y: number; zoom: number };
  score: number;
  time: number;
}
