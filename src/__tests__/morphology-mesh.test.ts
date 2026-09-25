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

  it('头部基本固定，尾部随相位和转向对称伸缩', () => {
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

  it('不同相位、速度和转向下，所有截面仍关于鱼体水平轴上下对称', () => {
    for (const type of [CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG, CreatureType.KOI, CreatureType.PUFFER_FISH, CreatureType.GREAT_WHITE]) {
      const fish = resolveMorphology(createEntity(type, 0, 0));
      for (const [phase, speed, turn] of [[0, 0, 0], [1.2, 1, 0.65], [3.4, 1.5, -1]]) {
        for (const lod of [0, 1] as const) {
          const data = buildSpineMeshData(fish, 80, phase, speed, turn, lod);
          for (let index = 0; index < data.joints; index += 1) {
            const offset = index * 4;
            expect(data.vertices[offset + 1]).toBeCloseTo(-data.vertices[offset + 3], 5);
          }
        }
      }
    }
  });

  it('复用静态截面宽度不改变动画顶点，形态切换会使缓存失效', () => {
    const first = buildSpineMeshData(morphology, 80, 0, 1, 0, 0);
    const reused = buildSpineMeshData(morphology, 80, 1.3, 0.7, -0.4, 0, first);
    const fresh = buildSpineMeshData(morphology, 80, 1.3, 0.7, -0.4, 0);
    expect([...reused.vertices]).toEqual([...fresh.vertices]);
    expect(reused.halfWidths).toBe(first.halfWidths);

    const koi = resolveMorphology(createEntity(CreatureType.KOI, 0, 0));
    const switched = buildSpineMeshData(koi, 80, 1.3, 0.7, -0.4, 0, reused);
    const freshKoi = buildSpineMeshData(koi, 80, 1.3, 0.7, -0.4, 0);
    expect([...switched.vertices]).toEqual([...freshKoi.vertices]);
    expect(switched.halfWidths).not.toBe(reused.halfWidths);
  });
});
