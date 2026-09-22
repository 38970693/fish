import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Obstacle } from '../types';
import {
  clearObstacleAppearanceCache,
  obstacleSample,
  resolveObstacleAppearance,
} from '../rendering/obstacles/ObstacleAppearance';

const obstacle = (id: string, type: Obstacle['type'], radius = 100): Obstacle => ({ id, type, radius, x: 0, y: 0 });

afterEach(() => {
  clearObstacleAppearanceCache();
  vi.restoreAllMocks();
});

describe('obstacle appearance resolver', () => {
  it('returns the same cached appearance for a stable obstacle identity', () => {
    const source = obstacle('rock-stable', 'ROCK', 120);
    const first = resolveObstacleAppearance(source);
    const second = resolveObstacleAppearance({ id: source.id, type: source.type, radius: source.radius });

    expect(second).toBe(first);
    expect(second).toEqual(first);
  });

  it('does not consume Math.random while resolving visual variants', () => {
    const random = vi.spyOn(Math, 'random');
    resolveObstacleAppearance(obstacle('coral-no-random', 'CORAL'));
    resolveObstacleAppearance(obstacle('grass-no-random', 'SEAWEED'));
    expect(random).not.toHaveBeenCalled();
  });

  it.each([
    ['ROCK', ['BOULDER', 'STRATA', 'VOLCANIC']],
    ['CORAL', ['BRANCH', 'FAN', 'BRAIN']],
    ['SEAWEED', ['KELP', 'MEADOW', 'REED']],
  ] as const)('covers all %s variants across stable ids', (type, expected) => {
    const variants = new Set(
      Array.from({ length: 160 }, (_, index) => resolveObstacleAppearance(obstacle(`${type}-${index}`, type)).variant),
    );
    expect([...variants].sort()).toEqual([...expected].sort());
  });

  it('keeps generated normalized geometry within its visual footprint', () => {
    for (const type of ['ROCK', 'CORAL', 'SEAWEED'] as const) {
      for (let index = 0; index < 40; index += 1) {
        const appearance = resolveObstacleAppearance(obstacle(`${type}-bounds-${index}`, type));
        for (const point of appearance.silhouette) {
          expect(Math.abs(point.x)).toBeLessThanOrEqual(1.04);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(1.04);
        }
        for (const blade of appearance.blades) {
          expect(Math.abs(blade.offset)).toBeLessThanOrEqual(0.77);
          expect(blade.height).toBeLessThanOrEqual(1.11);
        }
        for (const branch of appearance.branches) expect(branch.length).toBeLessThanOrEqual(1.09);
      }
    }
  });

  it('samples deterministically and stays in the unit interval', () => {
    const values = Array.from({ length: 64 }, (_, index) => obstacleSample('sample-seed', index));
    expect(values).toEqual(Array.from({ length: 64 }, (_, index) => obstacleSample('sample-seed', index)));
    expect(values.every(value => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(55);
  });
});
