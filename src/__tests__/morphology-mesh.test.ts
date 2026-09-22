import { describe, expect, it } from 'vitest';
import { CreatureType } from '../types';
import { createEntity } from '../gameEngine';
import { resolveMorphology } from '../morphology';
import { buildSpineMeshData } from '../rendering/pixi/MorphologyMesh';

describe('参数化鱼体柔性网格', () => {
  const morphology = resolveMorphology(createEntity(CreatureType.CLOWN_FISH, 0, 0));

  it('LOD0 使用完整脊柱，LOD1 减段，LOD2 不创建顶点', () => {
    const near = buildSpineMeshData(morphology, 40, 0, 1, 0, 0);
    const middle = buildSpineMeshData(morphology, 40, 0, 1, 0, 1);
    const far = buildSpineMeshData(morphology, 40, 0, 1, 0, 2);
    expect(near.joints).toBe(morphology.motion.spineSections);
    expect(middle.joints).toBeLessThan(near.joints);
    expect(far.vertices).toHaveLength(0);
    expect(near.indices).toHaveLength((near.joints - 1) * 6);
  });

  it('头部基本固定，尾部随相位和转向产生更大位移', () => {
    const base = buildSpineMeshData(morphology, 100, 0, 1, 0, 0);
    const moved = buildSpineMeshData(morphology, 100, 1.4, 1, 0.8, 0);
    const headDelta = Math.abs(moved.vertices[1] - base.vertices[1]);
    const tailOffset = moved.vertices.length - 3;
    const tailDelta = Math.abs(moved.vertices[tailOffset] - base.vertices[tailOffset]);
    expect(headDelta).toBeLessThan(0.001);
    expect(tailDelta).toBeGreaterThan(5);
  });

  it('极端输入仍只产生有限坐标且保持视觉范围', () => {
    for (const phase of [0, 10, 1000]) {
      const data = buildSpineMeshData(morphology, 80, phase, 99, -99, 0);
      expect([...data.vertices].every(Number.isFinite)).toBe(true);
      expect(Math.max(...[...data.vertices].map(Math.abs))).toBeLessThan(80 * morphology.maxVisualExtent);
    }
  });

  it('每个脊柱截面的两侧始终以弯曲中线镜像', () => {
    const data = buildSpineMeshData(morphology, 80, 1.2, 1, 0.65, 0);
    for (let index = 0; index < data.joints; index += 1) {
      const offset = index * 4;
      const center = (data.vertices[offset + 1] + data.vertices[offset + 3]) * 0.5;
      expect(data.vertices[offset + 1] - center).toBeCloseTo(-(data.vertices[offset + 3] - center), 5);
    }
  });
});
