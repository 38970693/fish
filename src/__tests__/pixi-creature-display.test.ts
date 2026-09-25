import { describe, expect, it } from 'vitest';
import { MeshSimple } from 'pixi.js';
import { CreatureType } from '../types';
import { createEntity } from '../gameEngine';
import { CreatureDisplay, creatureAppearanceSignature, isPixiStandardFish, PIXI_CREATURE_SHAPES } from '../rendering/pixi/CreatureDisplay';
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

  it('标准鱼及迁移后的河豚、大白鲨进入共享形态管线', () => {
    expect(isPixiStandardFish(createEntity(CreatureType.CLOWN_FISH, 0, 0))).toBe(true);
    expect(isPixiStandardFish(createEntity(CreatureType.PUFFER_FISH, 0, 0))).toBe(true);
    expect(isPixiStandardFish(createEntity(CreatureType.GREAT_WHITE, 0, 0))).toBe(true);
    expect(isPixiStandardFish(createEntity(CreatureType.GOBLIN_SHARK, 0, 0))).toBe(false);
    expect(isPixiStandardFish(createEntity(CreatureType.JELLYFISH, 0, 0))).toBe(false);
  });

  it('特殊鱼的 LOD2 源快照包含附肢网格', () => {
    const squid = createEntity(CreatureType.SQUID, 0, 0);
    const display = new CreatureDisplay(squid.id);
    display.update(squid, 1000, false, 0);
    const snapshot = display.createSnapshotTarget();
    const rig = snapshot.target.children.find(child => child instanceof MeshSimple && child.label !== 'morphology-mesh');
    expect(rig).toBeInstanceOf(MeshSimple);
    expect((rig as MeshSimple).vertices.length).toBeGreaterThan(0);
    expect(snapshot.target.children.indexOf(rig!)).toBe(1);
    display.destroy();
  });

});
