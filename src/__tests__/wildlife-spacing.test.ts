import { describe, it, expect } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { createEntity, isWildlifeSpawnSpaced, spawnCreature, spawnCreatureNearPlayer, spawnSystem } from '../systems/spawn';
import { withSeededRandom } from '../test/scenario';
import type { FrameContext } from '../types';

describe('自然补刷的留白', () => {
  it('自然补刷不再把全图填到 300 条，队员和敌队不占自然鱼预算', () => {
    for (const mode of ['LEGACY', 'RIVALS'] as const) {
      const s = createInitialState({ mode, skipWorldGen: true });
      withSeededRandom(11, () => { for (let i = 0; i < 500; i++) spawnSystem(s, {} as FrameContext); });
      expect(s.entities.length).toBe(120);
      s.entities[0].health = 0;
      s.entities.push({ ...createEntity('CLOWN_FISH', 3600, 3600), ownerId: 'player' });
      withSeededRandom(18, () => { for (let i = 0; i < 20; i++) spawnSystem(s, {} as FrameContext); });
      expect(s.entities.filter(e => e.health > 0 && !e.ownerId)).toHaveLength(120);
    }
  });
  it('拒绝贴脸和密集点，死鱼不占密度预算', () => {
    const s = createInitialState({ mode: 'LEGACY', skipWorldGen: true });
    s.player.x = 3000; s.player.y = 3000;
    expect(isWildlifeSpawnSpaced(s, 3020, 3000, 6)).toBe(false);
    s.entities = Array.from({ length: 7 }, (_, i) => createEntity('CLOWN_FISH',
      2000 + Math.cos(i) * 180, 2000 + Math.sin(i) * 180));
    expect(isWildlifeSpawnSpaced(s, 2000, 2000, 6)).toBe(false);
    s.entities[0].health = 0;
    expect(isWildlifeSpawnSpaced(s, 2000, 2000, 6)).toBe(true);
  });
  it('全图与附近的补刷都保持实体间距，不影响脚本实体工厂', () => {
    for (const near of [false, true]) {
      const s = createInitialState({ mode: 'LEGACY', skipWorldGen: true });
      withSeededRandom(28, () => {
        for (let i = 0; i < 80; i++) (near ? spawnCreatureNearPlayer : spawnCreature)(s, 'CLOWN_FISH');
      });
      expect(s.entities.length).toBeGreaterThan(30);
      expect(s.entities.every(e => e.naturalSpawn)).toBe(true);
      for (const entity of s.entities) {
        for (const other of s.entities.filter(e => e !== entity))
          expect(Math.hypot(entity.x - other.x, entity.y - other.y)).toBeGreaterThanOrEqual(entity.radius + other.radius + 50);
      }
      expect(createEntity('CLOWN_FISH', 0, 0).x).toBe(0);
    }
  });
});
