import { describe, expect, it } from 'vitest';
import { resolveRendererSelection } from '../rendering/rendererSelection';
import { createViewport } from '../rendering/types';

describe('渲染器选择', () => {
  it('没有偏好时使用 Pixi 默认值', () => {
    expect(resolveRendererSelection({ search: '', stored: null, pixiAvailable: true })).toEqual({
      kind: 'pixi', requested: 'pixi', source: 'default', fellBack: false,
    });
  });

  it('URL 优先于持久偏好', () => {
    expect(resolveRendererSelection({ search: '?renderer=canvas', stored: 'pixi', pixiAvailable: true }).kind).toBe('canvas');
    expect(resolveRendererSelection({ search: '?renderer=pixi', stored: 'canvas', pixiAvailable: true })).toMatchObject({
      kind: 'pixi', source: 'query', fellBack: false,
    });
  });

  it('生产环境不可用的 Pixi 请求安全回退 Canvas', () => {
    expect(resolveRendererSelection({ search: '?renderer=pixi', stored: null, pixiAvailable: false })).toMatchObject({
      kind: 'canvas', requested: 'pixi', fellBack: true,
    });
  });

  it('视口尺寸取整、保底并限制 DPR', () => {
    expect(createViewport(1024.8, 640.9, 3)).toEqual({ width: 1024, height: 640, resolution: 2 });
    expect(createViewport(0, -1, 0)).toEqual({ width: 1, height: 1, resolution: 1 });
  });
});
