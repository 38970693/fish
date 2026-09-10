/**
 * AI 鱼随机装扮生成器 —— 让鱼群不再是「千人一面」。
 *
 * 设计目标：**热闹但不荧光**。
 *   - 大部分鱼保持种族本色（skinColor 用 'DEFAULT'，渲染层回落到 config.color），
 *     保证每种鱼的整体色调可辨识；
 *   - 一部分鱼穿上「深海系」邻近色，制造个体差异；
 *   - 花纹 / 鳞片 / 配饰按体型档位加权：大鱼更气派，小鱼更朴素；
 *   - 凶猛鱼（damage 高）更容易长獠牙和怒眉，外观暗示战斗力；
 *   - bodyType 变形最稀有 —— 全场都是奇形怪状反而乱。
 *
 * 纯函数：不读全局状态、不改传入对象，方便测试与将来做「鱼苗基因遗传」。
 */

import { DEFAULT_COSMETICS, type Cosmetics } from '../types';
import type { CreatureConfig } from './creatures';

/** 深海系和谐色板：低荧光、高饱和度的马卡龙色，和 any 本色都不打架 */
const OCEAN_PALETTE = [
  '#5eead4', '#67e8f9', '#7dd3fc', '#93c5fd', '#a5b4fc', '#c4b5fd',
  '#f9a8d4', '#fda4af', '#fdba74', '#fcd34d', '#86efac', '#e2e8f0',
] as const;

const PATTERNS = ['STRIPES', 'SPOTS', 'TIGER', 'DOTS', 'ZEBRA', 'LEOPARD', 'HEART', 'STAR', 'LIGHTNING'] as const;
const SCALES = ['SHINY', 'CRYSTAL', 'MOSAIC', 'SLIME'] as const;
const FIERCE_TEETH = ['SHARP', 'VAMPIRE', 'SABER', 'CURVED'] as const;
const SOFT_TEETH = ['BRACES', 'GAPPED', 'BUGS'] as const;
const EYES = ['ANIME', 'DERP', 'CAT', 'LOVE', 'HYPNO'] as const;
const SOFT_BROWS = ['SAD', 'CONFUSED', 'THICK'] as const;
const ACCESSORIES = ['GOLD_CHAIN', 'PEARL_NECKLACE', 'SUNGLASSES', 'SCARF', 'FLOWER', 'HEADPHONES'] as const;
const FANCY_ACCESSORIES = ['CROWN', 'DIAMOND_RING', 'MEDAL', 'HALO'] as const;
const TAILS = ['CRESCENT', 'FORKED', 'FAN', 'RIBBON'] as const;
const BODIES = ['ROUND', 'SLENDER', 'CHUNKY'] as const;
const MOUTHS = ['CIRCLE', 'SQUARE', 'BEAK', 'CURVE'] as const;
const TRAILS = ['BUBBLES', 'RAINBOW', 'FIRE', 'GLITTER', 'HEARTS', 'ELECTRIC', 'SLIME'] as const;

const chance = (p: number): boolean => Math.random() < p;
const pickOne = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * 生成一条 AI 鱼的随机装扮。
 * 磷虾（tier 0）太小，装扮画不出来也看不见，直接保持默认。
 */
export const randomizeCosmetics = (config: CreatureConfig): Cosmetics => {
  if (config.tier <= 0) return { ...DEFAULT_COSMETICS };

  const tier = config.tier; // 1 小鱼 ~ 4 霸主
  const fierce = config.damage >= 12;

  // 大鱼更有排面：配饰与花纹概率随档位提升
  const fancyRate = tier >= 3 ? 0.22 : tier === 2 ? 0.12 : 0.06;
  const patternRate = tier >= 3 ? 0.3 : tier === 2 ? 0.2 : 0.1;

  return {
    teeth: chance(fierce ? 0.45 : 0.08)
      ? pickOne(fierce ? FIERCE_TEETH : SOFT_TEETH)
      : 'NORMAL',
    // 62% 保持种族本色，38% 换邻近色 —— 群体色调统一，个体五彩斑斓
    skinColor: chance(0.62) ? 'DEFAULT' : pickOne(OCEAN_PALETTE),
    pattern: chance(patternRate) ? pickOne(PATTERNS) : 'NONE',
    scaleType: chance(0.15) ? pickOne(SCALES) : 'NONE',
    accessory: chance(fancyRate) ? pickOne(tier >= 3 ? FANCY_ACCESSORIES : ACCESSORIES) : 'NONE',
    tailType: chance(0.12) ? pickOne(TAILS) : 'DEFAULT',
    bodyType: chance(0.08) ? pickOne(BODIES) : 'DEFAULT',
    mouthType: chance(0.15) ? pickOne(MOUTHS) : 'TRIANGLE',
    eyeType: chance(0.12) ? pickOne(EYES) : 'NORMAL',
    eyebrowType: chance(fierce ? 0.35 : 0.12) ? pickOne(fierce ? ['ANGRY'] : SOFT_BROWS) : 'NONE',
    // 尾迹最稀有（5%）：游过拖出彩虹 / 火焰 / 电弧等特效，是鱼群里最靓的仔
    trailType: chance(0.05) ? pickOne(TRAILS) : 'NONE',
  };
};
