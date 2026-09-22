import type { CreatureType } from './creatures';

export const RARE_VARIANT_DATA = {
  STARRY_CLOWN: {
    name: '星夜小丑鱼',
    creatureType: 'CLOWN_FISH',
    spawnChance: 0.04,
    color: '#5be6ef',
    description: '深靛蓝鱼身上有珠光条纹与星点，只在清水塘的小丑鱼中偶尔出现。',
  },
} as const;

export type RareVariantId = keyof typeof RARE_VARIANT_DATA;

/** 从既有实体 ID 派生独立随机值，不额外消耗玩法 Math.random 序列。 */
export const rareVariantRollFromId = (id: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
};

export const rollRareVariant = (
  creatureType: CreatureType,
  roll = Math.random()
): RareVariantId | undefined => {
  for (const [id, config] of Object.entries(RARE_VARIANT_DATA) as Array<[
    RareVariantId,
    (typeof RARE_VARIANT_DATA)[RareVariantId],
  ]>) {
    if (config.creatureType === creatureType && roll < config.spawnChance) return id;
  }
  return undefined;
};

export const getCreatureDisplayName = (entity: {
  config: { name: string };
  cosmetics?: { rareVariant?: RareVariantId };
}): string => {
  const variant = entity.cosmetics?.rareVariant;
  return variant ? RARE_VARIANT_DATA[variant].name : entity.config.name;
};
