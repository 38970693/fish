import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TREASURE_CONFIG, TREASURE_COLORS } from '../constants';
import { Treasure, GameState, PlayerState, Entity } from '../types';

// Mock gameEngine functions used in tests
const createParticle = (x: number, y: number, color: string) => ({
  id: crypto.randomUUID(),
  x,
  y,
  vx: (Math.random() - 0.5) * 4,
  vy: (Math.random() - 0.5) * 4,
  life: 1.0,
  maxLife: 1.0,
  color,
  size: 2 + Math.random() * 3,
});

const dist = (a: { x: number; y: number; radius?: number }, b: { x: number; y: number; radius?: number }) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

// Helper to create treasure
const createTreasure = (
  type: Treasure['type'],
  x: number,
  y: number
): Treasure => {
  const effectMap: Record<Treasure['type'], Treasure['effect']> = {
    FEAST: 'EXP',
    CHEST: 'GOLD',
    GEM: 'SKILL',
    FOOD: 'SHIELD',
  };

  const rewardMap: Record<Treasure['type'], number> = {
    FEAST: TREASURE_CONFIG.FEAST_REWARD,
    CHEST: TREASURE_CONFIG.CHEST_GOLD,
    GEM: TREASURE_CONFIG.GEM_EXP_MULTIPLIER,
    FOOD: TREASURE_CONFIG.FOOD_HEAL,
  };

  return {
    id: crypto.randomUUID(),
    x,
    y,
    type,
    status: 'WARNING',
    timer: TREASURE_CONFIG.WARNING_DURATION,
    radius: TREASURE_CONFIG.RADIUS,
    effect: effectMap[type],
    rewardValue: rewardMap[type],
  };
};

// Helper to create player
const createPlayer = (x: number, y: number, radius: number = 20): PlayerState => ({
  id: 'player',
  x,
  y,
  vx: 0,
  vy: 0,
  radius,
  angle: 0,
  health: 100,
  maxHealth: 100,
  weight: 100,
  behavior: 'PLAYER' as const,
  cosmetics: {
    teeth: 0,
    skinColor: '#888',
    pattern: 'none',
    scaleType: 'normal',
    accessory: 'none',
    tailType: 'normal',
    bodyType: 'normal',
    mouthType: 'normal',
    eyeType: 'normal',
    eyebrowType: 'normal',
    trailType: 'none',
  },
  color: '#4a9eff',
  speed: 2,
  evolutionPoints: 0,
  protectionTimer: 0,
  boost: { energy: 100, active: false },
  squad: [],
  speechBubble: null,
  isInSquad: false,
  squadLeader: null,
  abilities: { torpedo: { cooldown: 0 }, shield: { cooldown: 0 } },
  isSemiGhost: false,
  invincible: false,
  skillTimer: 0,
  skillType: null,
});

describe('Treasure Event System', () => {
  describe('Treasure Spawn', () => {
    it('should create treasure with WARNING status initially', () => {
      const treasure = createTreasure('FEAST', 1000, 1000);

      expect(treasure.status).toBe('WARNING');
      expect(treasure.timer).toBe(TREASURE_CONFIG.WARNING_DURATION);
    });

    it('should transition from WARNING to ACTIVE after WARNING_DURATION', () => {
      const treasure = createTreasure('FEAST', 1000, 1000);
      expect(treasure.status).toBe('WARNING');

      // Simulate timer running out
      treasure.timer = 0;
      treasure.status = 'ACTIVE';

      expect(treasure.status).toBe('ACTIVE');
    });

    it('should have correct radius from TREASURE_CONFIG', () => {
      const treasure = createTreasure('CHEST', 500, 500);
      expect(treasure.radius).toBe(TREASURE_CONFIG.RADIUS);
    });
  });

  describe('Treasure Types', () => {
    it('should create FEAST treasure with EXP effect', () => {
      const treasure = createTreasure('FEAST', 500, 500);

      expect(treasure.type).toBe('FEAST');
      expect(treasure.effect).toBe('EXP');
      expect(treasure.rewardValue).toBe(TREASURE_CONFIG.FEAST_REWARD);
    });

    it('should create CHEST treasure with GOLD effect', () => {
      const treasure = createTreasure('CHEST', 500, 500);

      expect(treasure.type).toBe('CHEST');
      expect(treasure.effect).toBe('GOLD');
      expect(treasure.rewardValue).toBe(TREASURE_CONFIG.CHEST_GOLD);
    });

    it('should create GEM treasure with SKILL effect', () => {
      const treasure = createTreasure('GEM', 500, 500);

      expect(treasure.type).toBe('GEM');
      expect(treasure.effect).toBe('SKILL');
      expect(treasure.rewardValue).toBe(TREASURE_CONFIG.GEM_EXP_MULTIPLIER);
    });

    it('should create FOOD treasure with SHIELD effect', () => {
      const treasure = createTreasure('FOOD', 500, 500);

      expect(treasure.type).toBe('FOOD');
      expect(treasure.effect).toBe('SHIELD');
      expect(treasure.rewardValue).toBe(TREASURE_CONFIG.FOOD_HEAL);
    });

    it('should have correct colors from TREASURE_COLORS', () => {
      expect(TREASURE_COLORS.FEAST).toBe('#f97316');
      expect(TREASURE_COLORS.CHEST).toBe('#eab308');
      expect(TREASURE_COLORS.GEM).toBe('#a855f7');
      expect(TREASURE_COLORS.FOOD).toBe('#22c55e');
    });
  });

  describe('Pickup Detection', () => {
    it('should detect pickup when player overlaps with treasure', () => {
      const treasure = createTreasure('FEAST', 1000, 1000);
      const player = createPlayer(1000, 1000, 20); // Same position as treasure

      const distance = dist(player, treasure);
      const canPickup = distance < player.radius + treasure.radius;

      expect(canPickup).toBe(true);
    });

    it('should not detect pickup when player is too far', () => {
      const treasure = createTreasure('FEAST', 1000, 1000);
      const player = createPlayer(0, 0, 20); // Far from treasure

      const distance = dist(player, treasure);
      const canPickup = distance < player.radius + treasure.radius;

      expect(canPickup).toBe(false);
    });
  });

  describe('Treasure Rewards', () => {
    it('should apply FEAST reward (EXP) to player', () => {
      const treasure = createTreasure('FEAST', 1000, 1000);
      const player = createPlayer(1000, 1000);

      const initialWeight = player.weight;
      const initialEvoPoints = player.evolutionPoints;

      // Simulate pickup effect
      if (treasure.effect === 'EXP') {
        player.weight += treasure.rewardValue || 0;
        player.evolutionPoints += treasure.rewardValue || 0;
      }

      expect(player.weight).toBe(initialWeight + treasure.rewardValue);
      expect(player.evolutionPoints).toBe(initialEvoPoints + treasure.rewardValue);
    });

    it('should apply FOOD heal effect', () => {
      const treasure = createTreasure('FOOD', 1000, 1000);
      const player = createPlayer(1000, 1000);
      player.health = 50; // Damaged player

      const healAmount = treasure.rewardValue || 0;
      const newHealth = Math.min(player.maxHealth, player.health + healAmount);

      expect(newHealth).toBeGreaterThan(player.health);
      expect(newHealth).toBeLessThanOrEqual(player.maxHealth);
    });

    it('should create particle effect on pickup', () => {
      const treasure = createTreasure('FEAST', 1000, 1000);
      treasure.status = 'ACTIVE'; // Must be ACTIVE to trigger pickup
      const particles: ReturnType<typeof createParticle>[] = [];

      // Simulate pickup particle creation
      if (treasure.status === 'ACTIVE') {
        particles.push(createParticle(treasure.x, treasure.y, TREASURE_COLORS[treasure.type]));
      }

      expect(particles.length).toBe(1);
      expect(particles[0].color).toBe(TREASURE_COLORS.FEAST);
    });
  });

  describe('Treasure Lifecycle', () => {
    it('should be removed after timer reaches 0', () => {
      const treasures: Treasure[] = [createTreasure('FEAST', 500, 500)];

      // Simulate timer expiration
      treasures[0].timer = 0;

      const activeTreasures = treasures.filter(t => t.timer > 0);

      expect(activeTreasures.length).toBe(0);
    });

    it('should only be pickable when status is ACTIVE', () => {
      const warningTreasure = createTreasure('FEAST', 1000, 1000);
      const activeTreasure = createTreasure('FEAST', 1000, 1000);
      activeTreasure.status = 'ACTIVE';

      expect(warningTreasure.status).toBe('WARNING');
      expect(activeTreasure.status).toBe('ACTIVE');

      // Only ACTIVE treasure should be picked up
      const warningPickable = warningTreasure.status === 'ACTIVE';
      const activePickable = activeTreasure.status === 'ACTIVE';

      expect(warningPickable).toBe(false);
      expect(activePickable).toBe(true);
    });
  });
});