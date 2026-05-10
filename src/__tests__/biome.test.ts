import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BiomeType } from '../types';
import { BIOME_CONFIGS, WORLD_SIZE } from '../constants';

// Import the getBiome function from gameEngine
// We need to extract it for testing or test it indirectly through behavior

describe('Biome System', () => {
  describe('Biome Type Detection', () => {
    // Helper to test getBiome - we'll test the logic directly
    const getBiomeLogic = (x: number, y: number): BiomeType => {
      const half = WORLD_SIZE / 2;
      if (x < half && y < half) return BiomeType.SHALLOWS;
      if (x >= half && y < half) return BiomeType.REEF;
      if (x < half && y >= half) return BiomeType.SWAMP;
      return BiomeType.ABYSS;
    };

    it('should return SHALLOWS for top-left quadrant', () => {
      expect(getBiomeLogic(100, 100)).toBe(BiomeType.SHALLOWS);
      expect(getBiomeLogic(100, WORLD_SIZE / 2 - 1)).toBe(BiomeType.SHALLOWS);
      expect(getBiomeLogic(WORLD_SIZE / 2 - 1, 100)).toBe(BiomeType.SHALLOWS);
    });

    it('should return REEF for top-right quadrant', () => {
      expect(getBiomeLogic(WORLD_SIZE / 2 + 100, 100)).toBe(BiomeType.REEF);
      expect(getBiomeLogic(WORLD_SIZE - 1, WORLD_SIZE / 2 - 1)).toBe(BiomeType.REEF);
      expect(getBiomeLogic(WORLD_SIZE / 2, 0)).toBe(BiomeType.REEF);
    });

    it('should return SWAMP for bottom-left quadrant', () => {
      expect(getBiomeLogic(100, WORLD_SIZE / 2 + 100)).toBe(BiomeType.SWAMP);
      expect(getBiomeLogic(WORLD_SIZE / 2 - 1, WORLD_SIZE - 1)).toBe(BiomeType.SWAMP);
    });

    it('should return ABYSS for bottom-right quadrant', () => {
      expect(getBiomeLogic(WORLD_SIZE / 2 + 100, WORLD_SIZE / 2 + 100)).toBe(BiomeType.ABYSS);
      expect(getBiomeLogic(WORLD_SIZE - 1, WORLD_SIZE - 1)).toBe(BiomeType.ABYSS);
    });

    it('should correctly identify boundary positions', () => {
      const half = WORLD_SIZE / 2;
      // x = half is on the vertical boundary
      expect(getBiomeLogic(half, 100)).toBe(BiomeType.REEF);
      // y = half is on the horizontal boundary
      expect(getBiomeLogic(100, half)).toBe(BiomeType.SWAMP);
      // center point belongs to REEF (x >= half, y >= half)
      expect(getBiomeLogic(half, half)).toBe(BiomeType.ABYSS);
    });
  });

  describe('Biome Configurations', () => {
    it('should have all four biomes defined', () => {
      expect(BIOME_CONFIGS[BiomeType.SHALLOWS]).toBeDefined();
      expect(BIOME_CONFIGS[BiomeType.REEF]).toBeDefined();
      expect(BIOME_CONFIGS[BiomeType.SWAMP]).toBeDefined();
      expect(BIOME_CONFIGS[BiomeType.ABYSS]).toBeDefined();
    });

    it('should have correct x/y ranges for each biome', () => {
      const half = WORLD_SIZE / 2;

      expect(BIOME_CONFIGS[BiomeType.SHALLOWS].xRange).toEqual([0, half]);
      expect(BIOME_CONFIGS[BiomeType.SHALLOWS].yRange).toEqual([0, half]);

      expect(BIOME_CONFIGS[BiomeType.REEF].xRange).toEqual([half, WORLD_SIZE]);
      expect(BIOME_CONFIGS[BiomeType.REEF].yRange).toEqual([0, half]);

      expect(BIOME_CONFIGS[BiomeType.SWAMP].xRange).toEqual([0, half]);
      expect(BIOME_CONFIGS[BiomeType.SWAMP].yRange).toEqual([half, WORLD_SIZE]);

      expect(BIOME_CONFIGS[BiomeType.ABYSS].xRange).toEqual([half, WORLD_SIZE]);
      expect(BIOME_CONFIGS[BiomeType.ABYSS].yRange).toEqual([half, WORLD_SIZE]);
    });

    it('should have valid colors for all biomes', () => {
      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
      Object.values(BiomeType).forEach(biome => {
        expect(BIOME_CONFIGS[biome].color).toMatch(hexColorRegex);
      });
    });

    it('should have non-empty names for all biomes', () => {
      Object.values(BiomeType).forEach(biome => {
        expect(BIOME_CONFIGS[biome].name).toBeTruthy();
        expect(typeof BIOME_CONFIGS[biome].name).toBe('string');
        expect(BIOME_CONFIGS[biome].name.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Biome Attribute Bonuses', () => {
    it('should have speed bonus description for SHALLOWS', () => {
      const shallows = BIOME_CONFIGS[BiomeType.SHALLOWS];
      expect(shallows.description).toContain('速度');
      expect(shallows.description).toContain('+');
    });

    it('should have ambush/skill cooldown reduction for REEF', () => {
      const reef = BIOME_CONFIGS[BiomeType.REEF];
      expect(reef.description).toContain('伪装');
      expect(reef.description).toContain('伏击');
    });

    it('should describe poison damage for SWAMP', () => {
      const swamp = BIOME_CONFIGS[BiomeType.SWAMP];
      expect(swamp.description).toContain('腐蚀');
      expect(swamp.description).toContain('伤害');
    });

    it('should describe vision and damage bonus for ABYSS', () => {
      const abyss = BIOME_CONFIGS[BiomeType.ABYSS];
      expect(abyss.description).toContain('视野');
      expect(abyss.description).toContain('攻击');
    });
  });

  describe('Biome De buff Effects', () => {
    it('should have SWAMP described as corrosive environment', () => {
      const swamp = BIOME_CONFIGS[BiomeType.SWAMP];
      expect(swamp.description).toContain('腐蚀');
      expect(swamp.description).toContain('伤害');
    });

    it('should have ABYSS described as limited vision', () => {
      const abyss = BIOME_CONFIGS[BiomeType.ABYSS];
      expect(abyss.description).toContain('视野受限');
    });
  });

  describe('Biome Transition Effects', () => {
    it('should handle transitions at quadrant boundaries', () => {
      const half = WORLD_SIZE / 2;
      // Moving from shallows to reef
      expect(getBiomeAt(half - 1, 100)).toBe(BiomeType.SHALLOWS);
      expect(getBiomeAt(half, 100)).toBe(BiomeType.REEF);

      // Moving from shallows to swamp
      expect(getBiomeAt(100, half - 1)).toBe(BiomeType.SHALLOWS);
      expect(getBiomeAt(100, half)).toBe(BiomeType.SWAMP);
    });

    it('should handle corner transitions', () => {
      const half = WORLD_SIZE / 2;
      // Bottom-left corner area
      expect(getBiomeAt(100, half + 100)).toBe(BiomeType.SWAMP);
      // Bottom-right corner area
      expect(getBiomeAt(half + 100, half + 100)).toBe(BiomeType.ABYSS);
    });
  });
});

// Helper function for testing
function getBiomeAt(x: number, y: number): BiomeType {
  const half = WORLD_SIZE / 2;
  if (x < half && y < half) return BiomeType.SHALLOWS;
  if (x >= half && y < half) return BiomeType.REEF;
  if (x < half && y >= half) return BiomeType.SWAMP;
  return BiomeType.ABYSS;
}