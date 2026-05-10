import { describe, it, expect } from 'vitest';
import {
  WORLD_SIZE,
  MAX_ENTITIES,
  BOOST_CONFIG,
  METEOR_CONFIG,
  AMBUSH_CONFIG,
  TREASURE_CONFIG,
  PORTAL_CONFIG,
  MAP_SHAPE_CONFIG,
  GAME_MECHANICS,
} from '../constants';

describe('Constants - World Configuration', () => {
  it('should have valid WORLD_SIZE', () => {
    expect(WORLD_SIZE).toBeGreaterThan(0);
    expect(WORLD_SIZE).toBe(6000);
  });

  it('should have valid MAX_ENTITIES', () => {
    expect(MAX_ENTITIES).toBeGreaterThan(0);
    expect(MAX_ENTITIES).toBeLessThanOrEqual(200);
  });
});

describe('Constants - Boost Configuration', () => {
  it('should have valid max energy', () => {
    expect(BOOST_CONFIG.MAX_ENERGY).toBeGreaterThan(0);
  });

  it('should have valid speed multiplier', () => {
    expect(BOOST_CONFIG.SPEED_MULTIPLIER).toBeGreaterThan(1);
  });

  it('should have valid drain rate', () => {
    expect(BOOST_CONFIG.DRAIN_RATE).toBeGreaterThan(0);
  });

  it('should have valid regen rate', () => {
    expect(BOOST_CONFIG.REGEN_RATE).toBeGreaterThan(0);
  });
});

describe('Constants - Meteor Configuration', () => {
  it('should have valid meteor interval', () => {
    expect(METEOR_CONFIG.INTERVAL).toBeGreaterThan(0);
  });

  it('should have valid warning time', () => {
    expect(METEOR_CONFIG.WARNING_TIME).toBeGreaterThan(0);
    expect(METEOR_CONFIG.WARNING_TIME).toBeLessThan(METEOR_CONFIG.INTERVAL);
  });

  it('should have valid radius', () => {
    expect(METEOR_CONFIG.RADIUS).toBeGreaterThan(0);
  });

  it('should have valid safe size', () => {
    expect(METEOR_CONFIG.SAFE_SIZE).toBeGreaterThan(0);
  });
});

describe('Constants - Ambush Configuration', () => {
  it('should have valid detection range', () => {
    expect(AMBUSH_CONFIG.DETECTION_RANGE_MIN).toBeGreaterThan(0);
    expect(AMBUSH_CONFIG.DETECTION_RANGE_MAX).toBeGreaterThan(AMBUSH_CONFIG.DETECTION_RANGE_MIN);
  });

  it('should have valid back angle threshold', () => {
    expect(AMBUSH_CONFIG.BACK_ANGLE_THRESHOLD).toBeGreaterThan(0);
    expect(AMBUSH_CONFIG.BACK_ANGLE_THRESHOLD).toBeLessThanOrEqual(Math.PI);
  });

  it('should have valid back damage multiplier', () => {
    expect(AMBUSH_CONFIG.BACK_DAMAGE_MULT).toBeGreaterThan(1);
  });

  it('should have valid eat probability rules', () => {
    expect(AMBUSH_CONFIG.EAT_PROBABILITY).toBeDefined();
    expect(AMBUSH_CONFIG.EAT_PROBABILITY.DOUBLE_OR_MORE).toBeDefined();
    expect(AMBUSH_CONFIG.EAT_PROBABILITY.SIMILAR).toBeDefined();
  });
});

describe('Constants - Treasure Configuration', () => {
  it('should have valid treasure spawn interval', () => {
    expect(TREASURE_CONFIG.SPAWN_INTERVAL).toBeGreaterThan(0);
  });

  it('should have valid warning duration', () => {
    expect(TREASURE_CONFIG.WARNING_DURATION).toBeGreaterThan(0);
    expect(TREASURE_CONFIG.WARNING_DURATION).toBeLessThan(TREASURE_CONFIG.SPAWN_INTERVAL);
  });

  it('should have valid radius', () => {
    expect(TREASURE_CONFIG.RADIUS).toBeGreaterThan(0);
  });

  it('should have valid mass reward', () => {
    expect(TREASURE_CONFIG.MASS_REWARD).toBeGreaterThan(0);
  });
});

describe('Constants - Portal Configuration', () => {
  it('should have portal config defined', () => {
    expect(PORTAL_CONFIG).toBeDefined();
    expect(PORTAL_CONFIG.RADIUS).toBeGreaterThan(0);
  });

  it('should have valid colors', () => {
    expect(PORTAL_CONFIG.COLORS).toBeDefined();
    expect(PORTAL_CONFIG.COLORS.length).toBeGreaterThan(0);
  });
});

describe('Constants - Map Shape Configuration', () => {
  it('should have valid center coordinates', () => {
    expect(MAP_SHAPE_CONFIG.CENTER_X).toBeGreaterThan(0);
    expect(MAP_SHAPE_CONFIG.CENTER_Y).toBeGreaterThan(0);
  });

  it('should have valid base radius', () => {
    expect(MAP_SHAPE_CONFIG.BASE_RADIUS).toBeGreaterThan(0);
  });

  it('should have valid petal variance', () => {
    expect(MAP_SHAPE_CONFIG.PETAL_VARIANCE).toBeGreaterThanOrEqual(0);
    expect(MAP_SHAPE_CONFIG.PETAL_VARIANCE).toBeLessThan(MAP_SHAPE_CONFIG.BASE_RADIUS);
  });
});

describe('Constants - Game Mechanics', () => {
  it('should have valid turn speed', () => {
    expect(GAME_MECHANICS.BASE_TURN_SPEED).toBeGreaterThan(0);
  });

  it('should have valid size agility penalty', () => {
    expect(GAME_MECHANICS.SIZE_AGILITY_PENALTY).toBeGreaterThan(0);
  });

  it('should have valid max radius', () => {
    expect(GAME_MECHANICS.MAX_RADIUS).toBeGreaterThan(0);
  });

  it('should have valid ambush settings', () => {
    expect(GAME_MECHANICS.AMBUSH_BONUS_FRAMES).toBeGreaterThan(0);
    expect(GAME_MECHANICS.AMBUSH_DAMAGE_MULT).toBeGreaterThan(1);
  });
});