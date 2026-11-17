import type { ResolvedMorphology } from '../../morphology';
import { lodJointCount, type CreatureLod } from './CreatureLod';

export interface SpineMeshData {
  joints: number;
  vertices: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  morphology?: ResolvedMorphology;
  halfWidths?: Float32Array;
}

const interpolateCurve = (curve: readonly number[], t: number): number => {
  const position = Math.max(0, Math.min(1, t)) * (curve.length - 1);
  const index = Math.min(curve.length - 2, Math.floor(position));
  const fraction = position - index;
  return curve[index] + (curve[index + 1] - curve[index]) * fraction;
};

const widthAt = (morphology: ResolvedMorphology, x: number): { top: number; bottom: number } => {
  const intersections: number[] = [];
  const points = morphology.geometry.outline;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]; const b = points[(index + 1) % points.length];
    if ((a.x <= x && b.x >= x) || (b.x <= x && a.x >= x)) {
      const dx = b.x - a.x;
      if (Math.abs(dx) < 1e-8) { intersections.push(a.y, b.y); continue; }
      const ratio = (x - a.x) / dx;
      if (ratio >= 0 && ratio <= 1) intersections.push(a.y + (b.y - a.y) * ratio);
    }
  }
  if (intersections.length < 2) return { top: -0.05, bottom: 0.05 };
  return { top: Math.min(...intersections), bottom: Math.max(...intersections) };
};

/** 为 Pixi MeshSimple 生成可更新的双边脊柱条带。头部稳定，摆幅向尾部递增。 */
export const buildSpineMeshData = (
  morphology: ResolvedMorphology,
  radius: number,
  phase: number,
  speedRatio: number,
  turn: number,
  lod: CreatureLod,
  reusable?: SpineMeshData
): SpineMeshData => {
  const joints = lodJointCount(lod, morphology.motion.spineSections);
  if (joints === 0) return { joints: 0, vertices: new Float32Array(), uvs: new Float32Array(), indices: new Uint32Array() };
  const { minX, maxX } = morphology.geometry.bounds;
  const canReuse = reusable?.joints === joints;
  const reuseWidths = canReuse && reusable?.morphology === morphology && reusable.halfWidths?.length === joints;
  const halfWidths = reuseWidths ? reusable.halfWidths! : new Float32Array(joints);
  const vertices = canReuse ? reusable.vertices : new Float32Array(joints * 4);
  const uvs = canReuse ? reusable.uvs : new Float32Array(joints * 4);
  const indices = canReuse ? reusable.indices : new Uint32Array((joints - 1) * 6);
  for (let index = 0; index < joints; index += 1) {
    // 将已有截面向头尾加密，圆头不再被等距三角条带削成折角。
    const fromHead = (1 - Math.cos(index / (joints - 1) * Math.PI)) * 0.5;
    const x = maxX + (minX - maxX) * fromHead;
    if (!reuseWidths) {
      const width = widthAt(morphology, x);
      // 即使载入的是迁移前的非对称轮廓，柔性网格也维持俯视双侧等宽。
      halfWidths[index] = (Math.abs(width.top) + Math.abs(width.bottom)) * 0.5;
    }
    const amplitude = interpolateCurve(morphology.motion.amplitudeCurve, fromHead);
    const movement = 0.35 + Math.max(0, Math.min(1.5, speedRatio)) * 0.65;
    const wave = Math.sin(phase - fromHead * Math.PI * 1.7) * morphology.motion.tailAmplitude * amplitude * movement;
    const bend = Math.max(-1, Math.min(1, turn)) * morphology.motion.turnBend * fromHead * fromHead;
    // 保留尾部游动节奏，但上下两侧始终绕鱼体中线同步伸缩。
    const halfWidth = halfWidths[index] * Math.max(0.55, 1 + wave + bend);
    const offset = index * 4;
    vertices[offset] = x * radius; vertices[offset + 1] = -halfWidth * radius;
    vertices[offset + 2] = x * radius; vertices[offset + 3] = halfWidth * radius;
    if (!canReuse) {
      uvs[offset] = 1 - fromHead; uvs[offset + 1] = 0;
      uvs[offset + 2] = 1 - fromHead; uvs[offset + 3] = 1;
    }
    if (!canReuse && index < joints - 1) {
      const vertex = index * 2; const at = index * 6;
      indices.set([vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2], at);
    }
  }
  return { joints, vertices, uvs, indices, morphology, halfWidths };
};
