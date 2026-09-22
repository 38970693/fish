import { describe, expect, it } from 'vitest';
import { CreatureType } from '../types';
import { createEntity } from '../gameEngine';
import { creatureAppearanceSignature, isPixiStandardFish, PIXI_CREATURE_SHAPES } from '../rendering/pixi/CreatureDisplay';
import { CREATURE_SHAPE_IDS } from '../data/creatureShapes';

describe('Pixi 标准鱼外观', () => {
  it('覆盖形状注册表中的全部 20 类轮廓', () => {
    expect(new Set(PIXI_CREATURE_SHAPES)).toEqual(new Set(CREATURE_SHAPE_IDS));
    expect(PIXI_CREATURE_SHAPES).toHaveLength(20);
  });

  it('位置和生命值不进入外观签名，移动时可以复用显示对象', () => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 100, 200);
    const before = creatureAppearanceSignature(fish);
    fish.x += 500;
    fish.y -= 100;
    fish.health -= 1;
    expect(creatureAppearanceSignature(fish)).toBe(before);
  });

  it('装扮或半径改变会使外观签名失效', () => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 100, 200);
    const before = creatureAppearanceSignature(fish);
    fish.cosmetics = { ...fish.cosmetics!, pattern: fish.cosmetics?.pattern === 'SPOTS' ? 'ZEBRA' : 'SPOTS' };
    expect(creatureAppearanceSignature(fish)).not.toBe(before);
    const afterPattern = creatureAppearanceSignature(fish);
    fish.radius += 1;
    expect(creatureAppearanceSignature(fish)).not.toBe(afterPattern);
  });

  it('仅 FISH 进入本阶段的标准鱼管线', () => {
    expect(isPixiStandardFish(createEntity(CreatureType.CLOWN_FISH, 0, 0))).toBe(true);
    expect(isPixiStandardFish(createEntity(CreatureType.JELLYFISH, 0, 0))).toBe(false);
  });
});
