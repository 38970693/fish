export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  EVOLVING = 'EVOLVING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export enum CreatureType {
  // Tier 0 (Food)
  PLANKTON = 'PLANKTON',
  
  // Tier 1 (Starters / Small)
  CLOWN_FISH = 'CLOWN_FISH',   // Balanced
  BLUE_TANG = 'BLUE_TANG',     // Fast
  TURTLE = 'TURTLE',           // Tanky
  JELLYFISH = 'JELLYFISH',
  
  // Tier 2 (Medium)
  SEAHORSE = 'SEAHORSE',
  SQUID = 'SQUID', 
  PUFFER_FISH = 'PUFFER_FISH',
  CRAB = 'CRAB',
  ELECTRIC_EEL = 'ELECTRIC_EEL',
  
  // Tier 3 (Large)
  STINGRAY = 'STINGRAY',
  SWORD_FISH = 'SWORD_FISH',
  HAMMERHEAD = 'HAMMERHEAD',
  ANGLER_FISH = 'ANGLER_FISH',
  AROWANA = 'AROWANA',         // New: Gold Arowana
  FUR_SEAL = 'FUR_SEAL',       // New: Mammal
  
  // Tier 4 (Apex)
  GREAT_WHITE = 'GREAT_WHITE', // Shark
  ORCA = 'ORCA',               // Whale
  NARWHAL = 'NARWHAL',         // New: Unicorn of the sea
  MERMAID = 'MERMAID',         // New: Mythical
  KRAKEN = 'KRAKEN'            // Boss
}

export interface CreatureConfig {
  type: CreatureType;
  name: string;
  baseRadius: number;
  color: string;
  speed: number;
  health: number;
  damage: number;
  weightValue: number; // Replaces XP value
  behavior: 'PASSIVE' | 'FLEE' | 'AGGRESSIVE' | 'AMBUSH' | 'BOSS';
  special?: 'POISON' | 'SHOCK' | 'SPIKE' | 'LURE' | 'CAMO' | 'NONE' | 'SHELL';
  tier: 0 | 1 | 2 | 3 | 4;
  description?: string; // For selection menu
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
  targetId?: string | null; 
  aggroTimer?: number; 
  mouthOpenValue: number; 
  isHidden?: boolean; 
  
  isIdle: boolean;
  lureActive: boolean;
  camoActive: boolean;
  ambushTimer: number;

  animOffset: number; 
  renderScale: number; 
  isInvulnerable?: boolean; 
  speedBoostTimer?: number; 
  
  // Happy/Eating Effect
  happyTimer?: number; 
  
  // Speech Bubble
  speechBubble?: { text: string; timer: number; color: string } | null;
}

export interface PlayerState extends Entity {
  weight: number; // Replaces XP/Level. This is the score.
  evolutionPoints: number;
  traits: string[];
  stats: {
    speedMult: number;
    sizeMult: number;
    defenseMult: number;
    visionRadius: number;
  };
  eatenHistory: Record<CreatureType, number>; 
  boost: {
    current: number;
    max: number;
    active: boolean;
  };
  isGodMode?: boolean;
  isAutoMode?: boolean; // New: Auto play
  reviveCount: number; 
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
  interactionType?: 'SHRINK'; // New: If present, particles interact with fish
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
  type: 'SPEED';
  radius: number;
}

export interface Hazard {
  id: string;
  x: number;
  y: number;
  radius: number;
  type: 'METEOR_STRIKE'; // Changed from BIRD_STRIKE
  timer: number;
  duration: number;
  stage: 'WARNING' | 'STRIKE' | 'COOLDOWN';
}

export interface GameState {
  status: GameStatus;
  player: PlayerState;
  entities: Entity[];
  particles: Particle[];
  obstacles: Obstacle[];
  powerUps: PowerUp[];
  hazards: Hazard[]; 
  worldWidth: number;
  worldHeight: number;
  camera: { x: number; y: number; zoom: number };
  score: number; // Kept for legacy compatibility, usually same as weight
  genePoints: number; 
  time: number; 
}