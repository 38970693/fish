import { stableAppearanceJson } from '../../morphology/seed';
import { MORPHOLOGY_SURFACE_REVISION } from '../../morphology/surface/volumeProfile';

export type CreatureLod = 0 | 1 | 2;

export const LOD0_DISTANCE = 900;
export const LOD1_DISTANCE = 1800;
export const LOD_TEXTURE_CAPACITY = 64;
export const LOD_TEXTURE_BUDGET_BYTES = 32 * 1024 * 1024;

/** 远景忽略细小装扮差异，避免随机外观把活跃纹理集合撑破预算。 */
export const lod2TextureSignature = (entity: {
  type: string;
  radius?: number;
  config: { shape?: string };
  cosmetics?: { rareVariant?: string };
  appearanceV2?: { recipeId: string; seed: number; genes?: unknown; parts?: unknown; material?: unknown };
}): string => `${MORPHOLOGY_SURFACE_REVISION}|${entity.type}|${entity.config.shape ?? 'FISH'}|${entity.cosmetics?.rareVariant ?? 'normal'}|${entity.appearanceV2 ? stableAppearanceJson(entity.appearanceV2) : 'legacy'}|lod2`;

export const selectCreatureLod = (distance: number, isPlayer = false): CreatureLod => {
  if (isPlayer || distance <= LOD0_DISTANCE) return 0;
  if (distance <= LOD1_DISTANCE) return 1;
  return 2;
};

export const lodJointCount = (lod: CreatureLod, fullCount: number): number => {
  if (lod === 0) return Math.max(4, Math.min(10, fullCount));
  if (lod === 1) return Math.max(4, Math.min(6, Math.ceil(fullCount * 0.65)));
  return 0;
};

export interface TextureBudgetEntry {
  key: string;
  bytes: number;
  lastUsed: number;
}

/** 返回应淘汰的最旧未使用键；活跃键始终受到保护。 */
export const pickTextureEvictions = (
  entries: readonly TextureBudgetEntry[],
  activeKeys: ReadonlySet<string>,
  capacity = LOD_TEXTURE_CAPACITY,
  byteBudget = LOD_TEXTURE_BUDGET_BYTES
): string[] => {
  let count = entries.length;
  let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const candidates = entries.filter(entry => !activeKeys.has(entry.key)).sort((a, b) => a.lastUsed - b.lastUsed);
  const evictions: string[] = [];
  for (const entry of candidates) {
    if (count <= capacity && bytes <= byteBudget) break;
    evictions.push(entry.key);
    count -= 1;
    bytes -= entry.bytes;
  }
  return evictions;
};
