import { describe, expect, it } from 'vitest';
import {
  lod2TextureSignature, lodJointCount, pickTextureEvictions, selectCreatureLod,
  LOD0_DISTANCE, LOD1_DISTANCE,
} from '../rendering/pixi/CreatureLod';

describe('Pixi 生物 LOD', () => {
  it('按玩家距离分三级，玩家始终保持 LOD 0', () => {
    expect(selectCreatureLod(LOD0_DISTANCE)).toBe(0);
    expect(selectCreatureLod(LOD0_DISTANCE + 1)).toBe(1);
    expect(selectCreatureLod(LOD1_DISTANCE)).toBe(1);
    expect(selectCreatureLod(LOD1_DISTANCE + 1)).toBe(2);
    expect(selectCreatureLod(99999, true)).toBe(0);
  });

  it('LOD 1 减少关节，LOD 2 不更新关节', () => {
    expect(lodJointCount(0, 10)).toBe(10);
    expect(lodJointCount(1, 10)).toBe(6);
    expect(lodJointCount(1, 6)).toBe(4);
    expect(lodJointCount(2, 10)).toBe(0);
  });

  it('纹理预算只淘汰最旧的非活跃项', () => {
    const entries = [
      { key: 'old', bytes: 40, lastUsed: 1 },
      { key: 'active', bytes: 40, lastUsed: 2 },
      { key: 'new', bytes: 40, lastUsed: 3 },
    ];
    expect(pickTextureEvictions(entries, new Set(['active']), 2, 90)).toEqual(['old']);
    expect(pickTextureEvictions(entries, new Set(['old', 'active', 'new']), 1, 1)).toEqual([]);
  });

  it('LOD 2 合并同物种的细小尺寸与装扮差异', () => {
    const base = { type: 'SQUID', radius: 41, config: { shape: 'CEPHALOPOD' } };
    expect(lod2TextureSignature(base)).toBe(lod2TextureSignature({ ...base, radius: 42 }));
    expect(lod2TextureSignature(base)).not.toBe(lod2TextureSignature({ ...base, type: 'OCTOPUS' }));
  });

  it('V2 外观进入远景身份键，且不受字段插入顺序影响', () => {
    const first = { type: 'CLOWN_FISH', config: { shape: 'FISH' }, appearanceV2: { schemaVersion: 2 as const, recipeId: 'CLOWN_FISH', seed: 9, genes: { bodyDepth: 0.4, bodyLength: 0.7 } } };
    const reordered = { ...first, appearanceV2: { ...first.appearanceV2, genes: { bodyLength: 0.7, bodyDepth: 0.4 } } };
    expect(lod2TextureSignature(first)).toBe(lod2TextureSignature(reordered));
    expect(lod2TextureSignature(first)).not.toBe(lod2TextureSignature({ ...first, appearanceV2: { ...first.appearanceV2, seed: 10 } }));
  });
});
