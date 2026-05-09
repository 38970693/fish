
export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  EVOLVING = 'EVOLVING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY',
  SHOP = 'SHOP',
  BATTLE_TEST = 'BATTLE_TEST'
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
  KRAKEN = 'KRAKEN',           // Boss
  
  // SPECIAL
  MASCOT = 'MASCOT'            // New Year Mascot
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
  behavior: 'PASSIVE' | 'FLEE' | 'AGGRESSIVE' | 'AMBUSH' | 'BOSS' | 'MASCOT';
  special?: 'POISON' | 'SHOCK' | 'SPIKE' | 'LURE' | 'CAMO' | 'NONE' | 'SHELL';
  tier: 0 | 1 | 2 | 3 | 4;
  description?: string; // For selection menu
  nativeBiome?: BiomeType; // Preferred biome
  skillName?: string;
  skillDescription?: string;
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

export type EyebrowType = 
  | 'NONE' | 'ANGRY' | 'SAD' | 'CONFUSED' | 'THICK' | 'UNI' | 'TIERED';

export type TrailType = 
  | 'NONE' | 'BUBBLES' | 'RAINBOW' | 'FIRE' | 'GLITTER' | 'HEARTS' | 'ELECTRIC' | 'SLIME';

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
  ownerId?: string;
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

  happyTimer?: number;
  fearTimer?: number;
  speechBubble?: { text: string; timer: number; color: string } | null;
  evolutionVisualTimer?: number;
  cosmetics?: Cosmetics;
  level: number;

  // 半虚状态保护（新生成的鱼不能被吃也不能吃别人）
  semiGhostTimer?: number; // 半虚状态倒计时（帧数，3秒 = 180帧）
}

export interface PlayerState extends Entity {
  weight: number;
  evolutionPoints: number;
  traits: string[];
  stats: {
    speedMult: number;
    sizeMult: number;
    defenseMult: number;
    visionRadius: number;
  };
  eatenHistory: Record<CreatureType, number>;
  basket: BasketItem[];
  boost: {
    current: number;
    max: number;
    active: boolean;
  };
  isGodMode?: boolean;
  isAutoMode?: boolean;
  reviveCount: number;
  isVip?: boolean;

  shieldTimer: number;
  invulnerableTimer: number;
  torpedoCount: number;
  torpedoCooldown: number;

  isOverdrive: boolean;
  currentBiome: BiomeType;
  biomeDebuffTimer: number;

  skillCooldown: number;
  skillMaxCooldown: number;
  skillLevel: number;

  isMecha: boolean;
  mechaTimer: number;

  cosmetics: Cosmetics;

  // 半虚状态保护（玩家也可能有）
  semiGhostTimer?: number;
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
  interactionType?: 'SHRINK'; 
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
  type: 'SPEED' | 'SHIELD' | 'BOTTLE' | 'SHELL'; 
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
  angle: number;
  name?: string;
}

export enum BuildingType {
  HOSPITAL = 'HOSPITAL',
  ARMORY = 'ARMORY',
  SHRINE = 'SHRINE',
  SHOP = 'SHOP' 
}

export interface Building {
  id: string;
  x: number;
  y: number;
  type: BuildingType;
  radius: number;
  cooldown: number; 
}

export interface Treasure {
  id: string;
  x: number;
  y: number;
  type: 'FEAST' | 'CHEST' | 'GEM' | 'FOOD';
  status: 'WARNING' | 'ACTIVE';
  timer: number;
  radius: number;
  effect?: 'EXP' | 'GOLD' | 'SKILL' | 'SHIELD'; // 宝藏效果类型
  rewardValue?: number; // 奖励数值
}

export interface Label {
  x: number;
  y: number;
  text: string;
  color: string;
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
  buildings: Building[]; 
  treasures: Treasure[]; 
  fountains: Fountain[];
  labels: Label[]; 
  worldWidth: number;
  worldHeight: number;
  camera: { x: number; y: number; zoom: number };
  score: number; 
  genePoints: number; 
  time: number; 
}
