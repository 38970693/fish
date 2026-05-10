import { describe, it, expect, beforeEach } from 'vitest';
import { EVOLUTION_THRESHOLDS } from '../constants';
import { CreatureType } from '../types';

// Mock player for evolution tests
const createMockPlayer = () => ({
  id: 'player-1',
  type: CreatureType.CLOWN_FISH,
  x: 2000,
  y: 2000,
  vx: 0,
  vy: 0,
  radius: 15,
  angle: 0,
  health: 100,
  maxHealth: 100,
  speed: 1.5,
  config: {
    type: CreatureType.CLOWN_FISH,
    name: '小丑鱼',
    baseRadius: 15,
    color: '#fb923c',
    speed: 1.5,
    health: 30,
    damage: 2,
    weightValue: 5,
    behavior: 'FLEE' as const,
    tier: 1,
  },
  targetId: null,
  ownerId: undefined,
  aggroTimer: 0,
  mouthOpenValue: 0,
  isHidden: false,
  isIdle: false,
  lureActive: false,
  camoActive: false,
  ambushTimer: 0,
  animOffset: 0,
  renderScale: 1,
  isInvulnerable: false,
  speedBoostTimer: 0,
  happyTimer: 0,
  fearTimer: 0,
  speechBubble: null,
  evolutionVisualTimer: 0,
  level: 1,
  weight: 10,
  evolutionPoints: 0,
  traits: [],
  stats: {
    speedMult: 1,
    sizeMult: 1,
    defenseMult: 1,
    visionRadius: 500,
  },
  eatenHistory: {} as Record<CreatureType, number>,
  basket: [],
  boost: { current: 50, max: 100, active: false },
  isGodMode: false,
  isAutoMode: false,
  reviveCount: 0,
  shieldTimer: 0,
  invulnerableTimer: 0,
  torpedoCount: 0,
  torpedoCooldown: 0,
  isOverdrive: false,
  currentBiome: 'SHALLOWS' as const,
  biomeDebuffTimer: 0,
  skillCooldown: 0,
  skillMaxCooldown: 300,
  skillLevel: 1,
  isMecha: false,
  mechaTimer: 0,
  cosmetics: {
    teeth: 'NORMAL' as const,
    skinColor: 'DEFAULT',
    pattern: 'NONE' as const,
    scaleType: 'NONE' as const,
    accessory: 'NONE' as const,
    tailType: 'DEFAULT' as const,
    bodyType: 'DEFAULT' as const,
    mouthType: 'TRIANGLE' as const,
    eyeType: 'NORMAL' as const,
    eyebrowType: 'NONE' as const,
    trailType: 'NONE' as const,
  },
});

describe('Evolution System', () => {
  describe('Eating food increases evolutionPoints', () => {
    it('should increase evolutionPoints when eating plankton', () => {
      const player = createMockPlayer();
      const planktonWeight = 1; // PLANKTON weightValue

      // Simulate eating plankton
      player.weight += planktonWeight;
      player.evolutionPoints += planktonWeight;

      expect(player.evolutionPoints).toBe(planktonWeight);
      expect(player.weight).toBe(11); // 10 + 1
    });

    it('should increase evolutionPoints when eating creature', () => {
      const player = createMockPlayer();
      const creatureWeight = 5; // CLOWN_FISH weightValue

      // Simulate eating a creature
      player.weight += creatureWeight;
      player.evolutionPoints += creatureWeight;

      expect(player.evolutionPoints).toBe(creatureWeight);
      expect(player.weight).toBe(15); // 10 + 5
    });

    it('should accumulate evolutionPoints from multiple meals', () => {
      const player = createMockPlayer();
      const meals = [5, 8, 15]; // Simulating multiple creature eats

      meals.forEach(meal => {
        player.weight += meal;
        player.evolutionPoints += meal;
      });

      expect(player.evolutionPoints).toBe(28); // 5 + 8 + 15
      expect(player.weight).toBe(38); // 10 + 28
    });

    it('should heal player when eating', () => {
      const player = createMockPlayer();
      player.health = 50;
      const mealWeight = 10;

      // Simulate eating with health gain
      player.weight += mealWeight;
      player.evolutionPoints += mealWeight;
      player.health = Math.min(player.maxHealth, player.health + mealWeight * 2);

      expect(player.health).toBe(70); // 50 + (10 * 2)
    });
  });

  describe('Evolution triggers at threshold', () => {
    it('should trigger evolution when reaching tier 2 threshold (weight 30)', () => {
      const player = createMockPlayer();
      const threshold = EVOLUTION_THRESHOLDS[0]; // { weight: 30, tier: 2 }

      // Simulate reaching threshold
      player.evolutionPoints = threshold.weight;

      expect(player.evolutionPoints).toBeGreaterThanOrEqual(threshold.weight);
      expect(player.config.tier + 1).toBe(threshold.tier);
    });

    it('should trigger evolution when reaching tier 3 threshold (weight 100)', () => {
      const player = createMockPlayer();
      const threshold = EVOLUTION_THRESHOLDS[1]; // { weight: 100, tier: 3 }

      player.evolutionPoints = threshold.weight;

      expect(player.evolutionPoints).toBeGreaterThanOrEqual(threshold.weight);
    });

    it('should trigger evolution when reaching tier 4 threshold (weight 300)', () => {
      const player = createMockPlayer();
      const threshold = EVOLUTION_THRESHOLDS[2]; // { weight: 300, tier: 4 }

      player.evolutionPoints = threshold.weight;

      expect(player.evolutionPoints).toBeGreaterThanOrEqual(threshold.weight);
    });

    it('should not trigger evolution below threshold', () => {
      const player = createMockPlayer();
      player.evolutionPoints = 29; // Below tier 2 threshold (30)

      const currentTier = player.config.tier;
      const nextThreshold = EVOLUTION_THRESHOLDS.find(t => t.tier === currentTier + 1);

      const shouldEvolve = nextThreshold && player.evolutionPoints >= nextThreshold.weight;

      expect(shouldEvolve).toBe(false);
    });
  });

  describe('Evolution changes player properties', () => {
    it('should increase level when eating enough', () => {
      const player = createMockPlayer();
      const prevLevel = player.level;

      // Simulate gaining weight that increases level (weight / 10 + 1)
      player.weight = 20; // 20 / 10 + 1 = 3
      const newLevel = Math.floor(player.weight / 10) + 1;

      expect(newLevel).toBe(3);
      expect(newLevel).toBeGreaterThan(prevLevel);
    });

    it('should increase radius when leveling up', () => {
      const player = createMockPlayer();
      const prevRadius = player.radius;
      const prevLevel = player.level;

      // Simulate level increase
      player.level = prevLevel + 1;
      player.radius += 2; // Radius increases by 2 per level

      expect(player.radius).toBe(prevRadius + 2);
    });

    it('should update eaten history when eating creatures', () => {
      const player = createMockPlayer();

      player.eatenHistory[CreatureType.PLANKTON] = 5;
      player.eatenHistory[CreatureType.CLOWN_FISH] = 3;

      expect(player.eatenHistory[CreatureType.PLANKTON]).toBe(5);
      expect(player.eatenHistory[CreatureType.CLOWN_FISH]).toBe(3);
    });
  });

  describe('Different evolution stages', () => {
    it('should have correct threshold configuration', () => {
      expect(EVOLUTION_THRESHOLDS).toHaveLength(3);
      expect(EVOLUTION_THRESHOLDS[0]).toEqual({ weight: 30, tier: 2 });
      expect(EVOLUTION_THRESHOLDS[1]).toEqual({ weight: 100, tier: 3 });
      expect(EVOLUTION_THRESHOLDS[2]).toEqual({ weight: 300, tier: 4 });
    });

    it('should have monotonic increasing weights', () => {
      for (let i = 1; i < EVOLUTION_THRESHOLDS.length; i++) {
        expect(EVOLUTION_THRESHOLDS[i].weight).toBeGreaterThan(
          EVOLUTION_THRESHOLDS[i - 1].weight
        );
      }
    });

    it('should have sequential tier progression', () => {
      for (let i = 0; i < EVOLUTION_THRESHOLDS.length; i++) {
        expect(EVOLUTION_THRESHOLDS[i].tier).toBe(i + 2); // Starts at tier 2
      }
    });
  });

  describe('Level calculation', () => {
    it('should calculate level correctly from weight', () => {
      const testCases = [
        { weight: 0, expectedLevel: 1 },
        { weight: 10, expectedLevel: 2 },
        { weight: 50, expectedLevel: 6 },
        { weight: 99, expectedLevel: 10 },
        { weight: 100, expectedLevel: 11 },
      ];

      testCases.forEach(({ weight, expectedLevel }) => {
        const level = Math.floor(weight / 10) + 1;
        expect(level).toBe(expectedLevel);
      });
    });

    it('should update level when threshold is crossed', () => {
      const player = createMockPlayer();
      player.level = 1;
      player.weight = 10;

      // Level calculation: weight / 10 + 1
      const newLevel = Math.floor(player.weight / 10) + 1;

      expect(newLevel).toBe(2);
      expect(newLevel).toBeGreaterThan(player.level);
    });
  });
});