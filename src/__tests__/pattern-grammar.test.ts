import { describe, expect, it } from 'vitest';
import { CreatureType, DEFAULT_COSMETICS } from '../types';
import { createEntity } from '../gameEngine';
import {
  bodyHalfWidthAtX,
  circleInsidePolygon,
  PATTERN_SAMPLE_MATERIALS,
  pointInPolygon,
  resolveMorphology,
  type MorphologyGenes,
} from '../morphology';

const clown = (seed = 20260921, rare = false) => {
  const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
  fish.id = `pattern-${seed}-${rare}`;
  fish.cosmetics = { ...DEFAULT_COSMETICS, ...(rare ? { rareVariant: 'STARRY_CLOWN' as const } : {}) };
  fish.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed };
  return fish;
};

describe('V3-03 共享花纹语法', () => {
  it('普通与星夜小丑鱼解析为共享条带/星点层且固定种子完全稳定', () => {
    const normal = resolveMorphology(clown());
    const starry = resolveMorphology(clown(20260921, true));
    expect(normal.patternLayers.map(layer => layer.kind)).toEqual(['BANDS']);
    expect(starry.patternLayers.map(layer => layer.kind)).toEqual(['BANDS', 'SPOTS']);
    expect(resolveMorphology(clown()).patternLayers).toEqual(normal.patternLayers);
    expect(resolveMorphology(clown(20260921, true)).patternLayers).toEqual(starry.patternLayers);
    expect(normal.patternLayers.every(layer => layer.primitives.length > 0)).toBe(true);
  });

  it('星点完整落在真实鱼体轮廓中并严格镜像', () => {
    const morphology = resolveMorphology(clown(77, true));
    const spots = morphology.patternLayers.find(layer => layer.kind === 'SPOTS');
    expect(spots).toBeDefined();
    const circles = spots!.primitives.filter(primitive => primitive.kind === 'CIRCLE');
    for (const circle of circles) {
      expect(circleInsidePolygon({ x: circle.x, y: circle.y }, circle.radius, morphology.geometry.outline)).toBe(true);
      if (Math.abs(circle.y) > 1e-9) {
        expect(circles.some(candidate => candidate.kind === 'CIRCLE'
          && candidate.x === circle.x && candidate.y === -circle.y && candidate.radius === circle.radius)).toBe(true);
      }
    }
  });

  it('20 个不同极值组合的器官根部在真实轮廓内，条带端点不越过截面', () => {
    const keys = [
      'bodyLength', 'bodyDepth', 'headRatio', 'bellyCurve', 'backCurve', 'snoutLength',
      'tailPeduncle', 'dorsalFinHeight', 'pectoralFinSize', 'tailFork', 'eyeScale', 'eyeSpacing',
    ] as const satisfies readonly (keyof MorphologyGenes)[];
    const signatures = new Set<string>();
    for (let sample = 0; sample < 20; sample += 1) {
      const genes = Object.fromEntries(keys.map((key, index) => [key, ((sample >> (index % 5)) & 1)])) as Partial<MorphologyGenes>;
      const fish = clown(sample);
      fish.appearanceV2 = { ...fish.appearanceV2!, genes };
      const morphology = resolveMorphology(fish);
      signatures.add(JSON.stringify(morphology.genes));
      for (const anchor of [
        morphology.geometry.anchors.pectoralLeft, morphology.geometry.anchors.pectoralRight,
        morphology.geometry.anchors.pelvicLeft, morphology.geometry.anchors.pelvicRight,
      ]) expect(pointInPolygon(anchor, morphology.geometry.outline)).toBe(true);
      for (const layer of morphology.patternLayers) {
        for (const primitive of layer.primitives.filter(item => item.kind === 'BAND')) {
          expect(primitive.height).toBeLessThanOrEqual(bodyHalfWidthAtX(morphology.geometry.outline, primitive.x));
        }
      }
    }
    expect(signatures.size).toBe(20);
  });

  it('图元预算和 LOD 身份层有硬上限', () => {
    const morphology = resolveMorphology(clown(91, true));
    expect(morphology.patternLayers.length).toBeLessThanOrEqual(3);
    expect(morphology.patternLayers.flatMap(layer => layer.primitives)).toHaveLength(26);
    expect(morphology.patternLayers.some(layer => layer.lodPriority <= 1)).toBe(true);
    expect(morphology.patternLayers.flatMap(layer => layer.primitives).length).toBeLessThanOrEqual(48);
  });

  it.each([
    ['CLOWN_BANDS', ['BANDS']],
    ['STARRY_CLOWN', ['BANDS', 'SPOTS']],
    ['RING_SPOTS', ['SPOTS']],
    ['LATERAL_DOTS', ['LATERAL']],
    ['EDGE_TRIM', ['EDGE']],
    ['FLOW_SCALES', ['SCALES']],
  ])('固定样板 %s 解析为 %j 且不改变轮廓', (patternId, kinds) => {
    const fish = clown(101);
    fish.appearanceV2!.material = { patternId };
    const resolved = resolveMorphology(fish);
    const baseline = resolveMorphology(clown(101));
    expect(resolved.patternLayers.map(layer => layer.kind)).toEqual(kinds);
    expect(resolved.patternLayers.flatMap(layer => layer.primitives).length).toBeGreaterThan(0);
    expect(resolved.geometry).toEqual(baseline.geometry);
  });

  it('侧向点列、轮廓线和流线鳞片使用不同的共享图元', () => {
    const primitiveKinds = ['LATERAL_DOTS', 'EDGE_TRIM', 'FLOW_SCALES'].map(patternId => {
      const fish = clown(2026);
      fish.appearanceV2!.material = { patternId };
      return new Set(resolveMorphology(fish).patternLayers.flatMap(layer => layer.primitives.map(item => item.kind)));
    });
    expect(primitiveKinds).toEqual([new Set(['CIRCLE']), new Set(['PATH']), new Set(['ELLIPSE'])]);
  });

  it('逐层开关、顺序、密度、尺度和颜色在解析阶段生效', () => {
    const fish = clown(303, true);
    fish.appearanceV2!.patternLayers = [
      { id: 'starry-bands', order: 2, color: '#ff00aa', scale: 1.4 },
      { id: 'starry-spots', order: 1, density: 0.5 },
    ];
    const resolved = resolveMorphology(fish);
    expect(resolved.patternLayers.map(layer => layer.id)).toEqual(['starry-spots', 'starry-bands']);
    expect(resolved.patternLayers[0].primitives).toHaveLength(13);
    expect(resolved.patternLayers[1].primitives.every(primitive => primitive.color === '#ff00aa')).toBe(true);
    const band = resolved.patternLayers[1].primitives[0];
    expect(band.kind === 'BAND' && band.width).toBeCloseTo(0.14 * 1.4);
    fish.appearanceV2!.patternLayers = [{ id: 'starry-bands', enabled: false }];
    expect(resolveMorphology(fish).patternLayers.map(layer => layer.id)).toEqual(['starry-spots']);
  });

  it('层种子只重排目标随机层，JSON 往返后签名和图元一致', () => {
    const fish = clown(404, false);
    fish.appearanceV2!.material = { ...PATTERN_SAMPLE_MATERIALS.STARRY_CLOWN };
    const base = resolveMorphology(fish);
    fish.appearanceV2!.patternLayers = [{ id: 'starry-spots', seedOffset: 17, symmetry: 'ASYMMETRIC' }];
    const changed = resolveMorphology(fish);
    expect(changed.patternLayers.find(layer => layer.id === 'starry-bands'))
      .toEqual(base.patternLayers.find(layer => layer.id === 'starry-bands'));
    expect(changed.patternLayers.find(layer => layer.id === 'starry-spots')?.primitives)
      .not.toEqual(base.patternLayers.find(layer => layer.id === 'starry-spots')?.primitives);
    expect(changed.patternLayers.find(layer => layer.id === 'starry-spots')?.symmetry).toBe('ASYMMETRIC');
    const imported = clown(0, false);
    imported.appearanceV2 = JSON.parse(JSON.stringify(fish.appearanceV2));
    const roundTrip = resolveMorphology(imported);
    expect(roundTrip.signature).toBe(changed.signature);
    expect(roundTrip.patternLayers).toEqual(changed.patternLayers);
  });
});
