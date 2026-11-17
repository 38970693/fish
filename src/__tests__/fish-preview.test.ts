import { describe, expect, it } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { DEFAULT_COSMETICS, type CreatureType } from '../types';
import { legacyCosmeticsToAppearance, resolveMorphology, resolveMorphologyMotion } from '../morphology';
import { makePreviewEntity } from '../rendering/fishPreviewEntity';

describe('商店保留实际鱼外观', () => {
  it('保留附身鱼的身份、物种配置与 V2 参数，不修改渔场实体', () => {
    const player = createInitialState({ skipWorldGen: true }).player;
    player.id = 'possessed-42'; player.appearanceV2 = legacyCosmeticsToAppearance(player);
    player.appearanceV2.genes = { bodyDepth: 0.7 };
    const before = structuredClone(player);
    const preview = makePreviewEntity(player.type as CreatureType, DEFAULT_COSMETICS, 288, 200, false, player);
    expect(preview.id).toBe(player.id);
    expect(preview.config).toBe(player.config);
    expect(preview.appearanceV2).toBe(player.appearanceV2);
    expect(resolveMorphology(preview).genes).toEqual(resolveMorphology(player).genes);
    expect(resolveMorphology(preview).material).toEqual(resolveMorphology(player).material);
    expect(player).toEqual(before);
  });

  it('旧装扮使用实际玩家种子，预览尺寸不会重新随机造型', () => {
    const player = createInitialState({ skipWorldGen: true }).player;
    player.id = 'another-body';
    const preview = makePreviewEntity(player.type as CreatureType, player.cosmetics!, 48, 48, false, player);
    expect(resolveMorphology(preview).genes).toEqual(resolveMorphology(player).genes);
  });

  it.each([false, true])('无实体的独立预览也有有限的运动参数（加速 %s）', boosting => {
    const preview = makePreviewEntity('CLOWN_FISH', DEFAULT_COSMETICS, 100, 80, boosting);
    const motion = resolveMorphologyMotion(preview, resolveMorphology(preview));
    for (const value of Object.values(motion)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  });
});
