import { describe, expect, it, vi } from 'vitest';
import { CreatureType, DEFAULT_COSMETICS } from '../types';
import { createEntity } from '../gameEngine';
import {
  MORPHOLOGY_PARTS, MORPHOLOGY_RECIPES, appearanceSeedFromString, buildStandardFishGeometry,
  createAppearanceRandom, generatePatternMarks, legacyCosmeticsToAppearance, resolveMorphology,
  stableAppearanceJson,
  validateMorphologyRegistry,
} from '../morphology';

describe('鱼类形态 V2', () => {
  it('稳定种子与独立 PRNG 可复现且不读取全局随机流', () => {
    expect(appearanceSeedFromString('clown:1')).toBe(appearanceSeedFromString('clown:1'));
    expect(appearanceSeedFromString('clown:1')).not.toBe(appearanceSeedFromString('clown:2'));
    const first = createAppearanceRandom(42);
    const second = createAppearanceRandom(42);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    const globalRandom = vi.spyOn(Math, 'random');
    resolveMorphology(fish);
    expect(globalRandom).not.toHaveBeenCalled();
    globalRandom.mockRestore();
  });

  it('同一实体重复解析完全一致，不修改输入', () => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    const before = structuredClone(fish.cosmetics);
    const first = resolveMorphology(fish);
    const second = resolveMorphology(fish);
    expect(second.signature).toBe(first.signature);
    expect(second.genes).toEqual(first.genes);
    expect(fish.cosmetics).toEqual(before);
    expect(first.warnings).toEqual([]);
  });

  it('旧装扮可迁移，显式 V2 覆盖优先且基因限制在物种范围内', () => {
    const appearance = legacyCosmeticsToAppearance({
      id: 'legacy-1', type: CreatureType.CLOWN_FISH, shape: 'FISH',
      cosmetics: { ...DEFAULT_COSMETICS, bodyType: 'SLENDER', tailType: 'RIBBON', pattern: 'SPOTS' },
    });
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    fish.id = 'legacy-1';
    fish.cosmetics = { ...DEFAULT_COSMETICS };
    fish.appearanceV2 = { ...appearance, genes: { ...appearance.genes, bodyLength: 99 } };
    const resolved = resolveMorphology(fish);
    expect(resolved.recipeId).toBe('CLOWN_FISH');
    expect(resolved.genes.bodyLength).toBe(1);
    expect(resolved.parts.tailFin).toBe('tail.ribbon');
    expect(resolved.material.patternId).toBe('SPOTS');
  });

  it('未知配方和非法部件确定性回退，不产生 undefined 部件', () => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    fish.appearanceV2 = {
      schemaVersion: 2, recipeId: 'DOES_NOT_EXIST', seed: 7,
      parts: { tailFin: 'dorsal.classic' },
    };
    const resolved = resolveMorphology(fish);
    expect(resolved.recipeId).toBe('STANDARD_FISH');
    expect(resolved.parts.tailFin).toBe('tail.classic');
    expect(resolved.warnings).toHaveLength(2);
  });

  it('物种模式阻止跨标签部件，创意模式允许但给出警告', () => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    fish.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed: 5, parts: { tailFin: 'tail.tentacle-fan' } };
    expect(resolveMorphology(fish).parts.tailFin).toBe('tail.classic');
    fish.appearanceV2.mode = 'CREATIVE';
    const creative = resolveMorphology(fish);
    expect(creative.parts.tailFin).toBe('tail.tentacle-fan');
    expect(creative.warnings.join(' ')).toContain('超出物种标签');
  });

  it('星夜小丑鱼由长鳍、飘带尾和星夜材质组合，而非专属几何类型', () => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    fish.cosmetics = { ...DEFAULT_COSMETICS, rareVariant: 'STARRY_CLOWN' };
    const resolved = resolveMorphology(fish);
    expect(resolved.archetype).toBe('STANDARD_FISH');
    expect(resolved.parts).toMatchObject({
      dorsal: 'dorsal.long', pectoralLeft: 'pectoral.long',
      pectoralRight: 'pectoral.long.right', tailFin: 'tail.ribbon',
    });
    expect(resolved.material).toMatchObject({ primaryColor: '#243b80', patternId: 'STARRY_CLOWN', glow: 0.42 });
  });

  it('标准鱼几何闭合契约、边界和锚点始终有效', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
      fish.id = `geometry-${seed}`;
      const geometry = buildStandardFishGeometry(resolveMorphology(fish).genes);
      expect(geometry.outline.length).toBeGreaterThanOrEqual(20);
      expect(geometry.outline.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      const longestSegment = geometry.outline.reduce((longest, point, index, outline) => {
        const next = outline[(index + 1) % outline.length];
        return Math.max(longest, Math.hypot(next.x - point.x, next.y - point.y));
      }, 0);
      expect(longestSegment).toBeLessThan(0.6);
      expect(geometry.bounds.minX).toBeLessThan(geometry.bounds.maxX);
      expect(geometry.bounds.minY).toBeLessThan(geometry.bounds.maxY);
      expect(geometry.bounds.radius).toBeLessThan(2);
      for (const value of Object.values(geometry.anchors)) {
        expect([value.x, value.y, value.normalX, value.normalY, value.scale].every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('标准鱼轮廓、眼睛和胸鳍严格沿游动中轴镜像', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
      fish.id = `symmetry-${seed}`;
      const geometry = buildStandardFishGeometry(resolveMorphology(fish).genes);
      for (const point of geometry.outline) {
        expect(geometry.outline.some(candidate =>
          Math.abs(candidate.x - point.x) < 1e-9 && Math.abs(candidate.y + point.y) < 1e-9
        )).toBe(true);
      }
      expect(geometry.bounds.minY).toBeCloseTo(-geometry.bounds.maxY, 9);
      expect(geometry.anchors.eyeLeft.x).toBeCloseTo(geometry.anchors.eyeRight.x, 9);
      expect(geometry.anchors.eyeLeft.y).toBeCloseTo(-geometry.anchors.eyeRight.y, 9);
      expect(geometry.anchors.pectoralLeft.x).toBeCloseTo(geometry.anchors.pectoralRight.x, 9);
      expect(geometry.anchors.pectoralLeft.y).toBeCloseTo(-geometry.anchors.pectoralRight.y, 9);
      expect(geometry.anchors.dorsal.y).toBe(0);
    }
  });

  it('随机斑纹按镜像对生成，奇数数量只在中轴增加一个标记', () => {
    const morphology = resolveMorphology(createEntity(CreatureType.CLOWN_FISH, 0, 0));
    for (const count of [12, 23, 24]) {
      const marks = generatePatternMarks(morphology, count);
      expect(marks).toHaveLength(count);
      for (const mark of marks.filter(item => Math.abs(item.y) > 1e-9)) {
        expect(marks.some(candidate =>
          candidate.x === mark.x && candidate.y === -mark.y &&
          candidate.radius === mark.radius && candidate.color === mark.color && candidate.alpha === mark.alpha
        )).toBe(true);
      }
      expect(marks.filter(mark => Math.abs(mark.y) <= 1e-9)).toHaveLength(count % 2);
    }
  });

  it('注册表引用完整、部件回退存在且不成环到未知项', () => {
    expect(validateMorphologyRegistry()).toEqual([]);
    for (const recipe of Object.values(MORPHOLOGY_RECIPES)) {
      for (const partId of Object.values(recipe.requiredParts)) expect(MORPHOLOGY_PARTS).toHaveProperty(partId);
    }
    for (const part of Object.values(MORPHOLOGY_PARTS)) expect(MORPHOLOGY_PARTS).toHaveProperty(part.fallbackId);
  });

  it('稳定序列化忽略对象属性插入顺序', () => {
    expect(stableAppearanceJson({ z: 1, nested: { b: 2, a: 1 } }))
      .toBe(stableAppearanceJson({ nested: { a: 1, b: 2 }, z: 1 }));
  });
});
