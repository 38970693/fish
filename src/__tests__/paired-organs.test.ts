import { describe, expect, it } from 'vitest';
import { CreatureType } from '../types';
import { createEntity } from '../gameEngine';
import { MORPHOLOGY_PARTS, MORPHOLOGY_RECIPES, resolveMorphology, type MorphologyGenes, type PartDefinition, type PartSlot } from '../morphology';

describe('V3-02 成对器官与表面部件', () => {
  const resolveWith = (seed: number, parts: Partial<Record<PartSlot, string>> = {}, genes?: Partial<MorphologyGenes>) => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    fish.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed, parts, genes };
    return resolveMorphology(fish);
  };

  it('配方只保存左侧定义，解析器自动生成胸鳍和腹鳍右侧镜像', () => {
    for (const recipe of Object.values(MORPHOLOGY_RECIPES)) {
      expect(recipe.requiredParts).not.toHaveProperty('pectoralRight');
      expect(recipe.requiredParts).not.toHaveProperty('pelvicRight');
    }
    const morphology = resolveWith(20260922);
    expect(morphology.parts).toMatchObject({
      pectoralLeft: 'pectoral.classic', pectoralRight: 'pectoral.classic.right',
      pelvicLeft: 'pelvic.round', pelvicRight: 'pelvic.round.right',
    });
  });

  it.each([
    ['pectoral.classic', 'pelvic.round'],
    ['pectoral.sickle', 'pelvic.sickle'],
    ['pectoral.long', 'pelvic.ribbon'],
  ])('短圆/镰刀/飘带组 %s + %s 只注册左侧也会得到严格镜像', (pectoral, pelvic) => {
    const morphology = resolveWith(7, { pectoralLeft: pectoral, pelvicLeft: pelvic });
    for (const [leftSlot, rightSlot] of [
      ['pectoralLeft', 'pectoralRight'], ['pelvicLeft', 'pelvicRight'],
    ] as const) {
      const left = MORPHOLOGY_PARTS[morphology.parts[leftSlot] as keyof typeof MORPHOLOGY_PARTS] as PartDefinition;
      const right = MORPHOLOGY_PARTS[morphology.parts[rightSlot] as keyof typeof MORPHOLOGY_PARTS] as PartDefinition;
      expect(left.pairId).toBe(right.id);
      expect(right.pairId).toBe(left.id);
      expect(right.geometry).toEqual(left.geometry);
    }
  });

  it('显式写入不匹配右侧时确定性纠正并记录警告', () => {
    const morphology = resolveWith(8, {
      pectoralLeft: 'pectoral.sickle',
      pectoralRight: 'pectoral.long.right',
    });
    expect(morphology.parts.pectoralRight).toBe('pectoral.sickle.right');
    expect(morphology.warnings.join('\n')).toContain('自动镜像');
  });

  it('20 个极值样本中根部不悬空、左右锚点镜像且部件不越过视觉预算', () => {
    const geneKeys: (keyof MorphologyGenes)[] = [
      'bodyLength', 'bodyDepth', 'headRatio', 'bellyCurve', 'backCurve', 'snoutLength',
      'tailPeduncle', 'dorsalFinHeight', 'pectoralFinSize', 'tailFork', 'eyeScale', 'eyeSpacing',
    ];
    for (let seed = 0; seed < 20; seed += 1) {
      const genes = Object.fromEntries(geneKeys.map((key, index) => [key, (seed + index) % 2])) as Partial<MorphologyGenes>;
      const morphology = resolveWith(seed, { pectoralLeft: 'pectoral.long', pelvicLeft: 'pelvic.ribbon' }, genes);
      for (const family of ['pectoral', 'pelvic'] as const) {
        const leftAnchor = morphology.geometry.anchors[`${family}Left`];
        const rightAnchor = morphology.geometry.anchors[`${family}Right`];
        expect(leftAnchor.x).toBeCloseTo(rightAnchor.x, 9);
        expect(leftAnchor.y).toBeCloseTo(-rightAnchor.y, 9);
        expect(Math.abs(leftAnchor.y)).toBeLessThan(morphology.geometry.bounds.maxY);
        const leftPart = MORPHOLOGY_PARTS[morphology.parts[`${family}Left`] as keyof typeof MORPHOLOGY_PARTS];
        const extent = Math.hypot(leftAnchor.x, leftAnchor.y) + leftPart.geometry.length * leftAnchor.scale;
        expect(extent).toBeLessThan(morphology.maxVisualExtent);
        expect(leftPart.geometry.rootWidth).toBeGreaterThan(0);
        expect(leftPart.geometry.blendDepth).toBeGreaterThan(0);
      }
    }
  });

  it('鳃盖、侧线和鼻孔都是镜像表面语义', () => {
    const layers = resolveWith(9).surfaceLayers;
    for (const kind of ['GILL', 'LATERAL_LINE', 'NOSTRIL'] as const) {
      expect(layers.find(layer => layer.kind === kind)).toMatchObject({ symmetry: 'MIRROR' });
    }
  });
});
