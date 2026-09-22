import { describe, expect, it, vi } from 'vitest';
import { CreatureType, DEFAULT_COSMETICS } from '../types';
import { createEntity } from '../gameEngine';
import { localLightDirection, resolveMorphology } from '../morphology';
import { drawMorphologyBodyDetails } from '../rendering/canvas/MorphologyCanvasRenderer';

describe('V3-01 共享鱼体体积层', () => {
  const fish = createEntity(CreatureType.CLOWN_FISH, 0, 0);
  fish.id = 'v3-volume-fixture';
  fish.cosmetics = { ...DEFAULT_COSMETICS, rareVariant: 'STARRY_CLOWN' };
  fish.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed: 20260921 };

  it('固定种子稳定输出四个标准体积层并写入外观签名', () => {
    const first = resolveMorphology(fish);
    const repeat = resolveMorphology(fish);
    expect(repeat.volume).toEqual(first.volume);
    expect(repeat.surfaceLayers).toEqual(first.surfaceLayers);
    expect(repeat.signature).toBe(first.signature);
    expect(first.surfaceLayers.map(layer => layer.kind)).toEqual([
      'FLANK_SHADE', 'DORSAL_VOLUME', 'HEAD_DOME', 'TAIL_PEDUNCLE', 'GILL', 'LATERAL_LINE', 'NOSTRIL',
    ]);
    expect(first.surfaceLayers.map(layer => layer.symmetry)).toEqual([
      'MIRROR', 'LIGHTING', 'LIGHTING', 'CENTER', 'MIRROR', 'MIRROR', 'MIRROR',
    ]);
  });

  it('50 个极值种子的体积区域有限且不扩大逻辑/视觉边界', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const entity = createEntity(CreatureType.CLOWN_FISH, 0, 0);
      entity.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed };
      const morphology = resolveMorphology(entity);
      for (const region of [
        morphology.volume.dorsalRidge,
        morphology.volume.flankShade,
        morphology.volume.headDome,
        morphology.volume.tailPeduncle,
      ]) {
        expect(Object.values(region).every(Number.isFinite)).toBe(true);
        expect(Math.abs(region.centerX) + region.radiusX).toBeLessThan(morphology.maxVisualExtent);
        expect(Math.abs(region.centerY) + region.radiusY).toBeLessThan(morphology.maxVisualExtent);
      }
      expect(morphology.geometry.bounds.radius).toBeLessThan(morphology.maxVisualExtent);
    }
  });

  it('鱼体旋转后局部高光仍还原为同一个世界光方向', () => {
    const world = resolveMorphology(fish).volume.worldLight;
    for (const angle of [0, Math.PI / 3, Math.PI, -Math.PI / 2]) {
      const local = localLightDirection(world, angle);
      const worldX = local.x * Math.cos(angle) - local.y * Math.sin(angle);
      const worldY = local.x * Math.sin(angle) + local.y * Math.cos(angle);
      expect(worldX).toBeCloseTo(world.x, 3);
      expect(worldY).toBeCloseTo(world.y, 3);
    }
  });

  it('Canvas 消费共享体积语义并为近景创建侧腹与头背渐变', () => {
    const linear = { addColorStop: vi.fn() };
    const radial = { addColorStop: vi.fn() };
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(), arc: vi.fn(), fill: vi.fn(),
      moveTo: vi.fn(), quadraticCurveTo: vi.fn(), stroke: vi.fn(), closePath: vi.fn(),
      createLinearGradient: vi.fn(() => linear), createRadialGradient: vi.fn(() => radial),
      fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    drawMorphologyBodyDetails(ctx, resolveMorphology(fish), 80, Math.PI / 4, 0);
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(1);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(3);
    expect(linear.addColorStop).toHaveBeenCalledTimes(4);
    expect(radial.addColorStop).toHaveBeenCalled();
  });
});
