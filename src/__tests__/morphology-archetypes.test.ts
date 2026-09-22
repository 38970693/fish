import { describe, expect, it } from 'vitest';
import { CreatureType } from '../types';
import { createEntity } from '../gameEngine';
import { clearPatternMarkCache, generatePatternMarks, getCachedPatternMarks, MORPHOLOGY_RECIPES, PATTERN_MARK_CACHE_CAPACITY, patternMarkCacheSize, resolveMorphology } from '../morphology';

describe('形态原型与程序材质', () => {
  const resolveRecipe = (recipeId: string) => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    fish.appearanceV2 = { schemaVersion: 2, recipeId, seed: 2468 };
    return resolveMorphology(fish);
  };

  it('深体、河豚、鳗形拥有不同轮廓比例和动作配置', () => {
    const deep = resolveRecipe('DEEP_BODY');
    const puffer = resolveRecipe('PUFFER');
    const eel = resolveRecipe('EEL');
    const ratio = (value: typeof deep) => (value.geometry.bounds.maxX - value.geometry.bounds.minX) / (value.geometry.bounds.maxY - value.geometry.bounds.minY);
    expect(ratio(eel)).toBeGreaterThan(ratio(deep) * 1.5);
    expect(ratio(puffer)).toBeLessThan(ratio(eel));
    expect(eel.motion.spineSections).toBe(10);
    expect(deep.signature).not.toBe(puffer.signature);
  });

  it('所有配方解析后都有限、有界且没有缺失部件', () => {
    for (const recipeId of Object.keys(MORPHOLOGY_RECIPES)) {
      const resolved = resolveRecipe(recipeId);
      expect(resolved.geometry.outline.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      expect(Object.keys(resolved.parts).length).toBeGreaterThanOrEqual(6);
      expect(resolved.geometry.bounds.radius).toBeLessThan(resolved.maxVisualExtent);
    }
  });

  it('程序花纹按种子稳定生成，换种子会变化且不越过数量预算', () => {
    const first = resolveRecipe('CLOWN_FISH');
    const repeat = resolveRecipe('CLOWN_FISH');
    const changedEntity = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    changedEntity.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed: 2469 };
    expect(generatePatternMarks(first, 24)).toEqual(generatePatternMarks(repeat, 24));
    expect(generatePatternMarks(first, 24)).not.toEqual(generatePatternMarks(resolveMorphology(changedEntity), 24));
    expect(generatePatternMarks(first, 1000)).toHaveLength(96);
  });

  it('程序材质缓存复用结果且容量始终受限', () => {
    clearPatternMarkCache();
    const first = resolveRecipe('CLOWN_FISH');
    expect(getCachedPatternMarks(first, 24)).toBe(getCachedPatternMarks(first, 24));
    for (let seed = 0; seed < PATTERN_MARK_CACHE_CAPACITY + 40; seed += 1) {
      const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
      fish.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed };
      getCachedPatternMarks(resolveMorphology(fish), 24);
    }
    expect(patternMarkCacheSize()).toBe(PATTERN_MARK_CACHE_CAPACITY);
    clearPatternMarkCache();
  });
});
