import type { Cosmetics } from '../types';
import { morphologyRecipeForCreature } from './registry';
import { appearanceSeedFromString } from './seed';
import type { FishAppearanceV2, MorphologyGenes, PartSlot } from './types';

const legacyGenes = (cosmetics?: Cosmetics): Partial<MorphologyGenes> | undefined => {
  switch (cosmetics?.bodyType) {
    case 'ROUND': return { bodyLength: 0.36, bodyDepth: 0.72 };
    case 'SLENDER': return { bodyLength: 0.72, bodyDepth: 0.34 };
    case 'CHUNKY': return { bodyLength: 0.58, bodyDepth: 0.68 };
    case 'BOX': return { bodyLength: 0.55, bodyDepth: 0.55, headRatio: 0.62 };
    case 'STAR': return { bodyLength: 0.46, bodyDepth: 0.88, headRatio: 0.38, backCurve: 0.78, bellyCurve: 0.78 };
    case 'MERMAID': return { bodyLength: 0.78, bodyDepth: 0.46, headRatio: 0.7, bellyCurve: 0.62 };
    case 'EEL': return { bodyLength: 0.9, bodyDepth: 0.18 };
    case 'RAY': return { bodyLength: 0.45, bodyDepth: 0.82 };
    default: return undefined;
  }
};

const legacyParts = (cosmetics?: Cosmetics): Partial<Record<PartSlot, string>> | undefined => {
  const tailFin = cosmetics?.tailType === 'RIBBON' ? 'tail.ribbon'
    : cosmetics?.tailType === 'FAN' ? 'tail.rounded' : undefined;
  return tailFin ? { tailFin } : undefined;
};

/** 把旧装扮投影为 V2 覆盖项；旧 Cosmetics 仍保留，迁移过程可回退。 */
export const legacyCosmeticsToAppearance = (input: {
  id: string;
  type: string;
  shape?: string;
  cosmetics?: Cosmetics;
}): FishAppearanceV2 => ({
  schemaVersion: 2,
  recipeId: morphologyRecipeForCreature(input.type, input.shape),
  seed: appearanceSeedFromString(`${input.type}:${input.id}`),
  genes: legacyGenes(input.cosmetics),
  parts: legacyParts(input.cosmetics),
  material: input.cosmetics ? {
    ...(input.cosmetics.skinColor !== 'DEFAULT' ? { primaryColor: input.cosmetics.skinColor } : {}),
    patternId: input.cosmetics.pattern,
    scaleId: input.cosmetics.scaleType,
  } : undefined,
});
