import { describe, expect, it } from 'vitest';
import { buildAppendageRig, rigMaxDistance, type AppendageRigSpec } from '../rendering/pixi/AppendageRig';

const krakenSpec: AppendageRigSpec = {
  rootX: -0.35, rootY: 0, direction: Math.PI, length: 2.2, joints: 8,
  baseWidth: 0.18, tipWidth: 0.045, amplitude: 0.38, waveCycles: 0.72,
  phaseOffset: 0, velocityInfluence: 0.35, maxExtent: 2.55,
};

describe('Pixi AppendageRig', () => {
  it('使用 4～10 个关节并由粗到细', () => {
    const segments = buildAppendageRig({ ...krakenSpec, joints: 8 }, { radius: 100, phase: 0.5, transverseVelocity: 0 });
    expect(segments).toHaveLength(8);
    expect(segments[0].width).toBeGreaterThan(segments.at(-1)!.width);
    expect(buildAppendageRig({ ...krakenSpec, joints: 99 }, { radius: 100, phase: 0, transverseVelocity: 0 })).toHaveLength(10);
    expect(buildAppendageRig({ ...krakenSpec, joints: 1 }, { radius: 100, phase: 0, transverseVelocity: 0 })).toHaveLength(4);
  });

  it('任何相位和速度下都不超过 maxExtent', () => {
    for (const phase of [0, 1.2, 4.7, 12]) {
      for (const velocity of [-4, -1, 0, 1, 5]) {
        const segments = buildAppendageRig(krakenSpec, { radius: 120, phase, transverseVelocity: velocity });
        expect(rigMaxDistance(segments)).toBeLessThanOrEqual(120 * krakenSpec.maxExtent + 0.001);
      }
    }
  });

  it('速度惯性只逐渐影响末端，根节点保持不动', () => {
    const still = buildAppendageRig(krakenSpec, { radius: 80, phase: 0.8, transverseVelocity: 0 });
    const moving = buildAppendageRig(krakenSpec, { radius: 80, phase: 0.8, transverseVelocity: 1 });
    expect(moving[0].from).toEqual(still[0].from);
    const firstDelta = Math.hypot(moving[0].to.x - still[0].to.x, moving[0].to.y - still[0].to.y);
    const tipDelta = Math.hypot(moving.at(-1)!.to.x - still.at(-1)!.to.x, moving.at(-1)!.to.y - still.at(-1)!.to.y);
    expect(tipDelta).toBeGreaterThan(firstDelta * 4);
  });
});
