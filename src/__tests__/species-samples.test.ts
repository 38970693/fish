import { describe, expect, it } from 'vitest';
import { createEntity } from '../gameEngine';
import {
  MORPHOLOGY_PARTS,
  morphologyRecipeForCreature,
  resolveMorphology,
  usesMorphologyFishRenderer,
  buildRadialSpines,
  type PartDefinition,
} from '../morphology';
import { CreatureType, DEFAULT_COSMETICS } from '../types';

describe('V3-05A 蓝唐王鱼与锦鲤物种样板', () => {
  const resolveSpecies = (type: typeof CreatureType.BLUE_TANG | typeof CreatureType.KOI) => {
    const entity = createEntity(type, 0, 0);
    entity.cosmetics = { ...DEFAULT_COSMETICS };
    entity.appearanceV2 = { schemaVersion: 2, recipeId: type, seed: 20260922 };
    return resolveMorphology(entity);
  };

  it('FISH 形态会自动选择各自的物种配方', () => {
    expect(morphologyRecipeForCreature(CreatureType.BLUE_TANG, 'FISH')).toBe('BLUE_TANG');
    expect(morphologyRecipeForCreature(CreatureType.KOI, 'FISH')).toBe('KOI');
    const tang = createEntity(CreatureType.BLUE_TANG, 0, 0);
    const koi = createEntity(CreatureType.KOI, 0, 0);
    tang.cosmetics = { ...DEFAULT_COSMETICS };
    koi.cosmetics = { ...DEFAULT_COSMETICS };
    expect(resolveMorphology(tang).recipeId).toBe('BLUE_TANG');
    expect(resolveMorphology(koi).recipeId).toBe('KOI');
  });

  it('去掉颜色后仍能靠体型与鳍组区分两个样板', () => {
    const tang = resolveSpecies(CreatureType.BLUE_TANG);
    const koi = resolveSpecies(CreatureType.KOI);

    expect(tang.genes.bodyDepth).toBeGreaterThan(koi.genes.bodyDepth + 0.08);
    expect(koi.genes.bodyLength).toBeGreaterThan(tang.genes.bodyLength + 0.08);
    expect(tang.parts.pectoralLeft).toBe('pectoral.sickle');
    expect(koi.parts.tailFin).toBe('tail.ribbon');
    expect(tang.material.patternId).toBe('EDGE_TRIM');
    expect(koi.material.patternId).toBe('RING_SPOTS');
  });

  it.each([CreatureType.BLUE_TANG, CreatureType.KOI])('%s 的胸鳍与腹鳍保持严格左右镜像', type => {
    const morphology = resolveSpecies(type);
    for (const family of ['pectoral', 'pelvic'] as const) {
      const left = MORPHOLOGY_PARTS[morphology.parts[`${family}Left`] as keyof typeof MORPHOLOGY_PARTS] as PartDefinition;
      const right = MORPHOLOGY_PARTS[morphology.parts[`${family}Right`] as keyof typeof MORPHOLOGY_PARTS] as PartDefinition;
      expect(left.pairId).toBe(right.id);
      expect(right.pairId).toBe(left.id);
      expect(left.geometry).toEqual(right.geometry);
      expect(morphology.geometry.anchors[`${family}Left`].x).toBeCloseTo(morphology.geometry.anchors[`${family}Right`].x, 9);
      expect(morphology.geometry.anchors[`${family}Left`].y).toBeCloseTo(-morphology.geometry.anchors[`${family}Right`].y, 9);
    }
  });
});

describe('V3-05B 河豚与大白鲨共享形态迁移', () => {
  it('只迁移目标物种，保留其他特殊形状入口', () => {
    expect(usesMorphologyFishRenderer('PUFFER_FISH', 'PUFFER')).toBe(true);
    expect(usesMorphologyFishRenderer('GREAT_WHITE', 'SHARK')).toBe(true);
    expect(usesMorphologyFishRenderer('GOBLIN_SHARK', 'SHARK')).toBe(false);
    expect(usesMorphologyFishRenderer('TURTLE', 'TURTLE')).toBe(false);
    expect(morphologyRecipeForCreature('PUFFER_FISH', 'PUFFER')).toBe('PUFFER');
    expect(morphologyRecipeForCreature('GREAT_WHITE', 'SHARK')).toBe('GREAT_WHITE');
  });

  it.each([CreatureType.PUFFER_FISH, CreatureType.GREAT_WHITE])('%s 轮廓及器官严格镜像', type => {
    const entity = createEntity(type, 0, 0);
    entity.cosmetics = { ...DEFAULT_COSMETICS };
    const morphology = resolveMorphology(entity);
    expect(morphology.recipeId).not.toBe('STANDARD_FISH');
    // Cute shark styling uses two softer gill marks (shared by Canvas and Pixi).
    if (type === CreatureType.GREAT_WHITE) expect(morphology.surfaceLayers.find(layer => layer.kind === 'GILL')?.count).toBe(2);
    if (type === CreatureType.PUFFER_FISH) {
      const spines = buildRadialSpines(morphology);
      expect(spines).toHaveLength(14);
      for (let index = 0; index < spines.length; index += 2) {
        expect(spines[index + 1].map(point => point.y)).toEqual(spines[index].map(point => -point.y));
      }
    }
    const { outline, anchors } = morphology.geometry;
    for (const point of outline) expect(outline.some(pair => pair.x === point.x && pair.y === -point.y)).toBe(true);
    for (const family of ['pectoral', 'pelvic'] as const) {
      expect(anchors[`${family}Left`].x).toBeCloseTo(anchors[`${family}Right`].x, 9);
      expect(anchors[`${family}Left`].y).toBeCloseTo(-anchors[`${family}Right`].y, 9);
      const left = MORPHOLOGY_PARTS[morphology.parts[`${family}Left`] as keyof typeof MORPHOLOGY_PARTS] as PartDefinition;
      const right = MORPHOLOGY_PARTS[morphology.parts[`${family}Right`] as keyof typeof MORPHOLOGY_PARTS] as PartDefinition;
      expect(left.geometry).toEqual(right.geometry);
    }
  });
});

describe('V3-05C 五类物种灰度身份', () => {
  it('固定同色、同种子、无花纹后仍有五种不同轮廓与器官布局', () => {
    const identities = [
      CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG, CreatureType.KOI,
      CreatureType.PUFFER_FISH, CreatureType.GREAT_WHITE,
    ].map(type => {
      const entity = createEntity(type, 0, 0);
      entity.cosmetics = { ...DEFAULT_COSMETICS };
      entity.appearanceV2 = {
        schemaVersion: 2, recipeId: morphologyRecipeForCreature(type, entity.config.shape), seed: 20260923,
        material: { primaryColor: '#999999', secondaryColor: '#999999', patternId: 'NONE', scaleId: 'NONE', glow: 0 },
      };
      const morphology = resolveMorphology(entity);
      expect(morphology.material.primaryColor).toBe('#999999');
      expect(morphology.patternLayers).toHaveLength(0);
      return JSON.stringify({ outline: morphology.geometry.outline, parts: morphology.parts, spines: buildRadialSpines(morphology) });
    });
    expect(new Set(identities).size).toBe(5);
  });
});
