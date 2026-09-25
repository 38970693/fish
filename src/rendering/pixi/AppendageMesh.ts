import type { RigSegment } from './AppendageRig';

export interface AppendageMeshData {
  vertices: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

const CAP_STEPS = 4;
const VERTICES_PER_SEGMENT = (CAP_STEPS + 1) * 2;
const INDICES_PER_SEGMENT = (VERTICES_PER_SEGMENT - 2) * 3;

/** Convert each animated round-cap stroke into a single capsule mesh. */
export const buildAppendageMeshData = (
  rigs: readonly (readonly RigSegment[])[],
  reusable?: AppendageMeshData,
): AppendageMeshData => {
  const segments = rigs.reduce((total, rig) => total + rig.length, 0);
  const vertexLength = segments * VERTICES_PER_SEGMENT * 2;
  const indexLength = segments * INDICES_PER_SEGMENT;
  const reuse = reusable?.vertices.length === vertexLength && reusable.indices.length === indexLength;
  const vertices = reuse ? reusable.vertices : new Float32Array(vertexLength);
  const uvs = reuse ? reusable.uvs : new Float32Array(vertexLength);
  const indices = reuse ? reusable.indices : new Uint32Array(indexLength);
  let segmentIndex = 0;
  for (const rig of rigs) {
    for (const segment of rig) {
      const dx = segment.to.x - segment.from.x;
      const dy = segment.to.y - segment.from.y;
      const length = Math.hypot(dx, dy) || 1;
      const directionX = dx / length;
      const directionY = dy / length;
      const normalX = -directionY;
      const normalY = directionX;
      const halfWidth = segment.width / 2;
      const vertexBase = segmentIndex * VERTICES_PER_SEGMENT;
      for (let cap = 0; cap < 2; cap += 1) {
        const center = cap === 0 ? segment.from : segment.to;
        for (let step = 0; step <= CAP_STEPS; step += 1) {
          const angle = Math.PI / 2 + (cap * CAP_STEPS + step) * Math.PI / CAP_STEPS;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const offset = (vertexBase + cap * (CAP_STEPS + 1) + step) * 2;
          vertices[offset] = center.x + (directionX * cos + normalX * sin) * halfWidth;
          vertices[offset + 1] = center.y + (directionY * cos + normalY * sin) * halfWidth;
          if (!reuse) {
            uvs[offset] = cap; uvs[offset + 1] = step / CAP_STEPS;
          }
        }
      }
      if (!reuse) {
        const indexBase = segmentIndex * INDICES_PER_SEGMENT;
        for (let triangle = 0; triangle < VERTICES_PER_SEGMENT - 2; triangle += 1) {
          const at = indexBase + triangle * 3;
          indices[at] = vertexBase;
          indices[at + 1] = vertexBase + triangle + 1;
          indices[at + 2] = vertexBase + triangle + 2;
        }
      }
      segmentIndex += 1;
    }
  }
  return { vertices, uvs, indices };
};
