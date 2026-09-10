/**
 * 生态区注册表 —— 纯数据，零业务依赖。
 *
 * ┌─────────────┬─────────────┐
 * │  SHALLOWS   │    REEF     │   浅滩(左上) / 珊瑚(右上)
 * ├─────────────┼─────────────┤
 * │   SWAMP     │   ABYSS     │   沼泽(左下) / 深渊(右下)
 * └─────────────┴─────────────┘
 *
 * 加一个新生态区：在 BIOME_DATA 加一条 + 在 BIOME_EFFECTS 加一条即可，
 * 其余（小地图配色、生成分布、加成结算）全部自动生效。
 */

import { WORLD_SIZE } from './world';

export const BIOME_DATA = {
  SHALLOWS: {
    name: '阳光浅滩',
    color: '#0ea5e9',
    description: '安全区域。小型鱼速度+20%。',
  },
  REEF: {
    name: '五彩珊瑚',
    color: '#2dd4bf',
    description: '地形复杂。伪装/伏击技能冷却减半。巨型鱼转向变慢。',
  },
  SWAMP: {
    name: '剧毒沼泽',
    color: '#3f6212',
    description: '持续腐蚀伤害！抗毒生物回血翻倍。',
  },
  ABYSS: {
    name: '深渊海沟',
    color: '#0f172a',
    description: '视野受限。发光/感知型生物攻击+20%。',
  },
} as const;

/** 生态区 ID 联合类型：从数据自动推导，加数据即加类型 */
export type BiomeType = keyof typeof BIOME_DATA;

/**
 * 常量对象：让 `BiomeType.SHALLOWS` 这种写法继续可用。
 * （原来是 enum，改成从数据生成后，加生态区不用再手动改 enum）
 */
export const BiomeType = Object.freeze(
  Object.fromEntries(Object.keys(BIOME_DATA).map((k) => [k, k]))
) as { readonly [K in BiomeType]: K };

/** 每个生态区的实际效果 —— 由 systems/world.ts 每帧结算 */
export interface BiomeEffect {
  /** 速度加成倍率（仅对 tier <= speedBonusMaxTier 的生物生效） */
  speedMult: number;
  speedBonusMaxTier: number;
  /** 技能冷却倍率，0.5 = 冷却减半 */
  skillCooldownMult: number;
  /** 每帧腐蚀伤害（0 = 无），按最大生命比例扣 */
  corrosionPerFrame: number;
  /** 视野倍率，<1 表示视野受限 */
  visionMult: number;
  /** 伤害倍率 */
  damageMult: number;
  /** 该区是否让大鱼转向变慢 */
  bigFishTurnPenalty: number;
}

export const BIOME_EFFECTS: Record<BiomeType, BiomeEffect> = {
  SHALLOWS: {
    speedMult: 1.2,
    speedBonusMaxTier: 1,
    skillCooldownMult: 1,
    corrosionPerFrame: 0,
    visionMult: 1,
    damageMult: 1,
    bigFishTurnPenalty: 0,
  },
  REEF: {
    speedMult: 1,
    speedBonusMaxTier: 0,
    skillCooldownMult: 0.5,
    corrosionPerFrame: 0,
    visionMult: 1,
    damageMult: 1,
    bigFishTurnPenalty: 0.3,
  },
  SWAMP: {
    speedMult: 1,
    speedBonusMaxTier: 0,
    skillCooldownMult: 1,
    corrosionPerFrame: 0.0008,
    visionMult: 1,
    damageMult: 1,
    bigFishTurnPenalty: 0,
  },
  ABYSS: {
    speedMult: 1,
    speedBonusMaxTier: 0,
    skillCooldownMult: 1,
    corrosionPerFrame: 0,
    visionMult: 0.6,
    damageMult: 1.2,
    bigFishTurnPenalty: 0,
  },
};

/** 兼容旧结构：小地图与 UI 仍在用 xRange/yRange */
export const BIOME_BOUNDS: Record<BiomeType, { xRange: [number, number]; yRange: [number, number] }> = {
  SHALLOWS: { xRange: [0, WORLD_SIZE / 2], yRange: [0, WORLD_SIZE / 2] },
  REEF: { xRange: [WORLD_SIZE / 2, WORLD_SIZE], yRange: [0, WORLD_SIZE / 2] },
  SWAMP: { xRange: [0, WORLD_SIZE / 2], yRange: [WORLD_SIZE / 2, WORLD_SIZE] },
  ABYSS: { xRange: [WORLD_SIZE / 2, WORLD_SIZE], yRange: [WORLD_SIZE / 2, WORLD_SIZE] },
};
