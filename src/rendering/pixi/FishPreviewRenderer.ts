import { Application, Graphics } from 'pixi.js';
import type { Entity } from '../../types';
import { drawBoostTrailPixi } from '../boostTrail';
import { previewBoostParticles } from '../fishPreviewEntity';
import { CreatureDisplay } from './CreatureDisplay';

/** One offscreen GPU context serves every thumbnail and the animated fitting mirror. */
class FishPreviewRenderer {
  private readonly boost = new Graphics();
  constructor(private readonly app: Application) {}

  static async create(): Promise<FishPreviewRenderer> {
    const app = new Application();
    await app.init({ width: 1, height: 1, backgroundAlpha: 0, autoStart: false,
      antialias: true, preference: 'webgl' });
    return new FishPreviewRenderer(app);
  }

  createDisplay(id: string): CreatureDisplay { return new CreatureDisplay(id); }

  paint(canvas: HTMLCanvasElement, display: CreatureDisplay, entity: Entity,
    visualTime: number, width: number, height: number, dpr: number, boosting: boolean): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.app.renderer.resize(width, height, dpr);
    this.boost.clear();
    if (boosting) {
      for (const particle of previewBoostParticles(entity, visualTime)) drawBoostTrailPixi(this.boost, particle);
    }
    this.app.stage.addChild(this.boost, display.root);
    // Use the pond's full mesh, lighting, animation and cosmetics, including its time units.
    display.update(entity, visualTime * (1000 / 60), false, 0);
    this.app.render();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.app.canvas, 0, 0);
    this.app.stage.removeChildren();
  }

  destroy(): void {
    this.boost.destroy();
    // The pond still owns live Pixi batches/textures; never clear its global pools.
    this.app.destroy({ removeView: true, releaseGlobalResources: false });
  }
}

let shared: Promise<FishPreviewRenderer> | undefined;
let users = 0;
let cleanup: ReturnType<typeof setTimeout> | undefined;

export const acquireFishPreviewRenderer = () => {
  if (cleanup) clearTimeout(cleanup);
  users++;
  const ready = shared ??= FishPreviewRenderer.create().catch(error => {
    shared = undefined;
    throw error;
  });
  let released = false;
  return {
    ready,
    release: () => {
      if (released) return;
      released = true;
      if (--users !== 0) return;
      // Tab changes and React StrictMode can replace every preview in the same tick.
      cleanup = setTimeout(() => {
        if (users || shared !== ready) return;
        shared = undefined;
        void ready.then(renderer => renderer.destroy(), () => {});
      }, 250);
    },
  };
};
