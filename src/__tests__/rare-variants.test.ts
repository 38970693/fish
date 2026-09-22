import { describe, expect, it } from 'vitest';
import { CreatureType } from '../types';
import { RARE_VARIANT_DATA, getCreatureDisplayName, rareVariantRollFromId, rollRareVariant } from '../data/rareVariants';
import { applyWildRareVariant, createEntity } from '../systems/spawn';
import { creatureAppearanceSignature } from '../rendering/pixi/CreatureDisplay';
import { lod2TextureSignature } from '../rendering/pixi/CreatureLod';

describe('星夜小丑鱼稀有变体', () => {
  it('只在小丑鱼的 4% 边界内命中', () => {
    expect(RARE_VARIANT_DATA.STARRY_CLOWN.spawnChance).toBe(0.04);
    expect(rollRareVariant(CreatureType.CLOWN_FISH, 0.0399)).toBe('STARRY_CLOWN');
    expect(rollRareVariant(CreatureType.CLOWN_FISH, 0.04)).toBeUndefined();
    expect(rollRareVariant(CreatureType.BLUE_TANG, 0)).toBeUndefined();
  });

  it('使用实体 ID 的稳定随机值，不需要额外读取全局随机流', () => {
    expect(rareVariantRollFromId('fish-123')).toBe(rareVariantRollFromId('fish-123'));
    expect(rareVariantRollFromId('fish-123')).toBeGreaterThanOrEqual(0);
    expect(rareVariantRollFromId('fish-123')).toBeLessThan(1);
    expect(rareVariantRollFromId('fish-123')).not.toBe(rareVariantRollFromId('fish-124'));
  });

  it('只给自然生成步骤显式应用的鱼添加变体，不污染实体工厂', () => {
    const ordinary = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    expect(ordinary.cosmetics?.rareVariant).toBeUndefined();

    const rare = applyWildRareVariant(createEntity(CreatureType.CLOWN_FISH, 0, 0), 0);
    expect(rare.cosmetics).toMatchObject({
      rareVariant: 'STARRY_CLOWN', skinColor: 'DEFAULT', pattern: 'NONE',
      scaleType: 'NONE', trailType: 'GLITTER',
    });
  });

  it('近景外观签名和远景纹理键都区分普通与稀有鱼', () => {
    const ordinary = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    const rare = applyWildRareVariant(createEntity(CreatureType.CLOWN_FISH, 0, 0), 0);
    expect(creatureAppearanceSignature(rare)).not.toBe(creatureAppearanceSignature(ordinary));
    expect(lod2TextureSignature(rare)).not.toBe(lod2TextureSignature(ordinary));
    expect(getCreatureDisplayName(ordinary)).toBe('小丑鱼');
    expect(getCreatureDisplayName(rare)).toBe('星夜小丑鱼');
  });
});
