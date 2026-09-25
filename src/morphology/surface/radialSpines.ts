import { bodyHalfWidthAtX } from '../materials/patternGrammar';
import type { MorphologyPoint, ResolvedMorphology } from '../types';

/** Paired outline triangles shared by Canvas and PixiJS. */
export const buildRadialSpines = (morphology: ResolvedMorphology): readonly (readonly MorphologyPoint[])[] => {
  const layer = morphology.surfaceLayers.find(item => item.kind === 'RADIAL_SPINES');
  if (!layer) return [];
  const count = Math.max(0, Math.min(12, Math.floor(layer.count ?? 7)));
  const { minX, maxX } = morphology.geometry.bounds;
  const triangles: MorphologyPoint[][] = [];
  for (let index = 0; index < count; index += 1) {
    const x = minX + (maxX - minX) * (0.19 + index * 0.1);
    const width = bodyHalfWidthAtX(morphology.geometry.outline, x);
    for (const side of [-1, 1] as const) triangles.push([
      { x: x - 0.065, y: side * (width - 0.045) },
      { x, y: side * (width + 0.18) },
      { x: x + 0.065, y: side * (width - 0.045) },
    ]);
  }
  return triangles;
};
