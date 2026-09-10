/**
 * 兼容门面 —— 把拆分后的 data/ 层聚合回原来的导入路径。
 *
 * 这样 GameCanvas / UIOverlay / MiniMap / 测试文件里原有的
 * `import { CREATURES, WORLD_SIZE, ... } from '../constants'` 依然可用，
 * 一次重构不用连带改动十几个文件。
 *
 * 新代码请直接按需从 data/ 对应模块导入，语义更清楚。
 */

export * from './data/world';
export * from './data/creatures';
export * from './data/biomes';
export * from './data/skills';
export * from './data/buildings';

import { BIOME_DATA, BIOME_BOUNDS, BiomeType } from './data/biomes';
import { PHRASES } from './data/world';

/**
 * 旧结构：小地图与 UI 仍在用 name / color / description / xRange / yRange。
 * 由 BIOME_DATA + BIOME_BOUNDS 合成，保持字段完全一致。
 */
export const BIOME_CONFIGS = Object.fromEntries(
  (Object.keys(BIOME_DATA) as BiomeType[]).map((key) => [
    key,
    { ...BIOME_DATA[key], ...BIOME_BOUNDS[key] },
  ])
) as Record<
  BiomeType,
  { name: string; color: string; description: string; xRange: [number, number]; yRange: [number, number] }
>;

/** 旧导出：瘦子集台词，现统一由 PHRASES 管理 */
export const SKINNY_PHRASES = PHRASES.SKINNY;
