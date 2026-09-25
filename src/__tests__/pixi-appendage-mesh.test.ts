import { describe, expect, it } from 'vitest';
import { buildAppendageRig, type AppendageRigSpec } from '../rendering/pixi/AppendageRig';
import { buildAppendageMeshData } from '../rendering/pixi/AppendageMesh';

const rigSpec: AppendageRigSpec = {
  rootX: -0.42, rootY: 0.1, direction: Math.PI, length: 2.2, joints: 8,
  baseWidth: 0.18, tipWidth: 0.045, amplitude: 0.38, waveCycles: 0.7,
  phaseOffset: 0, velocityInfluence: 0.34, maxExtent: 2.55,
};

describe('Pixi 附肢网格', () => {
  it('每条附肢保持独立索引，全部坐标有限并落在原始关节附近', () => {
    const first = buildAppendageRig(rigSpec, { radius: 80, phase: 0.3, transverseVelocity: 0 });
    const second = buildAppendageRig({ ...rigSpec, rootY: -0.1 }, { radius: 80, phase: 0.3, transverseVelocity: 0 });
    const data = buildAppendageMeshData([first, second]);
    expect(data.vertices).toHaveLength((first.length + second.length) * 10 * 2);
    expect(data.indices).toHaveLength((first.length + second.length) * 8 * 3);
    expect([...data.vertices].every(Number.isFinite)).toBe(true);
    expect([...data.indices].every(index => index < data.vertices.length / 2)).toBe(true);
    const firstLast = first.length * 10 - 1;
    const secondFirst = first.length * 10;
    for (let offset = 0; offset < data.indices.length; offset += 3) {
      const triangle = [...data.indices.slice(offset, offset + 3)];
      expect(triangle.some(index => index <= firstLast) && triangle.some(index => index >= secondFirst)).toBe(false);
    }
  });

  it('相同关节数复用缓冲，动作改变时顶点随之更新', () => {
    const before = buildAppendageRig(rigSpec, { radius: 80, phase: 0, transverseVelocity: 0 });
    const after = buildAppendageRig(rigSpec, { radius: 80, phase: 1.8, transverseVelocity: 0.8 });
    const mesh = buildAppendageMeshData([before]);
    const verticesBefore = [...mesh.vertices];
    const reused = buildAppendageMeshData([after], mesh);
    expect(reused.vertices).toBe(mesh.vertices);
    expect(reused.indices).toBe(mesh.indices);
    expect([...reused.vertices]).not.toEqual(verticesBefore);
  });
});
