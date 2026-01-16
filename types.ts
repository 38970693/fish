

export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  EVOLVING = 'EVOLVING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export enum CreatureType {
  // Tier 0
  PLANKTON = 'PLANKTON',
  
  // Tier 1 (Small)
  ALGAE_FISH = 'ALGAE_FISH', // Basic
  JELLYFISH = 'JELLYFISH', // Passive, dangerous to touch
  
  // Tier 2 (Medium - Tricksters)
  NEEDLE_FISH = 'NEEDLE_FISH', // Fast
  OCTOPUS = 'OCTOPUS', // Camouflage / Ambush
  POISON_FISH = 'POISON_FISH', // Defensive
  WORKER = 'WORKER',
  ARMOR_FISH = 'ARMOR_FISH',
  
  // Tier 3 (Large - Hunters)
  ANGLER_FISH = 'ANGLER_FISH', // Lure / Trap
  SWORD_FISH = 'SWORD_FISH', // Combat
  GHOST = 'GHOST', // Fast Aggro
  EEL = 'EEL',
  
  // Tier 4 (Giant)
  MEGA_MOUTH = 'MEGA_MOUTH',
  LEVIATHAN = 'LEVIATHAN',
  MUTANT = 'MUTANT'
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
  behavior: 'PASSIVE' | 'FLEE' | 'AGGRESSIVE' | 'AMBUSH' | 'BOSS';
  special?: 'POISON' | 'SHOCK' | 'SPIKE' | 'LURE' | 'CAMO' | 'NONE';
  tier: 0 | 1 | 2 | 3 | 4;
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
  aggroTimer?: number; // How long to chase target (frames)
  mouthOpenValue: number; // 0 (closed) to 1 (wide open)
  isHidden?: boolean; // Hiding in obstacles
  
  // Strategy States
  isIdle: boolean; // Not moving much
  lureActive: boolean; // Angler light on
  camoActive: boolean; // Octopus blended in
  ambushTimer: number; // Bonus frames after breaking stealth

  animOffset: number; // Random value to desync animations
  renderScale: number; // For "Pop" effect when eating
  isInvulnerable?: boolean; // For pre-evolution protection
  speedBoostTimer?: number; // Effect timer for powerups
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
  reviveCount: number; // Track how many times revived
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
  type: 'BIRD_STRIKE';
  timer: number; // Countdown to strike
  duration: number; // Total duration of hazard
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
  score: number;
  genePoints: number; 
  time: number; 
}
