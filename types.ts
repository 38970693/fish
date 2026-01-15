export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  EVOLVING = 'EVOLVING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export enum CreatureType {
  // Tier 1: Passive
  PLANKTON = 'PLANKTON',
  ALGAE_FISH = 'ALGAE_FISH',
  JELLYFISH = 'JELLYFISH',
  
  // Tier 2: Reactive / Weird
  NEEDLE_FISH = 'NEEDLE_FISH',
  ARMOR_FISH = 'ARMOR_FISH',
  POISON_FISH = 'POISON_FISH',
  WORKER = 'WORKER', // "牛马" (Sad worker fish)
  
  // Tier 3: Aggressive / Monsters
  SWORD_FISH = 'SWORD_FISH',
  EEL = 'EEL',
  MEGA_MOUTH = 'MEGA_MOUTH',
  GHOST = 'GHOST', // "鬼"
  
  // Tier 4: Boss / Mutant
  MUTANT = 'MUTANT', // "怪"
  LEVIATHAN = 'LEVIATHAN'
}

export interface CreatureConfig {
  type: CreatureType;
  name: string;
  baseRadius: number;
  color: string;
  speed: number;
  health: number;
  damage: number;
  xpValue: number;
  behavior: 'PASSIVE' | 'FLEE' | 'AGGRESSIVE' | 'BOSS';
  special?: 'POISON' | 'SHOCK' | 'SPIKE' | 'NONE';
  tier: 1 | 2 | 3 | 4;
}

export interface Entity {
  id: string;
  type: CreatureType;
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
  targetId?: string | null; // For AI tracking
  mouthOpenValue: number; // 0 (closed) to 1 (wide open)
  isHidden?: boolean; // Transient state for rendering/logic
  animOffset: number; // Random value to desync animations
  renderScale: number; // For "Pop" effect when eating
  isInvulnerable?: boolean; // For pre-evolution protection
}

export interface PlayerState extends Entity {
  xp: number;
  level: number;
  evolutionPoints: number;
  traits: string[];
  stats: {
    speedMult: number;
    sizeMult: number;
    defenseMult: number;
    visionRadius: number;
  };
  eatenHistory: Record<CreatureType, number>; // To determine evolution path
  boost: {
    current: number;
    max: number;
    active: boolean;
  };
  isGodMode?: boolean;
}

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
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  radius: number;
  type: 'ROCK' | 'CORAL';
}

export interface GameState {
  status: GameStatus;
  player: PlayerState;
  entities: Entity[];
  particles: Particle[];
  obstacles: Obstacle[];
  worldWidth: number;
  worldHeight: number;
  camera: { x: number; y: number; zoom: number };
  score: number;
  genePoints: number; // Persistent currency
  time: number; // Global animation tick
}