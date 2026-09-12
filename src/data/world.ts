/**
 * 世界与机制的数值配置 —— 纯数据，零依赖。
 *
 * 调游戏手感只需要改这里，不用碰任何逻辑代码。
 * ⚠️ 时间单位统一为「帧」，游戏按 60fps 运行：60 帧 = 1 秒。
 */

export const WORLD_SIZE = 6000;
export const MAX_ENTITIES = 180;
export const MAX_OBSTACLES = 80;
export const MAX_POWERUPS = 40;

/** 花瓣形地图：基础半径 + 沿角度的花瓣外扩量 */
export const MAP_SHAPE_CONFIG = {
  BASE_RADIUS: 2000,
  PETAL_VARIANCE: 1200,
  CENTER_X: WORLD_SIZE / 2,
  CENTER_Y: WORLD_SIZE / 2,
};

export const GAME_MECHANICS = {
  BASE_TURN_SPEED: 0.5,
  SIZE_AGILITY_PENALTY: 0.002,

  AMBUSH_BONUS_FRAMES: 60,
  AMBUSH_SPEED_BONUS: 2.5,
  AMBUSH_DAMAGE_MULT: 2.0,
  AMBUSH_DISTANCE: 400,

  SPEED_ITEM_DURATION: 300,
  SPEED_ITEM_MULTIPLIER: 1.5,

  SHIELD_DURATION: 600,
  TORPEDO_DAMAGE: 150,
  TORPEDO_SPEED: 10,
  TORPEDO_COOLDOWN: 60,
};

/** 加速（空格键）能量条 */
export const BOOST_CONFIG = {
  MAX_ENERGY: 100,
  DRAIN_RATE: 0.5,
  REGEN_RATE: 0.3,
  SPEED_MULTIPLIER: 2.2,
};

/** 新手保护 / 复活保护 */
export const PROTECTION_CONFIG = {
  NEWBIE_DURATION: 480,
  REVIVE_DURATION: 300,
};

/**
 * 战队系统（提示词 #70 / #234 / #245 / #254 / #294）
 *
 * 规则来源：
 *   #70  被玩家吃掉的鱼加入战队（而不是消失）
 *   #234 主动切换：灵魂附身到小弟身上，原来的身体变成小弟
 *   #245 亡语：本体死亡时夺舍「半径最大」的成员，而不是随机
 *   #254 自己人不打自己人
 *   #294 没有成员可夺舍时才干净切到结算
 */
export const SQUAD_CONFIG = {
  /** 战队人数上限。滚雪球的主要刹车 */
  MAX_SIZE: 10,
  /** 入队后跟随玩家的理想距离（成员半径 + 玩家半径 + 这个值） */
  FOLLOW_GAP: 90,
  /** 落后多远才开始追（避免抖动） */
  FOLLOW_DEADZONE: 260,
  /** 队形：第 n 个成员围绕玩家的角度间隔（度） */
  FORMATION_ANGLE_STEP: 36,
  /** 主动切换冷却（帧），防连点 */
  SWITCH_COOLDOWN: 30,
  /** 夺舍后的保护帧数，防止落地即被守尸 */
  POSSESS_PROTECTION: 300,
  /** 入队后不能完全免疫，给个短半虚保护，避免刚入队就被旁边的鱼秒了 */
  RECRUIT_GHOST: 60,
  /** 不收编的食物：浮游生物属于饲料，进战队没意义 */
  RECRUIT_MIN_TIER: 1,
};

/** 陨石危险事件 */
export const METEOR_CONFIG = {
  INTERVAL: 1500,
  WARNING_TIME: 120,
  STRIKE_TIME: 20,
  RADIUS: 350,
  SAFE_SIZE: 1000,
  WAVE_COUNT: 5,
  SPLASH_COUNT: 24,
  SPLASH_SHRINK: 0.95,
};

/** 传送门 */
export const PORTAL_CONFIG = {
  RADIUS: 80,
  COLORS: ['#d8b4fe', '#22d3ee', '#f0abfc'],
  MAX_COUNT: 6,
};

/**
 * 宝藏事件
 * ⚠️ 修复说明：原实现把「预告时长」和「存活时长」混在一个 timer 里算，
 * 导致预告实际 6 秒（应为 3 秒）、激活后只活 7 秒（应为 10 秒）。
 * 现在拆成两个明确字段，systems/events.ts 按语义使用。
 */
export const TREASURE_CONFIG = {
  SPAWN_INTERVAL: 3600,
  /** 提前多久开始预告（帧）——3 秒 */
  WARNING_DURATION: 180,
  /** 激活后可拾取多久（帧）——10 秒 */
  ACTIVE_DURATION: 600,
  RADIUS: 60,
  DETECTION_RANGE: 2500,
  MASS_REWARD: 500,
  BUFF_DURATION: 1200,

  FEAST_REWARD: 800,
  CHEST_GOLD: 100,
  FOOD_HEAL: 50,

  /** AI 鱼奔向宝贝 */
  SWARM_SPEED_BOOST: 2.0,
  SWARM_DETECTION_RANGE: 3000,

  /** 新生成实体的「半虚」保护期：不能吃也不能被吃 */
  SEMI_GHOST_DURATION: 180,
};

export const TREASURE_COLORS = {
  FEAST: '#f97316',
  CHEST: '#eab308',
  GEM: '#a855f7',
  FOOD: '#22c55e',
  DEFAULT: '#fcd34d',
};

/** 建筑配置（生成规则见 data/buildings.ts） */
export const BUILDING_CONFIGS = {
  HOSPITAL: { radius: 150, cooldown: 300, color: '#ef4444', name: '深海急救站' },
  SHRINE: { radius: 150, cooldown: 900, color: '#8b5cf6', name: '龙王庙' },
  SHOP: { radius: 200, cooldown: 600, color: '#ec4899', name: '深海商场' },
  // ── 塘特产建筑（阶段 3a，与 data/buildings.ts 的 BUILDING_DATA 保持一致）──
  WISHING_WELL: { radius: 130, cooldown: 1200, color: '#f59e0b', name: '许愿池' },
  PEARL_FARM: { radius: 140, cooldown: 900, color: '#cbd5e1', name: '珍珠养殖场' },
  SHIPWRECK: { radius: 170, cooldown: 1500, color: '#92400e', name: '沉船残骸' },
};

/** 偷袭 / 吞噬判定 */
export const AMBUSH_CONFIG = {
  DETECTION_RANGE_MIN: 250,
  DETECTION_RANGE_MAX: 450,
  /** 判定为「背后」的角度阈值（约 120°） */
  BACK_ANGLE_THRESHOLD: Math.PI * 0.67,
  BACK_DAMAGE_MULT: 2.0,
  INDICATOR_RANGE: 500,

  EAT_PROBABILITY: {
    DOUBLE_OR_MORE: 0.8,
    ONE_HALF_OR_MORE: 0.3,
    ONE_FIFTH_OR_MORE: 0.1,
    SIMILAR: 0.05,
  },

  REVERSAL_SIZE_THRESHOLD: 0.5,
};

/**
 * 战斗配置（P1）
 *
 * 重构前：一次概率判定命中就直接 health = 0，血条形同虚设。
 * 重构后：咬中 → 扣血 → 残血才能吞。想改战斗手感只动这里。
 */
export const COMBAT_CONFIG = {
  /** 撕咬伤害倍率（基于攻击者的 damage） */
  BITE_DAMAGE_MULT: 1.5,
  /** 撕咬间隔（帧），防止每帧判定把对手瞬秒 */
  BITE_COOLDOWN: 18,
  /** 目标血量低于此比例时才能被吞噬 */
  DEVOUR_HP_RATIO: 0.3,
  /** 吞噬所需的最小体型比：小于 1 意味着小鱼吞不掉大鱼 */
  DEVOUR_MIN_SIZE_RATIO: 1.0,
  /** 体型差对撕咬伤害的影响，clamp 在这个区间 */
  SIZE_FACTOR_MIN: 0.5,
  SIZE_FACTOR_MAX: 2.0,
  /** 背后撕咬的额外伤害倍率 */
  BACK_BITE_BONUS: 0.5,
  /** 背刺但没咬中吞噬时，按最大生命的比例造成伤害 */
  BACK_STAB_HP_RATIO: 0.3,

  /** 被咬后进入愤怒状态的时长（帧） */
  ANGER_DURATION: 180,
  /** 愤怒时转向速度倍率（大鱼也能灵活回身） */
  ANGER_AGILITY_MULT: 2.5,
  /** 猛回头反击伤害倍率（基于被咬者的 damage） */
  COUNTER_DAMAGE_MULT: 1.5,
  /** 每次被咬体型缩减系数 */
  SHRINK_ON_BITE: 0.995,
  /** 体型缩小的下限 */
  MIN_RADIUS: 5,

  /** 易伤标记生效时受到的伤害倍率（弱点标记 / 血腥嗅觉） */
  VULNERABLE_DAMAGE_MULT: 2.0,
  /** 护盾吸收伤害的比例（剩下的照常扣血） */
  SHIELD_ABSORB_RATIO: 0.7,
};

/** 进化所需累计体重 */
export const EVOLUTION_THRESHOLDS = [
  { weight: 30, tier: 2 },
  { weight: 100, tier: 3 },
  { weight: 300, tier: 4 },
];

/** 生物基准游速：data/creatures.ts 里的 speed 是这个值的倍率 */
export const BASE_SWIM_SPEED = 1.5;

/** 台词库 */
export const PHRASES = {
  EAT: ['捕获!', '进框!', '收!', '拿来吧你!', '喜加一!'],
  HURT: ['疼!', '哎哟!', '别吃我!', '救命!', '好痛!', '卡喉咙了!'],
  SQUAD: ['老大!', '跟你混了!', '誓死效忠!', '冲啊!', '战队+1'],
  PANIC: ['巨物恐惧!', '快逃!', '太大了!', '看不见我...', '妈耶!'],
  AMBUSH: ['偷袭!', '背刺!', '千年杀!', '不讲武德!'],
  ANGRY: ['别跑!', '站住!', '你瞅啥?', '吼!!', '小别致!'],
  SKINNY: ['太小!', '太细!', '太短!', '塞牙缝都不够!', '营养不良?', '没肉!', '太瘦了!'],
};

export const REVERSAL_PHRASE = '逆转!';

export const INITIAL_PLAYER_STATS = {
  radius: 15,
  speed: BASE_SWIM_SPEED,
  health: 100,
  maxHealth: 100,
};
