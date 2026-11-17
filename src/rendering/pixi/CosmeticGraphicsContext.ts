import { Color, FillGradient, type GradientOptions, type Graphics, type FillInput } from 'pixi.js';

type Paint = string | FillGradient;
interface PaintState {
  fillStyle: Paint; strokeStyle: Paint; globalAlpha: number; lineWidth: number;
  lineCap: CanvasLineCap; shadowColor: string; shadowBlur: number;
}

/** 让装扮的共享 Canvas 画法直接生成 Pixi 矢量路径，不再维护两份选项分支。 */
export class CosmeticGraphicsContext implements PaintState {
  fillStyle: Paint = '#000000';
  strokeStyle: Paint = '#000000';
  globalAlpha = 1;
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  shadowColor = '#000000';
  shadowBlur = 0;
  private states: PaintState[] = [];
  readonly gradients: FillGradient[] = [];

  constructor(private graphics: Graphics) { graphics.resetTransform(); }
  asCanvas(): CanvasRenderingContext2D { return this as unknown as CanvasRenderingContext2D; }
  save(): void {
    this.states.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha,
      lineWidth: this.lineWidth, lineCap: this.lineCap, shadowColor: this.shadowColor, shadowBlur: this.shadowBlur });
    this.graphics.save();
  }
  restore(): void { Object.assign(this, this.states.pop()); this.graphics.restore(); }
  // Canvas 的变换右乘当前矩阵；Pixi 的便捷变换会连已有平移一起缩放/旋转。
  translate(x: number, y: number): void { this.graphics.context.transform(1, 0, 0, 1, x, y); }
  rotate(angle: number): void {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    this.graphics.context.transform(cos, sin, -sin, cos, 0, 0);
  }
  scale(x: number, y: number): void { this.graphics.context.transform(x, 0, 0, y, 0, 0); }
  beginPath(): void { this.graphics.beginPath(); }
  closePath(): void { this.graphics.closePath(); }
  moveTo(x: number, y: number): void { this.graphics.moveTo(x, y); }
  lineTo(x: number, y: number): void { this.graphics.lineTo(x, y); }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void { this.graphics.quadraticCurveTo(cx, cy, x, y); }
  bezierCurveTo(cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number): void {
    this.graphics.bezierCurveTo(cx1, cy1, cx2, cy2, x, y);
  }
  arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise = false): void {
    this.graphics.arc(x, y, radius, start, end, counterclockwise);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void {
    // 装扮只使用完整椭圆；弧线使用 arc，保持共享路径的变换与顺序。
    this.save(); this.translate(x, y); this.rotate(rotation);
    this.graphics.ellipse(0, 0, rx, ry); this.restore();
  }
  fillRect(x: number, y: number, width: number, height: number): void {
    this.graphics.beginPath().rect(x, y, width, height); this.fill();
  }
  private paint(style: Paint): FillInput {
    if (style instanceof FillGradient) return { fill: style, alpha: this.globalAlpha };
    const color = new Color(style);
    return { color: color.toNumber(), alpha: this.globalAlpha * color.alpha };
  }
  fill(): void {
    if (this.shadowBlur > 0) this.graphics.stroke({ ...this.paint(this.shadowColor) as object, alpha: this.globalAlpha * 0.12, width: this.shadowBlur });
    this.graphics.fill(this.paint(this.fillStyle));
  }
  stroke(): void {
    if (this.shadowBlur > 0) this.graphics.stroke({ ...this.paint(this.shadowColor) as object, alpha: this.globalAlpha * 0.15, width: this.lineWidth + this.shadowBlur });
    this.graphics.stroke({ ...this.paint(this.strokeStyle) as object, width: this.lineWidth, cap: this.lineCap });
  }
  private gradient(options: GradientOptions): FillGradient {
    const gradient = new FillGradient({ ...options, textureSpace: 'global', textureSize: 64 });
    this.gradients.push(gradient);
    return gradient;
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): FillGradient {
    return this.gradient({ type: 'linear', start: { x: x0, y: y0 }, end: { x: x1, y: y1 } });
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): FillGradient {
    return this.gradient({ type: 'radial', center: { x: x0, y: y0 }, innerRadius: r0,
      outerCenter: { x: x1, y: y1 }, outerRadius: r1 });
  }
}
