import { MORPHOLOGY_PARTS, MORPHOLOGY_RECIPES } from './registry';

export const validateMorphologyRegistry = (): string[] => {
  const errors: string[] = [];
  for (const [recipeId, recipe] of Object.entries(MORPHOLOGY_RECIPES)) {
    if (recipe.id !== recipeId) errors.push(`配方键 ${recipeId} 与 id ${recipe.id} 不一致`);
    if (recipe.maxVisualExtent <= 1) errors.push(`配方 ${recipeId} 的 maxVisualExtent 必须 > 1`);
    for (const [gene, range] of Object.entries(recipe.ranges)) {
      if (!range || range.length !== 2 || range[0] < 0 || range[1] > 1 || range[0] > range[1]) errors.push(`配方 ${recipeId} 的 ${gene} 范围无效`);
    }
    for (const [slot, partId] of Object.entries(recipe.requiredParts)) {
      const part = MORPHOLOGY_PARTS[partId as keyof typeof MORPHOLOGY_PARTS];
      if (!part) errors.push(`配方 ${recipeId} 引用了未知部件 ${partId}`);
      else if (part.slot !== slot) errors.push(`配方 ${recipeId} 的 ${slot} 错接到 ${part.slot}`);
    }
  }
  for (const [partId, part] of Object.entries(MORPHOLOGY_PARTS)) {
    if (part.id !== partId) errors.push(`部件键 ${partId} 与 id ${part.id} 不一致`);
    const fallback = MORPHOLOGY_PARTS[part.fallbackId as keyof typeof MORPHOLOGY_PARTS];
    if (!fallback) errors.push(`部件 ${partId} 的回退 ${part.fallbackId} 不存在`);
    else if (fallback.slot !== part.slot) errors.push(`部件 ${partId} 的回退插槽不一致`);
    if (part.boundsScale <= 0 || part.geometry.length <= 0 || part.geometry.spread <= 0) errors.push(`部件 ${partId} 的几何参数无效`);
  }
  return errors;
};

