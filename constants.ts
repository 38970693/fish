

import { CreatureConfig, CreatureType, BiomeType } from './types';

export const WORLD_SIZE = 6000; // Increased from 4000
export const MAX_ENTITIES = 180; // Reduced from 400 to ~half
export const MAX_OBSTACLES = 80; // Slightly increased for larger map
export const MAX_POWERUPS = 40; 

// New Map Shape Config
export const MAP_SHAPE_CONFIG = {
    BASE_RADIUS: 2000,
    PETAL_VARIANCE: 1200, // How much the petals extend out
    CENTER_X: WORLD_SIZE / 2,
    CENTER_Y: WORLD_SIZE / 2
};

export const GAME_MECHANICS = {
  BASE_TURN_SPEED: 0.5, // Increased from 0.20 for snappier turning
  SIZE_AGILITY_PENALTY: 0.002, // Reduced from 0.0035 to keep big fish playable
  MIN_RADIUS_TO_SURVIVE: 8, 
  MAX_RADIUS: 180, 
  MAX_SQUAD_SIZE: 10, 
  
  // Growth
  PLANKTON_MASS: 40, 
  COMBAT_BITE_MASS_FACTOR: 60, 

  // Strategy
  IDLE_THRESHOLD: 0.3, 
  LURE_RANGE_MULTIPLIER: 4.0, 
  AMBUSH_BONUS_FRAMES: 60, 
  AMBUSH_SPEED_BONUS: 2.5,
  AMBUSH_DAMAGE_MULT: 2.0,
  AMBUSH_DISTANCE: 400, 
  AGGRO_SIZE_THRESHOLD: 2.5, 

  SPEED_ITEM_DURATION: 300, 
  SPEED_ITEM_MULTIPLIER: 1.5,
  
  // New Items
  SHIELD_DURATION: 600, 
  TORPEDO_DAMAGE: 150,
  TORPEDO_SPEED: 10, 
  TORPEDO_COOLDOWN: 60
};

// Treasure Event Config
export const TREASURE_CONFIG = {
    SPAWN_INTERVAL: 3600, // 60 seconds (at 60fps)
    WARNING_DURATION: 180, // 3 seconds
    RADIUS: 60,
    DETECTION_RANGE: 2500, // Range at which fish swarm to it
    MASS_REWARD: 500, // Huge chunk of mass
    BUFF_DURATION: 1200 // 20 seconds of super buff
};

// Biome Definitions
export const BIOME_CONFIGS = {
  [BiomeType.SHALLOWS]: {
    name: "阳光浅滩",
    color: "#0ea5e9", // Sky Blue
    description: "安全区域。小型鱼速度+20%。",
    // Biomes are now quadrants but effectively lobes of the flower
    xRange: [0, WORLD_SIZE / 2],
    yRange: [0, WORLD_SIZE / 2]
  },
  [BiomeType.REEF]: {
    name: "五彩珊瑚",
    color: "#2dd4bf", // Teal
    description: "地形复杂。伪装/伏击技能冷却减半。巨型鱼转向变慢。",
    xRange: [WORLD_SIZE / 2, WORLD_SIZE],
    yRange: [0, WORLD_SIZE / 2]
  },
  [BiomeType.SWAMP]: {
    name: "剧毒沼泽",
    color: "#3f6212", // Dark Green
    description: "持续腐蚀伤害！抗毒生物回血翻倍。",
    xRange: [0, WORLD_SIZE / 2],
    yRange: [WORLD_SIZE / 2, WORLD_SIZE]
  },
  [BiomeType.ABYSS]: {
    name: "深渊海沟",
    color: "#0f172a", // Dark Blue/Black
    description: "视野受限。发光/感知型生物攻击+20%。",
    xRange: [WORLD_SIZE / 2, WORLD_SIZE],
    yRange: [WORLD_SIZE / 2, WORLD_SIZE]
  }
};

export const BUILDING_CONFIGS = {
  HOSPITAL: { radius: 150, cooldown: 300, color: '#ef4444', name: "深海急救站" },
  ARMORY: { radius: 150, cooldown: 600, color: '#f59e0b', name: "军火库" },
  SHRINE: { radius: 150, cooldown: 900, color: '#8b5cf6', name: "龙王庙" },
  SHOP: { radius: 200, cooldown: 600, color: '#ec4899', name: "深海商场" } // Cooldown increased to 600 (10s)
};

// Protection Config
export const PROTECTION_CONFIG = {
  NEWBIE_DURATION: 480, 
  REVIVE_DURATION: 300  
};

// Meteor Hazard Config
export const METEOR_CONFIG = {
  INTERVAL: 1500, 
  WARNING_TIME: 120, 
  STRIKE_TIME: 20, 
  RADIUS: 350, 
  SAFE_SIZE: 1000, 
  WAVE_COUNT: 5, 
  SPLASH_COUNT: 24, 
  SPLASH_SHRINK: 0.95 
};

// Portal Config (Permanent now)
export const PORTAL_CONFIG = {
  RADIUS: 80,
  COLORS: ['#d8b4fe', '#22d3ee', '#f0abfc'],
  MAX_COUNT: 6,
  SPAWN_CHANCE: 0.002
};

export const BOOST_CONFIG = {
  MAX_ENERGY: 100,
  DRAIN_RATE: 0.5, 
  REGEN_RATE: 0.3, 
  SPEED_MULTIPLIER: 2.2,
  OVERDRIVE_WEIGHT_COST: 0.05, 
  OVERDRIVE_MIN_WEIGHT: 5 
};

export const SKINNY_PHRASES = ["太小!", "太细!", "太短!", "塞牙缝都不够!", "营养不良?", "没肉!", "太瘦了!"];
export const REVERSAL_PHRASE = "逆转!"; 

const BASE_SWIM_SPEED = 1.5; 

export const CREATURES: Record<CreatureType, CreatureConfig> = {
  // ... (keep existing creatures)
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
    tier: 0,
    nativeBiome: BiomeType.SHALLOWS
  },

  // --- TIER 1 ---
  [CreatureType.CLOWN_FISH]: {
    type: CreatureType.CLOWN_FISH,
    name: "小丑鱼",
    baseRadius: 15,
    color: "#fb923c", 
    speed: BASE_SWIM_SPEED * 1.1, 
    health: 30,
    damage: 2,
    weightValue: 5, 
    behavior: 'FLEE',
    tier: 1,
    description: "浅滩特产。在阳光区域非常灵活。",
    nativeBiome: BiomeType.SHALLOWS
  },
  [CreatureType.BLUE_TANG]: {
    type: CreatureType.BLUE_TANG,
    name: "蓝唐王鱼",
    baseRadius: 14,
    color: "#2563eb", 
    speed: BASE_SWIM_SPEED * 1.3, 
    health: 20,
    damage: 1,
    weightValue: 5, 
    behavior: 'FLEE',
    tier: 1,
    description: "速度型。游得非常快，容易躲避危险。",
    nativeBiome: BiomeType.SHALLOWS
  },
  [CreatureType.TURTLE]: {
    type: CreatureType.TURTLE,
    name: "绿海龟",
    baseRadius: 18,
    color: "#166534", 
    speed: BASE_SWIM_SPEED * 0.9, 
    health: 60,
    damage: 3,
    weightValue: 8, 
    behavior: 'PASSIVE',
    special: 'SHELL',
    tier: 1,
    description: "防御型。适应沼泽环境，抗毒回血。",
    nativeBiome: BiomeType.SWAMP
  },
  [CreatureType.JELLYFISH]: {
    type: CreatureType.JELLYFISH,
    name: "水母",
    baseRadius: 20,
    color: "#d946ef", 
    speed: BASE_SWIM_SPEED * 0.8, 
    health: 30,
    damage: 5,
    weightValue: 6, 
    behavior: 'PASSIVE',
    special: 'SHOCK',
    tier: 1,
    nativeBiome: BiomeType.ABYSS
  },

  // --- TIER 2 ---
  [CreatureType.SEAHORSE]: {
    type: CreatureType.SEAHORSE,
    name: "海马",
    baseRadius: 22,
    color: "#fde047", 
    speed: BASE_SWIM_SPEED * 1.2, 
    health: 40,
    damage: 4,
    weightValue: 15, 
    behavior: 'FLEE',
    tier: 2,
    nativeBiome: BiomeType.REEF
  },
  [CreatureType.CRAB]: {
    type: CreatureType.CRAB,
    name: "帝王蟹",
    baseRadius: 25,
    color: "#b91c1c", 
    speed: BASE_SWIM_SPEED * 1.0, 
    health: 80,
    damage: 8,
    weightValue: 20, 
    behavior: 'AGGRESSIVE',
    special: 'SPIKE',
    tier: 2,
    nativeBiome: BiomeType.REEF
  },
  [CreatureType.PUFFER_FISH]: {
    type: CreatureType.PUFFER_FISH,
    name: "河豚",
    baseRadius: 24,
    color: "#84cc16", 
    speed: BASE_SWIM_SPEED * 1.0, 
    health: 50,
    damage: 10,
    weightValue: 18, 
    behavior: 'PASSIVE',
    special: 'POISON',
    tier: 2,
    nativeBiome: BiomeType.SWAMP
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
    tier: 2,
    nativeBiome: BiomeType.REEF
  },
  [CreatureType.ELECTRIC_EEL]: {
    type: CreatureType.ELECTRIC_EEL,
    name: "电鳗",
    baseRadius: 30,
    color: "#ca8a04", 
    speed: BASE_SWIM_SPEED * 1.25, 
    health: 70,
    damage: 15,
    weightValue: 35, 
    behavior: 'AGGRESSIVE',
    special: 'SHOCK',
    tier: 2,
    nativeBiome: BiomeType.SWAMP
  },

  // --- TIER 3 ---
  [CreatureType.STINGRAY]: {
    type: CreatureType.STINGRAY,
    name: "魔鬼鱼",
    baseRadius: 40,
    color: "#475569", 
    speed: BASE_SWIM_SPEED * 1.1, 
    health: 120,
    damage: 12,
    weightValue: 50, 
    behavior: 'PASSIVE',
    tier: 3,
    nativeBiome: BiomeType.SWAMP
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
    tier: 3,
    nativeBiome: BiomeType.SHALLOWS
  },
  [CreatureType.ANGLER_FISH]: {
    type: CreatureType.ANGLER_FISH,
    name: "深海鮟鱇",
    baseRadius: 45,
    color: "#3f3f46", 
    speed: BASE_SWIM_SPEED * 0.9, 
    health: 150,
    damage: 18,
    weightValue: 60, 
    behavior: 'AMBUSH',
    special: 'LURE',
    tier: 3,
    nativeBiome: BiomeType.ABYSS
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
    tier: 3,
    nativeBiome: BiomeType.ABYSS
  },
  [CreatureType.AROWANA]: {
    type: CreatureType.AROWANA,
    name: "金龙鱼",
    baseRadius: 42,
    color: "#f59e0b", 
    speed: BASE_SWIM_SPEED * 1.2, 
    health: 130,
    damage: 16,
    weightValue: 65, 
    behavior: 'AGGRESSIVE',
    tier: 3,
    nativeBiome: BiomeType.SHALLOWS
  },
  [CreatureType.FUR_SEAL]: {
    type: CreatureType.FUR_SEAL,
    name: "海狗",
    baseRadius: 46,
    color: "#3f2c22", 
    speed: BASE_SWIM_SPEED * 1.15, 
    health: 140,
    damage: 14,
    weightValue: 60, 
    behavior: 'FLEE', 
    tier: 3,
    nativeBiome: BiomeType.REEF
  },

  // --- TIER 4 ---
  [CreatureType.GREAT_WHITE]: {
    type: CreatureType.GREAT_WHITE,
    name: "大白鲨",
    baseRadius: 80,
    color: "#e5e7eb", 
    speed: BASE_SWIM_SPEED * 1.1, 
    health: 400,
    damage: 40,
    weightValue: 200, 
    behavior: 'AGGRESSIVE',
    tier: 4,
    nativeBiome: BiomeType.SHALLOWS
  },
  [CreatureType.ORCA]: {
    type: CreatureType.ORCA,
    name: "虎鲸",
    baseRadius: 100,
    color: "#020617", 
    speed: BASE_SWIM_SPEED * 1.15, 
    health: 600,
    damage: 50,
    weightValue: 300, 
    behavior: 'BOSS',
    tier: 4,
    nativeBiome: BiomeType.ABYSS
  },
  [CreatureType.NARWHAL]: {
    type: CreatureType.NARWHAL,
    name: "独角鲸",
    baseRadius: 90,
    color: "#64748b", 
    speed: BASE_SWIM_SPEED * 1.1, 
    health: 500,
    damage: 60, 
    weightValue: 250, 
    behavior: 'AGGRESSIVE',
    special: 'SPIKE',
    tier: 4,
    nativeBiome: BiomeType.REEF
  },
  [CreatureType.MERMAID]: {
    type: CreatureType.MERMAID,
    name: "美人鱼",
    baseRadius: 75,
    color: "#22d3ee", 
    speed: BASE_SWIM_SPEED * 1.25, 
    health: 350,
    damage: 30,
    weightValue: 500, 
    behavior: 'BOSS',
    tier: 4,
    nativeBiome: BiomeType.REEF
  },
  [CreatureType.KRAKEN]: {
    type: CreatureType.KRAKEN,
    name: "深海巨怪",
    baseRadius: 180,
    color: "#7f1d1d", 
    speed: BASE_SWIM_SPEED * 0.9, 
    health: 2000,
    damage: 80,
    weightValue: 1000, 
    behavior: 'BOSS',
    tier: 4,
    nativeBiome: BiomeType.ABYSS
  },
  [CreatureType.MASCOT]: {
    type: CreatureType.MASCOT,
    name: "新春吉祥物",
    baseRadius: 40,
    color: "#f59e0b",
    speed: 1.0,
    health: 9999,
    damage: 0,
    weightValue: 0,
    behavior: 'MASCOT',
    tier: 0,
    description: "庆祝新年的吉祥物！",
    nativeBiome: BiomeType.SHALLOWS
  }
};

export const INITIAL_PLAYER_STATS = {
  radius: 15, 
  speed: BASE_SWIM_SPEED, 
  health: 100,
  maxHealth: 100
};

export const EVOLUTION_THRESHOLDS = [
  { radius: 30, tier: 2 },
  { radius: 60, tier: 3 },
  { radius: 100, tier: 4 }
];
