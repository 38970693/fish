import { describe, expect, it } from 'vitest';
import { createEntity } from '../gameEngine';
import { CreatureType } from '../types';
import { resolveMorphologyForRender } from '../morphology';

describe('Canvas morphology render cache', () => {
  it('reuses an unchanged entity and invalidates legacy appearance changes', () => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    const first = resolveMorphologyForRender(fish);
    fish.x += 20;
    fish.health -= 1;
    expect(resolveMorphologyForRender(fish)).toBe(first);
    fish.cosmetics = { ...fish.cosmetics!, bodyType: 'SLENDER' };
    const changed = resolveMorphologyForRender(fish);
    expect(changed).not.toBe(first);
    expect(changed.genes.bodyLength).not.toBe(first.genes.bodyLength);
    fish.cosmetics.bodyType = 'ROUND';
    expect(resolveMorphologyForRender(fish)).not.toBe(changed);
  });

  it('invalidates V2 nested in-place edits and identity changes', () => {
    const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
    fish.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed: 4,
      genes: { bodyLength: 0.5 } };
    const first = resolveMorphologyForRender(fish);
    fish.appearanceV2.genes!.bodyLength = 0.8;
    const changed = resolveMorphologyForRender(fish);
    expect(changed).not.toBe(first);
    expect(changed.genes.bodyLength).toBe(0.8);
    fish.id = `${fish.id}-other`;
    expect(resolveMorphologyForRender(fish)).not.toBe(changed);
  });
});
