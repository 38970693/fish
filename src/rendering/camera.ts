import { screenToWorld, worldToScreen, type Point } from '../core/math';
import type { Viewport } from './types';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

/** Canvas 与 Pixi 共用的相机数学，避免两个渲染器各自维护公式。 */
export class CameraAdapter {
  constructor(
    private camera: CameraState,
    private viewport: Viewport
  ) {}

  update(camera: CameraState, viewport: Viewport): void {
    this.camera = camera;
    this.viewport = viewport;
  }

  toWorld(screen: Point): Point {
    return screenToWorld(this.camera, screen.x, screen.y, this.viewport.width, this.viewport.height);
  }

  toScreen(world: Point): Point {
    return worldToScreen(this.camera, world.x, world.y, this.viewport.width, this.viewport.height);
  }

  /** Pixi world 容器所需的等价变换。 */
  transform(): { pivot: Point; position: Point; scale: number } {
    return {
      pivot: { x: this.camera.x, y: this.camera.y },
      position: { x: this.viewport.width / 2, y: this.viewport.height / 2 },
      scale: this.camera.zoom || 1,
    };
  }
}
