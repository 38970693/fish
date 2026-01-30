
export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  EVOLVING = 'EVOLVING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY',
  SHOP = 'SHOP'
}

export enum BiomeType {
  SHALLOWS = 'SHALLOWS', // Top Left
  REEF = 'REEF',         // Top Right
  SWAMP = 'SWAMP',       // Bottom Left
  ABYSS = 'ABYSS'        // Bottom Right
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
  nativeBiome?: BiomeType; // Preferred biome
}

export interface BasketItem {
  type: CreatureType;
  count: number;
  totalWeight: number;
}

export type TeethType = 
  | 'NORMAL' | 'SHARP' | 'VAMPIRE' | 'BRACES' | 'GOLD' 
  | 'CURVED' | 'DOUBLE_ROW' | 'SABER' | 'GAPPED' | 'DIAMOND' 
  | 'RAINBOW' | 'BUGS' | 'BLOCKY';

export type PatternType = 
  | 'NONE' | 'STRIPES' | 'SPOTS' | 'TIGER' 
  | 'DOTS' | 'CAMO' | 'ZEBRA' | 'LEOPARD' 
  | 'HEART' | 'STAR' | 'CIRCUIT' | 'LAVA' | 'KOI' | 'SKELETON'
  // NEW PATTERNS
  | 'LIGHTNING' | 'CLOUD' | 'CHECKER' | 'VINES' | 'TARGET' 
  | 'GALAXY' | 'SMILEY' | 'FIREY' | 'RUNE' | 'CANDY';

export type ScaleType = 
  | 'NONE' | 'SHINY' | 'DRAGON' | 'STONE' 
  | 'FEATHER' | 'MECHANICAL' | 'GLOW' | 'MOSAIC' 
  | 'CRYSTAL' | 'VOID' | 'PIXEL'
  // NEW SCALES
  | 'ARMOR' | 'DIAMOND_PLATE' | 'SLIME' | 'BIO_HAZARD';

export interface Cosmetics {
  teeth: TeethType;
  skinColor: string; // 'DEFAULT', hex, or 'GRADIENT_XYZ'
  pattern: PatternType;
  scaleType: ScaleType;
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
  ownerId?: string; // New: If set, this entity belongs to a squad (e.g. 'player')
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
  
  // Scared/Panic Effect
  fearTimer?: number;
  
  // Speech Bubble
  speechBubble?: { text: string; timer: number; color: string } | null;

  // Visuals
  evolutionVisualTimer?: number;
  
  // Cosmetics (Optional for NPCs, mandatory for player)
  cosmetics?: Cosmetics;
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
  basket: BasketItem[]; // New: Caught fish inventory 
  boost: {
    current: number;
    max: number;
    active: boolean;
  };
  isGodMode?: boolean;
  isAutoMode?: boolean; // New: Auto play
  reviveCount: number; 
  
  // New Items
  shieldTimer: number;
  invulnerableTimer: number; // New: For protection countdown logic
  torpedoCount: number;
  torpedoCooldown: number;
  
  // Overdrive
  isOverdrive: boolean;
  
  // Current Biome Status
  currentBiome: BiomeType;
  biomeDebuffTimer: number; // For tick damage in swamp etc
  
  // Customization
  cosmetics: Cosmetics;
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
  type: 'SPEED' | 'SHIELD' | 'TORPEDO'; // Added new types
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

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetId: string | null;
  life: number;
  radius: number;
  damage: number;
  angle: number;
}

export interface Portal {
  id: string;
  x: number;
  y: number;
  radius: number;
  // timer: number; // Removed, portals are permanent
  angle: number;
}

export enum BuildingType {
  HOSPITAL = 'HOSPITAL',
  ARMORY = 'ARMORY',
  SHRINE = 'SHRINE'
}

export interface Building {
  id: string;
  x: number;
  y: number;
  type: BuildingType;
  radius: number;
  cooldown: number; // frames
}

export interface GameState {
  status: GameStatus;
  player: PlayerState;
  entities: Entity[];
  particles: Particle[];
  obstacles: Obstacle[];
  powerUps: PowerUp[];
  hazards: Hazard[]; 
  projectiles: Projectile[];
  portals: Portal[]; 
  buildings: Building[]; // New
  worldWidth: number;
  worldHeight: number;
  camera: { x: number; y: number; zoom: number };
  score: number; 
  genePoints: number; 
  time: number; 
}
