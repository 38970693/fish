import { CreatureConfig, CreatureType } from './types';

export const WORLD_SIZE = 4000;
export const MAX_ENTITIES = 300; 
export const MAX_OBSTACLES = 40;
export const MAX_POWERUPS = 15;

export const GAME_MECHANICS = {
  BASE_TURN_SPEED: 0.15, 
  SIZE_AGILITY_PENALTY: 0.002, 
  MIN_RADIUS_TO_SURVIVE: 8, 
  MAX_RADIUS: 500, 
  
  // Growth
  PLANKTON_MASS: 40, 
  COMBAT_BITE_MASS_FACTOR: 60, 

  // Strategy
  IDLE_THRESHOLD: 0.3, 
  LURE_RANGE_MULTIPLIER: 4.0, 
  AMBUSH_BONUS_FRAMES: 60, 
  AMBUSH_SPEED_BONUS: 2.5,
  AMBUSH_DAMAGE_MULT: 2.0,

  SPEED_ITEM_DURATION: 300, 
  SPEED_ITEM_MULTIPLIER: 1.5
};

// Meteor Hazard Config
export const METEOR_CONFIG = {
  INTERVAL: 1500, // Every 25 seconds
  WARNING_TIME: 120, // 2 seconds warning
  STRIKE_TIME: 20, // Quick impact
  RADIUS: 500, // DOUBLED: Was 250. Massive danger zone.
  SAFE_SIZE: 1000, 
  WAVE_COUNT: 5, // Simultaneous meteors
  SPLASH_COUNT: 24, // Number of water splashes
  SPLASH_SHRINK: 0.95 // Shrink to 95% of current size upon hit
};

export const BOOST_CONFIG = {
  MAX_ENERGY: 100,
  DRAIN_RATE: 0.5, 
  REGEN_RATE: 0.3, 
  SPEED_MULTIPLIER: 1.8 
};

const BASE_SWIM_SPEED = 2.0;

export const CREATURES: Record<CreatureType, CreatureConfig> = {
  // --- TIER 0 ---
  [CreatureType.PLANKTON]: {
    type: CreatureType.PLANKTON,
    name: "磷虾",
    baseRadius: 6,
    color: "#86efac", 
    speed: 0.5, 
    health: 1,
    damage: 0,
    weightValue: 0.1, 
    behavior: 'PASSIVE',
    tier: 0 
  },

  // --- TIER 1 (Starters) ---
  [CreatureType.CLOWN_FISH]: {
    type: CreatureType.CLOWN_FISH,
    name: "小丑鱼",
    baseRadius: 15,
    color: "#fb923c", // Orange
    speed: BASE_SWIM_SPEED, 
    health: 30,
    damage: 2,
    weightValue: 5, 
    behavior: 'FLEE',
    tier: 1,
    description: "均衡型。灵活且各项属性平均，适合新手。"
  },
  [CreatureType.BLUE_TANG]: {
    type: CreatureType.BLUE_TANG,
    name: "蓝唐王鱼",
    baseRadius: 14,
    color: "#2563eb", // Royal Blue
    speed: BASE_SWIM_SPEED * 1.3, 
    health: 20,
    damage: 1,
    weightValue: 5, 
    behavior: 'FLEE',
    tier: 1,
    description: "速度型。游得非常快，容易躲避危险，但血量较低。"
  },
  [CreatureType.TURTLE]: {
    type: CreatureType.TURTLE,
    name: "绿海龟",
    baseRadius: 18,
    color: "#166534", // Green
    speed: BASE_SWIM_SPEED * 0.8, 
    health: 60,
    damage: 3,
    weightValue: 8, 
    behavior: 'PASSIVE',
    special: 'SHELL',
    tier: 1,
    description: "防御型。游得慢，但拥有坚硬的甲壳和高血量。"
  },
  [CreatureType.JELLYFISH]: {
    type: CreatureType.JELLYFISH,
    name: "水母",
    baseRadius: 20,
    color: "#d946ef", 
    speed: BASE_SWIM_SPEED * 0.7, 
    health: 30,
    damage: 5,
    weightValue: 6, 
    behavior: 'PASSIVE',
    special: 'SHOCK',
    tier: 1
  },

  // --- TIER 2 ---
  [CreatureType.SEAHORSE]: {
    type: CreatureType.SEAHORSE,
    name: "海马",
    baseRadius: 22,
    color: "#fde047", 
    speed: BASE_SWIM_SPEED * 1.1, 
    health: 40,
    damage: 4,
    weightValue: 15, 
    behavior: 'FLEE',
    tier: 2
  },
  [CreatureType.CRAB]: {
    type: CreatureType.CRAB,
    name: "帝王蟹",
    baseRadius: 25,
    color: "#b91c1c", 
    speed: BASE_SWIM_SPEED * 0.9, 
    health: 80,
    damage: 8,
    weightValue: 20, 
    behavior: 'AGGRESSIVE',
    special: 'SPIKE',
    tier: 2
  },
  [CreatureType.PUFFER_FISH]: {
    type: CreatureType.PUFFER_FISH,
    name: "河豚",
    baseRadius: 24,
    color: "#84cc16", 
    speed: BASE_SWIM_SPEED, 
    health: 50,
    damage: 10,
    weightValue: 18, 
    behavior: 'PASSIVE',
    special: 'POISON',
    tier: 2
  },
  [CreatureType.SQUID]: {
    type: CreatureType.SQUID,
    name: "乌贼",
    baseRadius: 26,
    color: "#a855f7", 
    speed: BASE_SWIM_SPEED * 1.2, 
    health: 60,
    damage: 6,
    weightValue: 25, 
    behavior: 'AMBUSH',
    special: 'CAMO',
    tier: 2
  },
  [CreatureType.ELECTRIC_EEL]: {
    type: CreatureType.ELECTRIC_EEL,
    name: "电鳗",
    baseRadius: 30,
    color: "#ca8a04", // Dark Yellow/Gold
    speed: BASE_SWIM_SPEED * 1.3, 
    health: 70,
    damage: 15,
    weightValue: 35, 
    behavior: 'AGGRESSIVE',
    special: 'SHOCK',
    tier: 2
  },

  // --- TIER 3 ---
  [CreatureType.STINGRAY]: {
    type: CreatureType.STINGRAY,
    name: "魔鬼鱼",
    baseRadius: 40,
    color: "#475569", 
    speed: BASE_SWIM_SPEED * 1.4, 
    health: 120,
    damage: 12,
    weightValue: 50, 
    behavior: 'PASSIVE',
    tier: 3
  },
  [CreatureType.SWORD_FISH]: {
    type: CreatureType.SWORD_FISH,
    name: "剑鱼",
    baseRadius: 38,
    color: "#3b82f6", 
    speed: BASE_SWIM_SPEED * 1.3, 
    health: 100,
    damage: 15,
    weightValue: 55, 
    behavior: 'AGGRESSIVE',
    tier: 3
  },
  [CreatureType.ANGLER_FISH]: {
    type: CreatureType.ANGLER_FISH,
    name: "深海鮟鱇",
    baseRadius: 45,
    color: "#3f3f46", 
    speed: BASE_SWIM_SPEED * 0.8, 
    health: 150,
    damage: 18,
    weightValue: 60, 
    behavior: 'AMBUSH',
    special: 'LURE',
    tier: 3
  },
  [CreatureType.HAMMERHEAD]: {
    type: CreatureType.HAMMERHEAD,
    name: "双髻鲨",
    baseRadius: 50,
    color: "#9ca3af", 
    speed: BASE_SWIM_SPEED * 1.1, 
    health: 180,
    damage: 20,
    weightValue: 70, 
    behavior: 'AGGRESSIVE',
    tier: 3
  },
  [CreatureType.AROWANA]: {
    type: CreatureType.AROWANA,
    name: "金龙鱼",
    baseRadius: 42,
    color: "#f59e0b", // Gold/Amber
    speed: BASE_SWIM_SPEED * 1.4, 
    health: 130,
    damage: 16,
    weightValue: 65, 
    behavior: 'AGGRESSIVE',
    tier: 3
  },
  [CreatureType.FUR_SEAL]: {
    type: CreatureType.FUR_SEAL,
    name: "海狗",
    baseRadius: 46,
    color: "#3f2c22", // Dark Brown
    speed: BASE_SWIM_SPEED * 1.5, // Very fast
    health: 140,
    damage: 14,
    weightValue: 60, 
    behavior: 'FLEE', // Smart hit and run
    tier: 3
  },

  // --- TIER 4 ---
  [CreatureType.GREAT_WHITE]: {
    type: CreatureType.GREAT_WHITE,
    name: "大白鲨",
    baseRadius: 80,
    color: "#e5e7eb", // White/Grey
    speed: BASE_SWIM_SPEED * 1.1, 
    health: 400,
    damage: 40,
    weightValue: 200, 
    behavior: 'AGGRESSIVE',
    tier: 4
  },
  [CreatureType.ORCA]: {
    type: CreatureType.ORCA,
    name: "虎鲸",
    baseRadius: 100,
    color: "#020617", // Black and White
    speed: BASE_SWIM_SPEED * 1.2, 
    health: 600,
    damage: 50,
    weightValue: 300, 
    behavior: 'BOSS',
    tier: 4
  },
  [CreatureType.NARWHAL]: {
    type: CreatureType.NARWHAL,
    name: "独角鲸",
    baseRadius: 90,
    color: "#64748b", // Slate
    speed: BASE_SWIM_SPEED * 1.25, 
    health: 500,
    damage: 60, // High damage spike
    weightValue: 250, 
    behavior: 'AGGRESSIVE',
    special: 'SPIKE',
    tier: 4
  },
  [CreatureType.MERMAID]: {
    type: CreatureType.MERMAID,
    name: "美人鱼",
    baseRadius: 75,
    color: "#22d3ee", // Cyan tail
    speed: BASE_SWIM_SPEED * 1.6, // Super fast
    health: 350,
    damage: 30,
    weightValue: 500, // Rare prize
    behavior: 'BOSS',
    tier: 4
  },
  [CreatureType.KRAKEN]: {
    type: CreatureType.KRAKEN,
    name: "深海巨怪",
    baseRadius: 180,
    color: "#7f1d1d", 
    speed: BASE_SWIM_SPEED * 0.7, 
    health: 2000,
    damage: 80,
    weightValue: 1000, 
    behavior: 'BOSS',
    tier: 4
  }
};

export const INITIAL_PLAYER_STATS = {
  radius: 15, 
  speed: BASE_SWIM_SPEED, 
  health: 100,
  maxHealth: 100
};

// Map Radius to "Weight Tier" for evolution logic
export const EVOLUTION_THRESHOLDS = [
  { radius: 30, tier: 2 },
  { radius: 60, tier: 3 },
  { radius: 100, tier: 4 }
];