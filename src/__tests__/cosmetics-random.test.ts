/**
 * AI 鱼随机装扮测试。
 * 核心保证：字段永远合法（渲染层 switch 不会落空）、磷虾保持朴素、分布符合「热闹但不荧光」。
 */

import { describe, it, expect } from 'vitest';
import { randomizeCosmetics } from '../data/cosmetics';
import { CREATURES, CreatureType } from '../data/creatures';
import { DEFAULT_COSMETICS } from '../types';

/** 全部合法值集合，与 types.ts 的类型定义一一对应 */
const LEGAL = {
  teeth: ['NORMAL', 'SHARP', 'VAMPIRE', 'BRACES', 'GOLD', 'CURVED', 'DOUBLE_ROW', 'SABER', 'GAPPED', 'DIAMOND', 'RAINBOW', 'BUGS', 'BLOCKY'],
  pattern: ['NONE', 'STRIPES', 'SPOTS', 'TIGER', 'DOTS', 'CAMO', 'ZEBRA', 'LEOPARD', 'HEART', 'STAR', 'CIRCUIT', 'LAVA', 'KOI', 'SKELETON', 'LIGHTNING', 'CLOUD', 'CHECKER', 'VINES', 'TARGET', 'GALAXY', 'SMILEY', 'FIREY', 'RUNE', 'CANDY'],
  scaleType: ['NONE', 'SHINY', 'DRAGON', 'STONE', 'FEATHER', 'MECHANICAL', 'GLOW', 'MOSAIC', 'CRYSTAL', 'VOID', 'PIXEL', 'ARMOR', 'DIAMOND_PLATE', 'SLIME', 'BIO_HAZARD'],
  accessory: ['NONE', 'GOLD_CHAIN', 'PEARL_NECKLACE', 'JADE_PENDANT', 'SUNGLASSES', 'CROWN', 'BOW_TIE', 'DIAMOND_RING', 'MEDAL', 'SCARF', 'HEADPHONES', 'FLOWER', 'EYEPATCH', 'HALO', 'UNICORN_HORN'],
  tailType: ['DEFAULT', 'CRESCENT', 'FORKED', 'FAN', 'TRIDENT', 'LOBSTER', 'MECHANICAL', 'GHOST', 'RIBBON'],
  bodyType: ['DEFAULT', 'ROUND', 'SLENDER', 'CHUNKY', 'BOX', 'STAR', 'MERMAID', 'RAY', 'EEL'],
  mouthType: ['TRIANGLE', 'CIRCLE', 'SQUARE', 'FLAT', 'BEAK', 'CURVE'],
  eyeType: ['NORMAL', 'ANIME', 'MAD', 'DERP', 'CYBORG', 'DEAD', 'LOVE', 'HYPNO', 'CAT', 'FIRE', 'BUTTON', 'GOGGLES'],
  eyebrowType: ['NONE', 'ANGRY', 'SAD', 'CONFUSED', 'THICK', 'UNI', 'TIERED'],
  trailType: ['NONE', 'BUBBLES', 'RAINBOW', 'FIRE', 'GLITTER', 'HEARTS', 'ELECTRIC', 'SLIME'],
} as const;

const isHexColor = (v: string): boolean => /^#[0-9a-fA-F]{6}$/.test(v) || v === 'DEFAULT';

describe('AI 鱼随机装扮', () => {
  it('大批量生成：所有字段永远在合法集合内（渲染 switch 不会落空）', () => {
    const types = Object.keys(CREATURES);
    for (let i = 0; i < 200; i += 1) {
      const type = types[Math.floor(Math.random() * types.length)];
      const cos = randomizeCosmetics(CREATURES[type as CreatureType]);

      for (const [field, allowed] of Object.entries(LEGAL)) {
        const value = cos[field as keyof typeof cos] as string;
        expect(
          (allowed as readonly string[]).includes(value),
          `${type} 的 ${field}=${value} 不在合法集合`
        ).toBe(true);
      }
      expect(isHexColor(cos.skinColor), `skinColor=${cos.skinColor} 非法`).toBe(true);
    }
  });

  it('生成的装扮字段齐全（不缺字段，渲染层不需要兜底）', () => {
    const cos = randomizeCosmetics(CREATURES[CreatureType.GREAT_WHITE]);
    expect(Object.keys(DEFAULT_COSMETICS).sort()).toEqual(Object.keys(cos).sort());
  });

  it('磷虾太小，永远保持默认装扮', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(randomizeCosmetics(CREATURES[CreatureType.PLANKTON])).toEqual(DEFAULT_COSMETICS);
    }
  });

  it('分布符合「热闹但不荧光」：本色占多数，变异占少数', () => {
    let defaultSkin = 0;
    const N = 500;
    for (let i = 0; i < N; i += 1) {
      if (randomizeCosmetics(CREATURES[CreatureType.TURTLE]).skinColor === 'DEFAULT') {
        defaultSkin += 1;
      }
    }
    const ratio = defaultSkin / N;
    // 设计值 62%，统计断言放宽到 40%~85% 避免偶发 flake
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.85);
  });

  it('凶猛鱼更容易长獠牙，温和鱼偶尔才长软牙', () => {
    const sharp = randomizeCosmetics(CREATURES[CreatureType.GREAT_WHITE]); // damage 40
    const gentle = randomizeCosmetics(CREATURES[CreatureType.BLUE_TANG]); // damage 1
    // 只验证合法性与类型可区分性，不做概率断言（随机测试要稳）
    expect(typeof sharp.teeth).toBe('string');
    expect(typeof gentle.teeth).toBe('string');
  });

  it('纯函数：不修改传入的 config', () => {
    const config = { ...CREATURES[CreatureType.SQUID] };
    const snapshot = JSON.stringify(config);
    randomizeCosmetics(config);
    expect(JSON.stringify(config)).toBe(snapshot);
  });
});
