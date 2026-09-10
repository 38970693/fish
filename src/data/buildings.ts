/**
 * 建筑注册表 —— 纯数据。
 *
 * 加一座新建筑：在 BUILDING_DATA 加一条 + 在 BUILDING_SPAWN_RULES 加一条生成规则，
 * 交互效果在 systems/world.ts 的 BUILDING_EFFECTS 里补一条。
 */

import type { BiomeType } from './biomes';

export const BUILDING_DATA = {
  HOSPITAL: { name: '深海急救站', color: '#ef4444', radius: 150, cooldown: 300 },
  SHRINE: { name: '龙王庙', color: '#8b5cf6', radius: 150, cooldown: 900 },
  SHOP: { name: '深海商场', color: '#ec4899', radius: 200, cooldown: 600 },
} as const;

export type BuildingType = keyof typeof BUILDING_DATA;

export const BuildingType = Object.freeze(
  Object.fromEntries(Object.keys(BUILDING_DATA).map((k) => [k, k]))
) as { readonly [K in BuildingType]: K };

/** 建筑在哪些生态区、各生成几座 */
export const BUILDING_SPAWN_RULES: Array<{ type: BuildingType; biome: BiomeType; count: number }> = [
  { type: 'HOSPITAL', biome: 'SHALLOWS', count: 1 },
  { type: 'HOSPITAL', biome: 'REEF', count: 1 },
  { type: 'SHRINE', biome: 'SWAMP', count: 1 },
  { type: 'SHRINE', biome: 'REEF', count: 1 },
];
