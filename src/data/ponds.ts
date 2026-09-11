/**
 * 鱼塘注册表 —— 「多鱼塘」阶段 1：开局选塘。
 *
 * ┌──────────┬──────────┬──────────┐
 * │ CLEAR    │  CORAL   │  ABYSS   │
 * │ 清水塘(1) │ 珊瑚塘(2) │ 深渊塘(3) │   难度递增、得分倍率递增、越危险食物越少
 * └──────────┴──────────┴──────────┘
 *
 * 阶段 1 的「塘」只影响**开局参数**，不动世界结构（地图尺寸/形状/生态布局仍是全局的）：
 *   - maxTierBonus    刷怪 tier 上限加成（危险塘更早出大鱼）
 *   - foodRatio       刷浮游生物的概率（安全塘喂饱你，危险塘让你自己去抢）
 *   - scoreMult       得分倍率（风险补偿）
 *   - signatureBiome  本塘主生态区（菜单展示 + 开局提示文案）
 *
 * 出生点仍固定在花瓣地图中心 (3000,3000)，与既有约定一致 —— 阶段 1 不改位置。
 * 阶段 2 再把 worldSize / 地图形状 / 生态布局搬进这张表，实现「塘际传送门」。
 * 加一个新塘：POND_DATA 里加一条即可，类型、菜单、刷怪、计分全部自动生效。
 */

import type { BiomeType } from './biomes';

export interface PondConfig {
  name: string;
  color: string;
  description: string;
  /** 难度档位（1 新手 / 2 进阶 / 3 高手），用于 UI 排序与提示 */
  difficulty: 1 | 2 | 3;
  /** 刷怪 tier 上限加成：maxTier = clamp(等级算出的值 + 该值, 1, 4) */
  maxTierBonus: number;
  /** 刷浮游生物（食物）的概率，越高越安全 */
  foodRatio: number;
  /** 得分倍率：越危险的塘分数越肥 */
  scoreMult: number;
  /** 本塘主生态区（展示 / 开局提示用） */
  signatureBiome: BiomeType;
}

export const POND_DATA = {
  CLEAR: {
    name: '清水塘',
    color: '#38bdf8',
    description: '风平浪静，小鱼成群。新手友好，得分低调。',
    difficulty: 1,
    maxTierBonus: 0,
    foodRatio: 0.4,
    scoreMult: 1,
    signatureBiome: 'SHALLOWS',
  },
  CORAL: {
    name: '珊瑚塘',
    color: '#2dd4bf',
    description: '礁石密布，中大型鱼出没。得分 1.5 倍。',
    difficulty: 2,
    maxTierBonus: 1,
    foodRatio: 0.3,
    scoreMult: 1.5,
    signatureBiome: 'REEF',
  },
  ABYSS: {
    name: '深渊塘',
    color: '#6366f1',
    description: '巨物横行，视野昏暗。得分 2.5 倍，敢来就有。',
    difficulty: 3,
    maxTierBonus: 2,
    foodRatio: 0.2,
    scoreMult: 2.5,
    signatureBiome: 'ABYSS',
  },
} as const;

/** 鱼塘 ID 联合类型：从数据自动推导，加数据即加类型 */
export type PondId = keyof typeof POND_DATA;

/**
 * 常量对象：让 `PondId.CLEAR` 这种写法可用（与 BiomeType 同款模式，
 * 原来是 enum 的写法改数据后不用再手改枚举）。
 */
export const PondId = Object.freeze(
  Object.fromEntries(Object.keys(POND_DATA).map((k) => [k, k]))
) as { readonly [K in PondId]: K };

/** 默认塘（旧调用点不传塘时的兜底，保证行为向后兼容） */
export const DEFAULT_POND: PondId = 'CLEAR';

/** 按 ID 取塘配置，未知 ID 一律回退默认塘 —— 绝不返回 undefined */
export const getPond = (id?: string | null): PondConfig =>
  (POND_DATA as Record<string, PondConfig>)[id ?? ''] ?? POND_DATA[DEFAULT_POND];

/**
 * 计分：统一走这里过一遍塘倍率。
 * 所有 `state.score += X` 都应改成 `state.score += scoreGain(state.pondId, X)`，
 * 免得同一次改动漏掉某处导致分数对不上。
 */
export const scoreGain = (pondId: string | null | undefined, base: number): number =>
  base <= 0 ? 0 : Math.max(1, Math.round(base * getPond(pondId).scoreMult));

/** 按难度升序的塘列表，供菜单渲染 */
export const POND_LIST: Array<{ id: PondId; config: PondConfig }> = (
  Object.keys(POND_DATA) as PondId[]
)
  .map((id) => ({ id, config: POND_DATA[id] as PondConfig }))
  .sort((a, b) => a.config.difficulty - b.config.difficulty);
