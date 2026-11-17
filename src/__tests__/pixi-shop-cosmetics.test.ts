import { describe, expect, it } from 'vitest';
import { Graphics, MeshSimple } from 'pixi.js';
import { createInitialState } from '../factories/initialState';
import { DEFAULT_COSMETICS, type Cosmetics } from '../types';
import { ACCESSORY_OPTIONS, BODY_OPTIONS, EYE_OPTIONS, EYEBROW_OPTIONS, MOUTH_OPTIONS, PATTERN_OPTIONS, SCALE_OPTIONS, TAIL_OPTIONS, TEETH_OPTIONS, TRAIL_OPTIONS } from '../data/cosmeticsOptions';
import { CreatureDisplay } from '../rendering/pixi/CreatureDisplay';
import { drawEyes } from '../rendering/cosmetics';
import { CosmeticGraphicsContext } from '../rendering/pixi/CosmeticGraphicsContext';

const categories = [
  ['teeth', TEETH_OPTIONS], ['pattern', PATTERN_OPTIONS], ['scaleType', SCALE_OPTIONS],
  ['accessory', ACCESSORY_OPTIONS], ['tailType', TAIL_OPTIONS], ['bodyType', BODY_OPTIONS],
  ['mouthType', MOUTH_OPTIONS], ['eyeType', EYE_OPTIONS], ['eyebrowType', EYEBROW_OPTIONS], ['trailType', TRAIL_OPTIONS],
] as const;

describe('商店装扮进入实际 Pixi 绘制', () => {
  it('镜像绘制眼睛时保留身体两侧的眼睛位置', () => {
    for (const option of EYE_OPTIONS) {
      const eyes = new Graphics();
      drawEyes(new CosmeticGraphicsContext(eyes).asCanvas(), option.value, 15, 20, 50, 14);
      expect(eyes.context.bounds.minY, option.value).toBeLessThan(-20);
      expect(eyes.context.bounds.maxY, option.value).toBeGreaterThan(20);
      expect(eyes.context.bounds.minX, option.value).toBeGreaterThan(0);
      eyes.destroy();
    }
  });

  it.each(categories)('%s 的每个商店选项都有独立的画面', (key, options) => {
    const player = createInitialState({ skipWorldGen: true }).player;
    const display = new CreatureDisplay(player.id);
    const fingerprints = options.map(option => {
      player.cosmetics = { ...DEFAULT_COSMETICS, [key]: option.value } as Cosmetics;
      display.update(player, 1000, true, 0);
      const snapshot = display.createSnapshotTarget();
      const fingerprint = JSON.stringify(snapshot.target.children.map(child => ({
        x: child.x, y: child.y, scale: [child.scale.x, child.scale.y],
        drawing: child instanceof Graphics ? child.context.instructions : undefined,
        vertices: child instanceof MeshSimple ? Array.from(child.vertices) : undefined,
      })), (property, value) => property === 'texture' ? undefined : property === 'path' ? value.instructions : value);
      snapshot.target.destroy({ children: true });
      return [option.value, fingerprint] as const;
    });
    display.destroy();
    const duplicates = fingerprints.filter(([value, fingerprint], index) =>
      fingerprints.slice(0, index).some(([, previous]) => previous === fingerprint)
    ).map(([value]) => value);
    expect(duplicates, `选了但画面相同的选项：${duplicates.join(', ')}`).toEqual([]);
  });
});
