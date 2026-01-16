
import { CreatureConfig, CreatureType } from './types';

export const WORLD_SIZE = 4000;
export const MAX_ENTITIES = 300; 
export const MAX_OBSTACLES = 30;
export const MAX_POWERUPS = 15;

export const GAME_MECHANICS = {
  BASE_TURN_SPEED: 0.15, 
  SIZE_AGILITY_PENALTY: 0.002, 
  MIN_RADIUS_TO_SURVIVE: 8, 
  MAX_RADIUS: 400, 
  
  // Growth
  PLANKTON_MASS: 50, 
  COMBAT_BITE_MASS_FACTOR: 60, 

  // Strategy
  IDLE_THRESHOLD: 0.3, // Speed below this counts as idle
  LURE_RANGE_MULTIPLIER: 4.0, // Radius * 4 = Lure Range
  AMBUSH_BONUS_FRAMES: 60, // 1 second of boost after breaking stealth
  AMBUSH_SPEED_BONUS: 2.5,
  AMBUSH_DAMAGE_MULT: 2.0,

  SPEED_ITEM_DURATION: 300, 
  SPEED_ITEM_MULTIPLIER: 1.5
};

export const BIRD_CONFIG = {
  INTERVAL: 3600, 
  WARNING_TIME: 120, 
  STRIKE_TIME: 30, 
  RADIUS: 120, 
  SAFE_SIZE: 50, 
  WAVE_COUNT: 5 
};

export const BOOST_CONFIG = {
  MAX_ENERGY: 100,
  DRAIN_RATE: 0.5, 
  REGEN_RATE: 0.3, 
  SPEED_MULTIPLIER: 1.8 
};

const BASE_SWIM_SPEED = 2.0;

export const CREATURES: Record<CreatureType, CreatureConfig> = {
  [CreatureType.PLANKTON]: {
    type: CreatureType.PLANKTON,
    name: "Plankton",
    baseRadius: 6,
    color: "#86efac", 
    speed: 0.5, 
    health: 1,
    damage: 0,
    xpValue: 10, 
    behavior: 'PASSIVE',
    tier: 0 
  },
  [CreatureType.ALGAE_FISH]: {
    type: CreatureType.ALGAE_FISH,
    name: "Algae Fish",
    baseRadius: 14,
    color: "#06b6d4", 
    speed: BASE_SWIM_SPEED, 
    health: 20,
    damage: 1,
    xpValue: 100, 
    behavior: 'FLEE',
    tier: 1
  },
  [CreatureType.JELLYFISH]: {
    type: CreatureType.JELLYFISH,
    name: "Jellyfish",
    baseRadius: 20,
    color: "#d946ef", 
    speed: BASE_SWIM_SPEED * 0.8, 
    health: 30,
    damage: 2,
    xpValue: 150, 
    behavior: 'PASSIVE',
    special: 'SHOCK',
    tier: 1
  },
  [CreatureType.NEEDLE_FISH]: {
    type: CreatureType.NEEDLE_FISH,
    name: "Needle Fish",
    baseRadius: 16,
    color: "#eab308", 
    speed: BASE_SWIM_SPEED * 1.3, 
    health: 25,
    damage: 3,
    xpValue: 250, 
    behavior: 'AGGRESSIVE',
    tier: 2
  },
  [CreatureType.OCTOPUS]: {
    type: CreatureType.OCTOPUS,
    name: "Mimic Octopus",
    baseRadius: 25,
    color: "#a855f7", 
    speed: BASE_SWIM_SPEED * 0.9, 
    health: 60,
    damage: 4,
    xpValue: 350, 
    behavior: 'AMBUSH',
    special: 'CAMO',
    tier: 2
  },
  [CreatureType.POISON_FISH]: {
    type: CreatureType.POISON_FISH,
    name: "Poison Puffer",
    baseRadius: 22,
    color: "#84cc16", 
    speed: BASE_SWIM_SPEED, 
    health: 40,
    damage: 2,
    xpValue: 300, 
    behavior: 'FLEE',
    special: 'POISON',
    tier: 2
  },
  [CreatureType.ANGLER_FISH]: {
    type: CreatureType.ANGLER_FISH,
    name: "Angler Fish",
    baseRadius: 45,
    color: "#3f3f46", // Dark grey
    speed: BASE_SWIM_SPEED * 0.8, 
    health: 120,
    damage: 8,
    xpValue: 600, 
    behavior: 'AMBUSH',
    special: 'LURE',
    tier: 3
  },
  [CreatureType.SWORD_FISH]: {
    type: CreatureType.SWORD_FISH,
    name: "Sword Fish",
    baseRadius: 38,
    color: "#3b82f6", 
    speed: BASE_SWIM_SPEED * 1.15, 
    health: 80,
    damage: 6,
    xpValue: 500, 
    behavior: 'AGGRESSIVE',
    tier: 3
  },
  [CreatureType.GHOST]: {
    type: CreatureType.GHOST,
    name: "Sea Ghost",
    baseRadius: 32,
    color: "#94a3b8", 
    speed: BASE_SWIM_SPEED * 1.2, 
    health: 60,
    damage: 5,
    xpValue: 400, 
    behavior: 'AGGRESSIVE',
    tier: 3
  },
  [CreatureType.EEL]: {
    type: CreatureType.EEL,
    name: "Electric Eel",
    baseRadius: 35,
    color: "#f59e0b", 
    speed: BASE_SWIM_SPEED, 
    health: 70,
    damage: 4,
    xpValue: 450, 
    behavior: 'AGGRESSIVE',
    special: 'SHOCK',
    tier: 3
  },
  [CreatureType.MEGA_MOUTH]: {
    type: CreatureType.MEGA_MOUTH,
    name: "Mega Mouth",
    baseRadius: 65,
    color: "#ef4444", 
    speed: BASE_SWIM_SPEED, 
    health: 200,
    damage: 10,
    xpValue: 800, 
    behavior: 'AGGRESSIVE',
    tier: 4
  },
  [CreatureType.LEVIATHAN]: {
    type: CreatureType.LEVIATHAN,
    name: "Leviathan",
    baseRadius: 160,
    color: "#dc2626", 
    speed: BASE_SWIM_SPEED * 0.8, 
    health: 1500,
    damage: 25,
    xpValue: 5000, 
    behavior: 'BOSS',
    tier: 4
  },
  // Keep Mutant for type safety if needed, or remove. Keeping mapping for now.
  [CreatureType.MUTANT]: {
    type: CreatureType.MUTANT,
    name: "Abomination",
    baseRadius: 85,
    color: "#10b981", 
    speed: BASE_SWIM_SPEED * 0.9, 
    health: 500,
    damage: 12,
    xpValue: 1500, 
    behavior: 'BOSS',
    tier: 4
  },
  // Keep Worker for type safety
   [CreatureType.WORKER]: {
    type: CreatureType.WORKER,
    name: "Worker",
    baseRadius: 24,
    color: "#64748b", 
    speed: BASE_SWIM_SPEED, 
    health: 40,
    damage: 1,
    xpValue: 200, 
    behavior: 'FLEE',
    tier: 2
  },
  // Keep Armor Fish for type safety
  [CreatureType.ARMOR_FISH]: {
    type: CreatureType.ARMOR_FISH,
    name: "Armor Fish",
    baseRadius: 28,
    color: "#475569", 
    speed: BASE_SWIM_SPEED * 0.9, 
    health: 100,
    damage: 2,
    xpValue: 300, 
    behavior: 'PASSIVE',
    special: 'SPIKE',
    tier: 2
  },
};

export const INITIAL_PLAYER_STATS = {
  radius: 14, 
  speed: BASE_SWIM_SPEED, 
  health: 100,
  maxHealth: 100
};

// Generate thresholds:
const generateThresholds = () => {
  const levels = [0];
  let cumulativeXp = 0;
  for (let i = 1; i <= 100; i++) {
    cumulativeXp += 500 * i;
    levels.push(cumulativeXp);
  }
  return levels;
};

export const LEVEL_THRESHOLDS = generateThresholds();
