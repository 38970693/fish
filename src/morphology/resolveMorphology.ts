import type { Cosmetics } from '../types';
import { buildMorphologyGeometry } from './geometry/buildGeometry';
import { MORPHOLOGY_PARTS, MORPHOLOGY_RECIPES, morphologyRecipeForCreature, type MorphologyRecipeId } from './registry';
import { appearanceSeedFromString, createAppearanceRandom, stableAppearanceJson } from './seed';
import { buildVolumeProfile, MORPHOLOGY_SURFACE_REVISION } from './surface/volumeProfile';
import { buildPatternLayers, MORPHOLOGY_PATTERN_REVISION } from './materials/patternGrammar';
import type { FishAppearanceV2, MaterialSelection, MorphologyGene, MorphologyGenes, PartDefinition, PartSlot, ResolvedMorphology } from './types';

export interface MorphologyEntityInput {
  id: string;
  type: string;
  config: { shape?: string; color: string };
  cosmetics?: Cosmetics;
  appearanceV2?: FishAppearanceV2;
}

const geneKeys = Object.keys(MORPHOLOGY_RECIPES.STANDARD_FISH.defaults) as MorphologyGene[];
const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
const round = (value: number): number => Math.round(value * 10_000) / 10_000;

const legacyGeneOverrides = (cosmetics?: Cosmetics): Partial<MorphologyGenes> => {
  switch (cosmetics?.bodyType) {
    case 'ROUND': return { bodyLength: 0.36, bodyDepth: 0.72 };
    case 'SLENDER': return { bodyLength: 0.72, bodyDepth: 0.34 };
    case 'CHUNKY': return { bodyLength: 0.58, bodyDepth: 0.68 };
    case 'BOX': return { bodyLength: 0.55, bodyDepth: 0.55, headRatio: 0.62 };
    case 'STAR': return { bodyLength: 0.46, bodyDepth: 0.88, headRatio: 0.38, backCurve: 0.78, bellyCurve: 0.78 };
    case 'MERMAID': return { bodyLength: 0.78, bodyDepth: 0.46, headRatio: 0.7, bellyCurve: 0.62 };
    case 'EEL': return { bodyLength: 0.9, bodyDepth: 0.18 };
    case 'RAY': return { bodyLength: 0.45, bodyDepth: 0.82 };
    default: return {};
  }
};

const legacyPartOverrides = (cosmetics?: Cosmetics): Partial<Record<PartSlot, string>> => {
  if (!cosmetics) return {};
  const tailFin = cosmetics.tailType === 'RIBBON' ? 'tail.ribbon'
    : cosmetics.tailType === 'FAN' ? 'tail.rounded' : undefined;
  return tailFin ? { tailFin } : {};
};

const rareOverrides = (variant: Cosmetics['rareVariant']): {
  genes: Partial<MorphologyGenes>; parts: Partial<Record<PartSlot, string>>; material: Partial<MaterialSelection>;
} => variant === 'STARRY_CLOWN'
  ? {
      genes: { dorsalFinHeight: 0.82, pectoralFinSize: 0.78, tailFork: 0.58 },
      parts: { dorsal: 'dorsal.long', pectoralLeft: 'pectoral.long', pelvicLeft: 'pelvic.ribbon', tailFin: 'tail.ribbon' },
      material: { primaryColor: '#243b80', secondaryColor: '#5be6ef', patternId: 'STARRY_CLOWN', glow: 0.42 },
    }
  : { genes: {}, parts: {}, material: {} };

const resolvePart = (
  requested: string, slot: PartSlot, allowedTags: readonly string[], warnings: string[],
  mode: NonNullable<FishAppearanceV2['mode']>
): string => {
  const part = MORPHOLOGY_PARTS[requested as keyof typeof MORPHOLOGY_PARTS];
  const tagAllowed = part?.tags.some(tag => allowedTags.includes(tag));
  if (part && part.slot === slot && (tagAllowed || mode !== 'SPECIES')) {
    if (!tagAllowed) warnings.push(`创意搭配 ${part.id} 超出物种标签范围`);
    return part.id;
  }
  const fallback = Object.values(MORPHOLOGY_PARTS).find(candidate => candidate.slot === slot && candidate.tags.some(tag => allowedTags.includes(tag)));
  if (fallback) {
    warnings.push(`部件 ${requested} 不兼容 ${slot}，已回退为 ${fallback.id}`);
    return fallback.id;
  }
  warnings.push(`插槽 ${slot} 没有可用部件`);
  return '';
};

const pairedSlots = [
  ['pectoralLeft', 'pectoralRight'],
  ['pelvicLeft', 'pelvicRight'],
] as const satisfies readonly (readonly [PartSlot, PartSlot])[];

export const resolveMorphology = (entity: MorphologyEntityInput): ResolvedMorphology => {
  const requestedRecipe = entity.appearanceV2?.recipeId ?? morphologyRecipeForCreature(entity.type, entity.config.shape);
  const recipe = MORPHOLOGY_RECIPES[requestedRecipe as MorphologyRecipeId] ?? MORPHOLOGY_RECIPES.STANDARD_FISH;
  const warnings: string[] = requestedRecipe === recipe.id ? [] : [`未知配方 ${requestedRecipe}，已回退为 ${recipe.id}`];
  const seed = entity.appearanceV2?.seed ?? appearanceSeedFromString(`${entity.type}:${entity.id}`);
  const random = createAppearanceRandom(seed);
  const legacyGenes = entity.appearanceV2 ? {} : legacyGeneOverrides(entity.cosmetics);
  const variant = rareOverrides(entity.cosmetics?.rareVariant);
  const genes = {} as MorphologyGenes;
  for (const key of geneKeys) {
    const range = recipe.ranges[key] ?? [recipe.defaults[key], recipe.defaults[key]];
    const sampled = range[0] + (range[1] - range[0]) * random();
    const explicit = entity.appearanceV2?.genes?.[key] ?? variant.genes[key] ?? legacyGenes[key];
    genes[key] = round(explicit === undefined
      ? Math.max(range[0], Math.min(range[1], clamp01(sampled)))
      : clamp01(explicit));
  }
  const parts: Partial<Record<PartSlot, string>> = {};
  const mode = entity.appearanceV2?.mode ?? 'SPECIES';
  const requestedParts = { ...recipe.requiredParts, ...(entity.appearanceV2 ? {} : legacyPartOverrides(entity.cosmetics)), ...variant.parts, ...entity.appearanceV2?.parts };
  for (const [slot, requested] of Object.entries(requestedParts) as [PartSlot, string][]) {
    const resolved = resolvePart(requested, slot, recipe.allowedTags, warnings, mode);
    if (resolved) parts[slot] = resolved;
  }
  // 配方和存档通常只保存左侧定义；解析结果始终补出严格镜像的右侧。
  for (const [leftSlot, rightSlot] of pairedSlots) {
    const leftId = parts[leftSlot];
    const rightId = parts[rightSlot];
    if (leftId) {
      const pairId = (MORPHOLOGY_PARTS[leftId as keyof typeof MORPHOLOGY_PARTS] as PartDefinition | undefined)?.pairId;
      if (pairId) {
        if (rightId && rightId !== pairId) warnings.push(`成对插槽 ${rightSlot} 已按 ${leftId} 自动镜像为 ${pairId}`);
        parts[rightSlot] = resolvePart(pairId, rightSlot, recipe.allowedTags, warnings, mode);
      }
    } else if (rightId) {
      const pairId = (MORPHOLOGY_PARTS[rightId as keyof typeof MORPHOLOGY_PARTS] as PartDefinition | undefined)?.pairId;
      if (pairId) parts[leftSlot] = resolvePart(pairId, leftSlot, recipe.allowedTags, warnings, mode);
    }
  }
  const selectedColor = entity.appearanceV2
    ? recipe.material.primaryColor
    : entity.cosmetics?.skinColor && entity.cosmetics.skinColor !== 'DEFAULT'
      ? entity.cosmetics.skinColor : entity.config.color;
  const material: MaterialSelection = {
    ...recipe.material,
    primaryColor: selectedColor,
    patternId: !entity.appearanceV2 ? entity.cosmetics?.pattern ?? recipe.material.patternId : recipe.material.patternId,
    scaleId: !entity.appearanceV2 ? entity.cosmetics?.scaleType ?? recipe.material.scaleId : recipe.material.scaleId,
    ...variant.material,
    ...entity.appearanceV2?.material,
  };
  material.glow = round(clamp01(material.glow));
  const geometry = buildMorphologyGeometry(recipe.archetype, genes);
  const surfaceLayers = recipe.surfaceLayers;
  const volume = buildVolumeProfile(geometry, genes);
  const patternLayers = buildPatternLayers(seed, material, geometry, entity.appearanceV2?.patternLayers);
  const signaturePayload = {
    v: 2, recipe: recipe.id, seed, genes, parts, material,
    surfaceLayers, patternLayers, volume, motion: recipe.motion, extent: recipe.maxVisualExtent,
  };
  return {
    schemaVersion: 2, recipeId: recipe.id, archetype: recipe.archetype, seed,
    genes: Object.freeze(genes), parts: Object.freeze(parts), material: Object.freeze(material),
    surfaceLayers, patternLayers, volume,
    motion: recipe.motion, geometry, maxVisualExtent: recipe.maxVisualExtent,
    signature: stableAppearanceJson(signaturePayload), warnings: Object.freeze(warnings),
  };
};

export const morphologyAppearanceSignature = (entity: MorphologyEntityInput): string =>
  stableAppearanceJson({
    v: 2,
    surfaceRevision: MORPHOLOGY_SURFACE_REVISION,
    patternRevision: MORPHOLOGY_PATTERN_REVISION,
    id: entity.id,
    type: entity.type,
    shape: entity.config.shape ?? 'FISH',
    appearance: entity.appearanceV2 ?? null,
  });
