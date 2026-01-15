import { CreatureConfig, CreatureType } from './types';

export const WORLD_SIZE = 4000;
export const MAX_ENTITIES = 800; // Increased to allow 400 small fish + others
export const MAX_OBSTACLES = 25;

export const BOOST_CONFIG = {
  MAX_ENERGY: 100,
  DRAIN_RATE: 0.4, 
  REGEN_RATE: 0.8, 
  SPEED_MULTIPLIER: 1.8
};

export const CREATURES: Record<CreatureType, CreatureConfig> = {
  [CreatureType.PLANKTON]: {
    type: CreatureType.PLANKTON,
    name: "Plankton",
    baseRadius: 6,
    color: "#86efac", // Lighter Green
    speed: 0.5,
    health: 1,
    damage: 0,
    xpValue: 15,
    behavior: 'PASSIVE',
    tier: 1
  },
  [CreatureType.ALGAE_FISH]: {
    type: CreatureType.ALGAE_FISH,
    name: "Algae Fish",
    baseRadius: 14,
    color: "#06b6d4", // Cyan-500
    speed: 2,
    health: 10,
    damage: 0,
    xpValue: 25,
    behavior: 'FLEE',
    tier: 1
  },
  [CreatureType.JELLYFISH]: {
    type: CreatureType.JELLYFISH,
    name: "Jellyfish",
    baseRadius: 20,
    color: "#d946ef", // Fuchsia-500
    speed: 0.8,
    health: 20,
    damage: 5,
    xpValue: 40,
    behavior: 'PASSIVE',
    special: 'SHOCK',
    tier: 1
  },
  [CreatureType.WORKER]: {
    type: CreatureType.WORKER,
    name: "Corporate Slave",
    baseRadius: 24,
    color: "#64748b", // Slate-500
    speed: 1.2,
    health: 40,
    damage: 0,
    xpValue: 80,
    behavior: 'FLEE',
    tier: 2
  },
  [CreatureType.NEEDLE_FISH]: {
    type: CreatureType.NEEDLE_FISH,
    name: "Needle Fish",
    baseRadius: 16,
    color: "#eab308", // Yellow-500
    speed: 5,
    health: 15,
    damage: 10,
    xpValue: 50,
    behavior: 'AGGRESSIVE',
    tier: 2
  },
  [CreatureType.ARMOR_FISH]: {
    type: CreatureType.ARMOR_FISH,
    name: "Armor Fish",
    baseRadius: 28,
    color: "#475569", // Slate-600
    speed: 1.5,
    health: 80,
    damage: 5,
    xpValue: 60,
    behavior: 'PASSIVE',
    special: 'SPIKE',
    tier: 2
  },
  [CreatureType.POISON_FISH]: {
    type: CreatureType.POISON_FISH,
    name: "Poison Fish",
    baseRadius: 22,
    color: "#84cc16", // Lime-500
    speed: 2.5,
    health: 30,
    damage: 15,
    xpValue: 70,
    behavior: 'FLEE',
    special: 'POISON',
    tier: 2
  },
  [CreatureType.GHOST]: {
    type: CreatureType.GHOST,
    name: "Sea Ghost",
    baseRadius: 30,
    color: "#a855f7", // Purple-500
    speed: 3.5,
    health: 50,
    damage: 20,
    xpValue: 100,
    behavior: 'AGGRESSIVE',
    tier: 3
  },
  [CreatureType.SWORD_FISH]: {
    type: CreatureType.SWORD_FISH,
    name: "Sword Fish",
    baseRadius: 38,
    color: "#3b82f6", // Blue-500
    speed: 6,
    health: 100,
    damage: 30,
    xpValue: 120,
    behavior: 'AGGRESSIVE',
    tier: 3
  },
  [CreatureType.EEL]: {
    type: CreatureType.EEL,
    name: "Electric Eel",
    baseRadius: 32,
    color: "#f59e0b", // Amber-500
    speed: 4,
    health: 80,
    damage: 25,
    xpValue: 130,
    behavior: 'AGGRESSIVE',
    special: 'SHOCK',
    tier: 3
  },
  [CreatureType.MEGA_MOUTH]: {
    type: CreatureType.MEGA_MOUTH,
    name: "Mega Mouth",
    baseRadius: 65,
    color: "#ef4444", // Red-500
    speed: 3,
    health: 300,
    damage: 50,
    xpValue: 200,
    behavior: 'AGGRESSIVE',
    tier: 3
  },
  [CreatureType.MUTANT]: {
    type: CreatureType.MUTANT,
    name: "Abomination",
    baseRadius: 85,
    color: "#10b981", // Emerald-500
    speed: 4.0,
    health: 800,
    damage: 60,
    xpValue: 500,
    behavior: 'BOSS',
    tier: 4
  },
  [CreatureType.LEVIATHAN]: {
    type: CreatureType.LEVIATHAN,
    name: "Leviathan",
    baseRadius: 160,
    color: "#0f172a", // Slate-900
    speed: 4.5,
    health: 2000,
    damage: 100,
    xpValue: 1000,
    behavior: 'BOSS',
    tier: 4
  }
};

export const INITIAL_PLAYER_STATS = {
  radius: 12, // Starting size
  speed: 4,
  health: 100,
  maxHealth: 100
};

// Reduced thresholds for faster evolution
export const LEVEL_THRESHOLDS = [0, 20, 60, 150, 350, 750, 2000];