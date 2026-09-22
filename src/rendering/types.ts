import type { GameState } from '../types';

export type RendererKind = 'canvas' | 'pixi';

export interface Viewport {
  width: number;
  height: number;
  resolution: number;
}

export interface RenderMetrics {
  renderer: RendererKind;
  renderCount: number;
  lastRenderMs: number;
  displayObjects: number;
  textures: number;
}

/** 玩法层只依赖这个接口，不接触 Canvas 或 Pixi 的具体 API。 */
export interface GameRenderer {
  readonly kind: RendererKind;
  init(host: HTMLElement, viewport: Viewport): Promise<void>;
  resize(viewport: Viewport): void;
  render(state: Readonly<GameState>, now: number): RenderMetrics;
  destroy(): void;
  metrics(): Readonly<RenderMetrics>;
}

export const createViewport = (
  width = window.innerWidth,
  height = window.innerHeight,
  resolution = window.devicePixelRatio || 1
): Viewport => ({
  width: Math.max(1, Math.floor(width)),
  height: Math.max(1, Math.floor(height)),
  resolution: Math.max(1, Math.min(resolution, 2)),
});
