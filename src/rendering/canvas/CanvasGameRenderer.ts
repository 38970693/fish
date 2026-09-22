import type { GameState } from '../../types';
import type { GameRenderer, RenderMetrics, Viewport } from '../types';

type DrawCanvasFrame = (state: Readonly<GameState>, now: number) => void;

/**
 * Canvas 2D 生命周期适配器。
 *
 * PXR-01 只把既有即时绘制纳入统一契约；实际绘图仍由 GameCanvas 提供，
 * 因而不会在建立边界时顺带改变像素结果。
 */
export class CanvasGameRenderer implements GameRenderer {
  readonly kind = 'canvas' as const;
  private canvas: HTMLCanvasElement | null = null;
  private readonly currentMetrics: RenderMetrics = {
    renderer: 'canvas',
    renderCount: 0,
    lastRenderMs: 0,
    displayObjects: 0,
    textures: 0,
  };

  constructor(private readonly drawFrame: DrawCanvasFrame) {}

  async init(host: HTMLElement, viewport: Viewport): Promise<void> {
    if (!(host instanceof HTMLCanvasElement)) {
      throw new TypeError('CanvasGameRenderer requires an HTMLCanvasElement host');
    }
    this.canvas = host;
    this.resize(viewport);
  }

  resize(viewport: Viewport): void {
    if (!this.canvas) return;
    this.canvas.width = viewport.width;
    this.canvas.height = viewport.height;
  }

  render(state: Readonly<GameState>, now: number): RenderMetrics {
    if (!this.canvas) throw new Error('CanvasGameRenderer.render() called before init()');
    const startedAt = performance.now();
    this.drawFrame(state, now);
    this.currentMetrics.renderCount += 1;
    this.currentMetrics.lastRenderMs = performance.now() - startedAt;
    return this.currentMetrics;
  }

  destroy(): void {
    this.canvas = null;
  }

  metrics(): Readonly<RenderMetrics> {
    return this.currentMetrics;
  }
}
