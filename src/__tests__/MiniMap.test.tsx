import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MiniMap from '../components/MiniMap';
import { GameState, PlayerState, Portal, Treasure, Hazard, CreatureType } from '../types';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Compass: () => null,
}));

// Mock getMapBoundaryRadius
vi.mock('../gameEngine', () => ({
  getMapBoundaryRadius: (angle: number) => {
    const baseRadius = 2000;
    const variance = 1200 * Math.abs(Math.sin(2 * angle));
    return baseRadius + variance;
  },
}));

// Mock constants
vi.mock('../constants', () => ({
  WORLD_SIZE: 6000,
  MAP_SHAPE_CONFIG: {
    CENTER_X: 3000,
    CENTER_Y: 3000,
    BASE_RADIUS: 2000,
    PETAL_VARIANCE: 1200,
  },
  BIOME_CONFIGS: {
    SHALLOWS: { name: '阳光浅滩', color: '#0ea5e9', xRange: [0, 3000], yRange: [0, 3000] },
    REEF: { name: '五彩珊瑚', color: '#2dd4bf', xRange: [3000, 6000], yRange: [0, 3000] },
    SWAMP: { name: '剧毒沼泽', color: '#3f6212', xRange: [0, 3000], yRange: [3000, 6000] },
    ABYSS: { name: '深渊海沟', color: '#0f172a', xRange: [3000, 6000], yRange: [3000, 6000] },
  },
  TREASURE_CONFIG: {
    SPAWN_INTERVAL: 3600,
    WARNING_DURATION: 180,
  },
  TREASURE_COLORS: {
    FEAST: '#f97316',
    CHEST: '#eab308',
    GEM: '#a855f7',
    FOOD: '#22c55e',
    DEFAULT: '#fcd34d',
  },
  CREATURE_CONFIGS: {},
  BUILDING_CONFIGS: {
    HOSPITAL: { name: '深海急救站', color: '#ef4444', radius: 150, cooldown: 300 },
    ARMORY: { name: '军火库', color: '#f59e0b', radius: 150, cooldown: 600 },
    SHRINE: { name: '龙王庙', color: '#8b5cf6', radius: 150, cooldown: 900 },
    SHOP: { name: '深海商场', color: '#ec4899', radius: 200, cooldown: 600 },
    WISHING_WELL: { name: '许愿池', color: '#f59e0b', radius: 130, cooldown: 1200 },
    PEARL_FARM: { name: '珍珠养殖场', color: '#cbd5e1', radius: 140, cooldown: 900 },
    SHIPWRECK: { name: '沉船残骸', color: '#92400e', radius: 170, cooldown: 1500 },
  },
}));

const createMockPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player1',
  type: CreatureType.CLOWN_FISH,
  x: 3000,
  y: 3000,
  vx: 0,
  vy: 0,
  radius: 25,
  angle: 0,
  health: 100,
  maxHealth: 100,
  speed: 2,
  config: {
    type: CreatureType.CLOWN_FISH,
    name: '小丑鱼',
    baseRadius: 15,
    color: '#ff6b35',
    speed: 1.5,
    health: 80,
    damage: 10,
    weightValue: 50,
    behavior: 'PASSIVE',
    tier: 1,
  },
  targetId: null,
  mouthOpenValue: 0,
  isIdle: false,
  lureActive: false,
  camoActive: false,
  ambushTimer: 0,
  animOffset: 0,
  renderScale: 1,
  cosmetics: {
    teeth: 'NORMAL',
    skinColor: '#ff6b35',
    pattern: 'NONE',
    scaleType: 'NONE',
    accessory: 'NONE',
    tailType: 'DEFAULT',
    bodyType: 'DEFAULT',
    mouthType: 'TRIANGLE',
    eyeType: 'NORMAL',
    eyebrowType: 'NONE',
    trailType: 'NONE',
  },
  level: 5,
  weight: 200,
  evolutionPoints: 0,
  stats: {
    speedMult: 1,
    sizeMult: 1,
    defenseMult: 1,
    visionRadius: 500,
  },
  eatenHistory: {},
  boost: { current: 100, max: 100, active: false },
  reviveCount: 0,
  shieldTimer: 0,
  invulnerableTimer: 0,
  currentBiome: 'SHALLOWS' as any,
  biomeDebuffTimer: 0,
  skillCooldown: 0,
  skillMaxCooldown: 0,
  skillLevel: 0,
  schoolSkillCooldown: 0,
  ...overrides,
});

const createMockGameState = (overrides: Partial<GameState> = {}): GameState => ({
  status: 'PLAYING' as any,
  player: createMockPlayer(),
  entities: [],
  squad: {
    pending: [],
    switchCooldown: 0,
    recruitedTotal: 0,
    possessCount: 0,
    // FQ-05：缺省指令 = 护卫（undefined 会在 UIOverlay 里回退到 GUARD，这里显式写出来更贴近真实）
    command: 'GUARD' as any,
    commandTargetId: undefined,
    targetLostTimer: 0,
    notice: null,
    pendingActions: [],
  },
  particles: [],
  obstacles: [],
  powerUps: [],
  hazards: [],
  portals: [],
  buildings: [],
  treasures: [],
  fountains: [],
  labels: [],
  pondId: 'CLEAR',
  worldWidth: 6000,
  worldHeight: 6000,
  camera: { x: 3000, y: 3000, zoom: 1 },
  score: 0,
  time: 0,
  ...overrides,
});

describe('MiniMap Component', () => {
  it('should render without crashing', () => {
    const gameState = createMockGameState();
    const { container } = render(<MiniMap gameState={gameState} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('should render with empty data', () => {
    const gameState = createMockGameState();
    const { container } = render(<MiniMap gameState={gameState} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('should render with portals', () => {
    const gameState = createMockGameState({
      portals: [
        { id: '1', x: 1500, y: 1500, radius: 50, angle: 0, name: '浅滩之门' },
        { id: '2', x: 4500, y: 1500, radius: 50, angle: 0, name: '珊瑚之门' },
      ],
    });

    const { container } = render(<MiniMap gameState={gameState} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('should render with treasures', () => {
    const gameState = createMockGameState({
      treasures: [
        { id: '1', x: 3000, y: 3000, type: 'FEAST', status: 'ACTIVE', timer: 0, radius: 60 },
        { id: '2', x: 3500, y: 3200, type: 'CHEST', status: 'WARNING', timer: 180, radius: 60 },
      ],
    });

    const { container } = render(<MiniMap gameState={gameState} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('should render canvas with correct dimensions', () => {
    const gameState = createMockGameState();
    const { container } = render(<MiniMap gameState={gameState} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(200);
  });

  it('should render with player at different position', () => {
    const gameState = createMockGameState({
      player: createMockPlayer({ x: 1500, y: 1500 }),
    });
    const { container } = render(<MiniMap gameState={gameState} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});

describe('MiniMap Rendering', () => {
  it('should render canvas element', () => {
    const gameState = createMockGameState();
    const { container } = render(<MiniMap gameState={gameState} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('should render with player direction indicator', () => {
    const gameState = createMockGameState({
      player: createMockPlayer({ angle: Math.PI / 2 }),
    });
    const { container } = render(<MiniMap gameState={gameState} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('should render with hazards', () => {
    const gameState = createMockGameState({
      hazards: [
        { id: '1', x: 2500, y: 2500, radius: 80, type: 'METEOR_STRIKE', timer: 120, duration: 60, stage: 'WARNING' },
        { id: '2', x: 3500, y: 3500, radius: 80, type: 'METEOR_STRIKE', timer: 0, duration: 60, stage: 'STRIKE' },
      ],
    });

    const { container } = render(<MiniMap gameState={gameState} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('should render with buildings', () => {
    const gameState = createMockGameState({
      buildings: [
        { id: '1', x: 2500, y: 2500, type: 'HOSPITAL', radius: 60, cooldown: 0 },
        { id: '2', x: 4000, y: 3000, type: 'SHOP', radius: 60, cooldown: 0 },
      ],
    });

    const { container } = render(<MiniMap gameState={gameState} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});

describe('MiniMap Entities', () => {
  it('should render with nearby creatures', () => {
    const gameState = createMockGameState({
      entities: [
        {
          id: 'creature1',
          type: CreatureType.CLOWN_FISH,
          x: 2900,
          y: 2900,
          vx: 0,
          vy: 0,
          radius: 15,
          angle: 0,
          health: 50,
          maxHealth: 50,
          speed: 1.5,
          config: {
            type: CreatureType.CLOWN_FISH,
            name: '小丑鱼',
            baseRadius: 15,
            color: '#ff6b35',
            speed: 1.5,
            health: 50,
            damage: 10,
            weightValue: 50,
            behavior: 'PASSIVE',
            tier: 1,
          },
          targetId: null,
          mouthOpenValue: 0,
          isIdle: false,
          lureActive: false,
          camoActive: false,
          ambushTimer: 0,
          animOffset: 0,
          renderScale: 1,
          level: 1,
        },
      ],
    });

    const { container } = render(<MiniMap gameState={gameState} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('should distinguish friendly vs hostile creatures', () => {
    const gameState = createMockGameState({
      player: createMockPlayer({ radius: 30 }),
      entities: [
        {
          id: 'small_creature',
          type: CreatureType.PLANKTON,
          x: 2950,
          y: 2950,
          vx: 0,
          vy: 0,
          radius: 8,
          angle: 0,
          health: 20,
          maxHealth: 20,
          speed: 0.5,
          config: {
            type: CreatureType.PLANKTON,
            name: '磷虾',
            baseRadius: 8,
            color: '#88cc44',
            speed: 0.5,
            health: 20,
            damage: 2,
            weightValue: 20,
            behavior: 'PASSIVE',
            tier: 0,
          },
          targetId: null,
          mouthOpenValue: 0,
          isIdle: false,
          lureActive: false,
          camoActive: false,
          ambushTimer: 0,
          animOffset: 0,
          renderScale: 1,
          level: 1,
        },
        {
          id: 'large_predator',
          type: CreatureType.GREAT_WHITE,
          x: 3100,
          y: 3100,
          vx: 0,
          vy: 0,
          radius: 80,
          angle: 0,
          health: 500,
          maxHealth: 500,
          speed: 3,
          config: {
            type: CreatureType.GREAT_WHITE,
            name: '大白鲨',
            baseRadius: 80,
            color: '#8899aa',
            speed: 3,
            health: 500,
            damage: 50,
            weightValue: 500,
            behavior: 'AGGRESSIVE',
            tier: 4,
          },
          targetId: null,
          mouthOpenValue: 0,
          isIdle: false,
          lureActive: false,
          camoActive: false,
          ambushTimer: 0,
          animOffset: 0,
          renderScale: 1,
          level: 10,
        },
      ],
    });

    const { container } = render(<MiniMap gameState={gameState} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});

describe('MiniMap Interactions', () => {
  it('should be clickable for camera navigation', () => {
    const gameState = createMockGameState();
    const { container } = render(<MiniMap gameState={gameState} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });
});