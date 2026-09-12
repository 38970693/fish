/**
 * 建筑注册表 —— 纯数据。
 *
 * 加一座新建筑：在 BUILDING_DATA 加一条 + 在 BUILDING_SPAWN_RULES 加一条生成规则，
 * 交互效果在 systems/world.ts 的 BUILDING_EFFECTS 里补一条；
 * 另有两处登记渲染信息：data/world.ts 的 BUILDING_CONFIGS（游戏内画圈/冷却）
 * 与 MiniMap 的 BUILDING_LABELS / BUILDING_COLORS（小地图标识）。
 *
 * 「多鱼塘」阶段 3a：规则可以带 `pond` 塘限定 —— 只在指定塘生成（特产建筑）。
 */

import type { BiomeType } from './biomes';
import type { PondId } from './ponds';

export const BUILDING_DATA = {
  HOSPITAL: { name: '深海急救站', color: '#ef4444', radius: 150, cooldown: 300 },
  SHRINE: { name: '龙王庙', color: '#8b5cf6', radius: 150, cooldown: 900 },
  SHOP: { name: '深海商场', color: '#ec4899', radius: 200, cooldown: 600 },
  // ── 塘特产建筑（阶段 3a）──
  WISHING_WELL: { name: '许愿池', color: '#f59e0b', radius: 130, cooldown: 1200 },
  PEARL_FARM: { name: '珍珠养殖场', color: '#cbd5e1', radius: 140, cooldown: 900 },
  SHIPWRECK: { name: '沉船残骸', color: '#92400e', radius: 170, cooldown: 1500 },
} as const;

export type BuildingType = keyof typeof BUILDING_DATA;

export const BuildingType = Object.freeze(
  Object.fromEntries(Object.keys(BUILDING_DATA).map((k) => [k, k]))
) as { readonly [K in BuildingType]: K };

/** 建筑在哪些生态区、各生成几座；`pond` 给了就只在那个塘生成（特产建筑） */
export interface BuildingSpawnRule {
  type: BuildingType;
  biome: BiomeType;
  count: number;
  /** 塘限定：缺省 = 全塘生成 */
  pond?: PondId;
}

export const BUILDING_SPAWN_RULES: BuildingSpawnRule[] = [
  { type: 'HOSPITAL', biome: 'SHALLOWS', count: 1 },
  { type: 'HOSPITAL', biome: 'REEF', count: 1 },
  { type: 'SHRINE', biome: 'SWAMP', count: 1 },
  { type: 'SHRINE', biome: 'REEF', count: 1 },
  // ── 每塘一座特产建筑（阶段 3a）──
  { type: 'WISHING_WELL', biome: 'SHALLOWS', count: 1, pond: 'CLEAR' },
  { type: 'PEARL_FARM', biome: 'REEF', count: 1, pond: 'CORAL' },
  { type: 'SHIPWRECK', biome: 'ABYSS', count: 1, pond: 'ABYSS' },
];
