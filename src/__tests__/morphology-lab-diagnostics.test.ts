import { describe, expect, it } from 'vitest';
import { CreatureType } from '../types';
import { createEntity } from '../gameEngine';
import { resolveMorphology } from '../morphology';
import { measureMorphologySymmetry } from '../morphology/labDiagnostics';

describe('形态实验室镜像诊断', () => {
  it('五类标准鱼的轮廓与成对插槽误差为零', () => {
    for (const type of [CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG, CreatureType.KOI, CreatureType.PUFFER_FISH, CreatureType.GREAT_WHITE]) {
      const metrics = measureMorphologySymmetry(resolveMorphology(createEntity(type, 0, 0)));
      expect(metrics.outlineError).toBeLessThan(0.00001);
      expect(metrics.anchorError).toBeLessThan(0.00001);
      expect(metrics.pairedSlots).toHaveLength(2);
      expect(metrics.pairedSlots.every(pair => pair.mirrored)).toBe(true);
    }
  });

  it('单侧轮廓或插槽偏移会报告非零误差', () => {
    const morphology = resolveMorphology(createEntity(CreatureType.CLOWN_FISH, 0, 0));
    const outline = morphology.geometry.outline.map(point => ({ ...point }));
    outline[2].y -= 0.1;
    const anchors = { ...morphology.geometry.anchors, pectoralLeft: { ...morphology.geometry.anchors.pectoralLeft, y: morphology.geometry.anchors.pectoralLeft.y - 0.2 } };
    const metrics = measureMorphologySymmetry({ ...morphology, geometry: { ...morphology.geometry, outline, anchors } });
    expect(metrics.outlineError).toBeGreaterThan(0.09);
    expect(metrics.anchorError).toBeGreaterThan(0.19);
    expect(metrics.pairedSlots.find(pair => pair.name === '胸鳍')?.mirrored).toBe(false);
  });
});
