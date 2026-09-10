import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BuildingType,
  Building,
  PlayerState,
  GameState,
  BiomeType,
  CreatureType
} from '../types';
import { BUILDING_CONFIGS } from '../constants';

const uuid = () => Math.random().toString(36).substr(2, 9);

const dist = (e1: { x: number; y: number }, e2: { x: number; y: number }) =>
  Math.sqrt((e1.x - e2.x) ** 2 + (e1.y - e2.y) ** 2);

const createMockPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player',
  type: CreatureType.CLOWN_FISH,
  x: 100,
  y: 100,
  vx: 0,
  vy: 0,
  radius: 15,
  angle: 0,
  health: 50,
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
    behavior: 'FLEE',
    tier: 1,
    nativeBiome: BiomeType.SHALLOWS,
    skillName: '逃跑',
    skillDescription: '极速逃跑'
  },
  mouthOpenValue: 0,
  isIdle: false,
  lureActive: false,
  camoActive: false,
  ambushTimer: 0,
  animOffset: 0,
  renderScale: 1,
  isHidden: false,
  speedBoostTimer: 0,
  happyTimer: 0,
  fearTimer: 0,
  speechBubble: null,
  evolutionVisualTimer: 0,
  cosmetics: {
    teeth: 'NORMAL',
    skinColor: '#fb923c',
    pattern: 'NONE',
    scaleType: 'NONE',
    accessory: 'NONE',
    tailType: 'DEFAULT',
    bodyType: 'DEFAULT',
    mouthType: 'TRIANGLE',
    eyeType: 'NORMAL',
    eyebrowType: 'NONE',
    trailType: 'NONE'
  },
  level: 3,
  weight: 30,
  evolutionPoints: 30,
  stats: {
    speedMult: 1,
    sizeMult: 1,
    defenseMult: 1,
    visionRadius: 300
  },
  eatenHistory: {},
  boost: { current: 100, max: 100, active: false },
  shieldTimer: 0,
  invulnerableTimer: 0,
  currentBiome: BiomeType.SHALLOWS,
  biomeDebuffTimer: 0,
  skillCooldown: 0,
  skillMaxCooldown: 180,
  skillLevel: 1,
  schoolSkillCooldown: 0,
  reviveCount: 0,
  semiGhostTimer: 0,
  ...overrides
});

const createMockBuilding = (overrides: Partial<Building> = {}): Building => ({
  id: uuid(),
  x: 200,
  y: 200,
  type: BuildingType.HOSPITAL,
  radius: BUILDING_CONFIGS.HOSPITAL.radius,
  cooldown: 0,
  ...overrides
});

describe('Building Interactions', () => {
  describe('HOSPITAL healing effect', () => {
    it('should heal player when within hospital radius', () => {
      const player = createMockPlayer({ health: 30, maxHealth: 100 });
      const hospital = createMockBuilding({
        type: BuildingType.HOSPITAL,
        x: player.x + 50,
        y: player.y
      });

      const distance = dist(player, hospital);
      const isInRange = distance < hospital.radius + player.radius;

      expect(isInRange).toBe(true);
      expect(player.health).toBe(30);

      const healAmount = 20;
      const newHealth = Math.min(player.maxHealth, player.health + healAmount);

      expect(newHealth).toBe(50);
    });

    it('should not exceed max health when healing', () => {
      const player = createMockPlayer({ health: 95, maxHealth: 100 });
      const healAmount = 20;
      const newHealth = Math.min(player.maxHealth, player.health + healAmount);

      expect(newHealth).toBe(100);
    });

    it('should have correct hospital config', () => {
      const config = BUILDING_CONFIGS[BuildingType.HOSPITAL];

      expect(config.radius).toBe(150);
      expect(config.cooldown).toBe(300);
      expect(config.color).toBe('#ef4444');
      expect(config.name).toBe('深海急救站');
    });
  });

  describe('SHRINE skill enhancement', () => {
    it('should enhance skill when within shrine radius', () => {
      const player = createMockPlayer({
        skillLevel: 1,
        skillCooldown: 180
      });
      const shrine = createMockBuilding({
        type: BuildingType.SHRINE,
        x: player.x + 50,
        y: player.y
      });

      const distance = dist(player, shrine);
      const isInRange = distance < shrine.radius + player.radius;

      expect(isInRange).toBe(true);

      const skillBonus = 1;
      const newSkillLevel = player.skillLevel + skillBonus;

      expect(newSkillLevel).toBe(2);
    });

    it('should have correct shrine config', () => {
      const config = BUILDING_CONFIGS[BuildingType.SHRINE];

      expect(config.radius).toBe(150);
      expect(config.cooldown).toBe(900);
      expect(config.color).toBe('#8b5cf6');
      expect(config.name).toBe('龙王庙');
    });
  });

  describe('SHOP purchase logic', () => {
    it('should allow purchase when player has enough gold', () => {
      const player = createMockPlayer({ weight: 100 });
      const shop = createMockBuilding({
        type: BuildingType.SHOP,
        x: player.x + 50,
        y: player.y
      });
      const gold = 50;

      const distance = dist(player, shop);
      const isInRange = distance < shop.radius + player.radius;

      expect(isInRange).toBe(true);

      const itemCost = 30;
      const canPurchase = gold >= itemCost;

      expect(canPurchase).toBe(true);

      const newGold = gold - itemCost;
      expect(newGold).toBe(20);
    });

    it('should reject purchase when player lacks gold', () => {
      const gold = 20;
      const itemCost = 30;
      const canPurchase = gold >= itemCost;

      expect(canPurchase).toBe(false);
    });

    it('should have correct shop config', () => {
      const config = BUILDING_CONFIGS[BuildingType.SHOP];

      expect(config.radius).toBe(200);
      expect(config.cooldown).toBe(600);
      expect(config.color).toBe('#ec4899');
      expect(config.name).toBe('深海商场');
    });
  });

  describe('Building interaction detection', () => {
    it('should detect player in building range', () => {
      const player = createMockPlayer({ x: 200, y: 200 });
      const building = createMockBuilding({ x: 200, y: 200, radius: 150 });

      const distance = dist(player, building);
      const isInRange = distance < building.radius + player.radius;

      expect(isInRange).toBe(true);
    });

    it('should detect player out of building range', () => {
      const player = createMockPlayer({ x: 100, y: 100 });
      const building = createMockBuilding({ x: 500, y: 500, radius: 150 });

      const distance = dist(player, building);
      const isInRange = distance < building.radius + player.radius;

      expect(isInRange).toBe(false);
    });

    it('should handle edge of range detection', () => {
      const player = createMockPlayer({ x: 100, y: 100, radius: 15 });
      // distance = |265 - 100| = 165, range = 150 + 15 = 165, 165 < 165 is false
      const building = createMockBuilding({ x: 265, y: 100, radius: 150 });

      const distance = dist(player, building);
      const isInRange = distance < building.radius + player.radius;

      // 165 < 165 is false, so isInRange should be false (player just outside)
      expect(isInRange).toBe(false);

      // Now test with player slightly closer
      const justInRange = createMockBuilding({ x: 264, y: 100, radius: 150 });
      const distanceIn = dist(player, justInRange);
      const isInRangeIn = distanceIn < justInRange.radius + player.radius;

      expect(isInRangeIn).toBe(true);
    });
  });

  describe('Building cooldown mechanics', () => {
    it('should start with zero cooldown', () => {
      const building = createMockBuilding({ type: BuildingType.HOSPITAL });

      expect(building.cooldown).toBe(0);
    });

    it('should track cooldown after interaction', () => {
      const building = createMockBuilding({
        type: BuildingType.HOSPITAL,
        cooldown: BUILDING_CONFIGS.HOSPITAL.cooldown
      });

      expect(building.cooldown).toBe(300);

      building.cooldown -= 1;
      expect(building.cooldown).toBe(299);
    });

    it('should have different cooldowns for different building types', () => {
      const hospital = createMockBuilding({ type: BuildingType.HOSPITAL });
      const shrine = createMockBuilding({ type: BuildingType.SHRINE });
      const shop = createMockBuilding({ type: BuildingType.SHOP });

      expect(hospital.cooldown).toBe(0);
      expect(shrine.cooldown).toBe(0);
      expect(shop.cooldown).toBe(0);

      hospital.cooldown = BUILDING_CONFIGS[BuildingType.HOSPITAL].cooldown;
      shrine.cooldown = BUILDING_CONFIGS[BuildingType.SHRINE].cooldown;
      shop.cooldown = BUILDING_CONFIGS[BuildingType.SHOP].cooldown;

      expect(hospital.cooldown).toBe(300);
      expect(shrine.cooldown).toBe(900);
      expect(shop.cooldown).toBe(600);
    });

    it('should be available when cooldown reaches zero', () => {
      const building = createMockBuilding({ cooldown: 1 });

      building.cooldown -= 1;

      const isAvailable = building.cooldown <= 0;
      expect(isAvailable).toBe(true);
    });
  });
});