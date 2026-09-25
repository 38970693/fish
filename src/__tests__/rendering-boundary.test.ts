import { describe, expect, it, vi } from 'vitest';
import { CameraAdapter } from '../rendering/camera';
import { CanvasGameRenderer } from '../rendering/canvas/CanvasGameRenderer';
import { PIXI_LAYER_NAMES } from '../rendering/pixi/PixiGameRenderer';
import type { GameState } from '../types';

describe('渲染边界', () => {
  it('Pixi 舞台固定为计划中的七层顺序', () => {
    expect(PIXI_LAYER_NAMES).toEqual([
      'background', 'terrain', 'underEffects', 'creatures', 'worldItems', 'overEffects', 'worldLabels',
    ]);
  });

  it('相机世界/屏幕变换可逆，并给出 Pixi 等价变换', () => {
    const camera = new CameraAdapter(
      { x: 2100, y: 1800, zoom: 0.8 },
      { width: 1280, height: 800, resolution: 1 }
    );
    const screen = camera.toScreen({ x: 2350, y: 1650 });
    expect(screen).toEqual({ x: 840, y: 280 });
    expect(camera.toWorld(screen)).toEqual({ x: 2350, y: 1650 });
    expect(camera.transform()).toEqual({
      pivot: { x: 2100, y: 1800 },
      position: { x: 640, y: 400 },
      scale: 0.8,
    });
  });

  it('相机在负坐标和远距离坐标下仍保持可逆', () => {
    const camera = new CameraAdapter(
      { x: -275_000, y: 410_000, zoom: 0.65 },
      { width: 1440, height: 900, resolution: 1 }
    );
    const world = { x: -273_456.25, y: 407_890.5 };
    const screen = camera.toScreen(world);
    const restored = camera.toWorld(screen);
    expect(restored.x).toBeCloseTo(world.x, 8);
    expect(restored.y).toBeCloseTo(world.y, 8);
  });

  it('Canvas 适配器统一处理 resize、单帧指标与销毁', async () => {
    const draw = vi.fn();
    const renderer = new CanvasGameRenderer(draw);
    const canvas = document.createElement('canvas');
    await renderer.init(canvas, { width: 1280, height: 720, resolution: 1 });
    expect([canvas.width, canvas.height]).toEqual([1280, 720]);

    const state = {} as GameState;
    const metrics = renderer.render(state, 1234);
    expect(draw).toHaveBeenCalledWith(state, 1234);
    expect(metrics).toMatchObject({ renderer: 'canvas', renderCount: 1, displayObjects: 0, textures: 0 });

    renderer.resize({ width: 1024, height: 640, resolution: 2 });
    expect([canvas.width, canvas.height]).toEqual([1024, 640]);
    renderer.destroy();
    expect(() => renderer.render(state, 1235)).toThrow(/before init/);
  });
});
