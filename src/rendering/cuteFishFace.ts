import type { EyeType } from '../types';
import { drawClosedFishEye } from './fishBlink';

interface FaceMark { x: number; y: number; radius: number }
interface FaceSide {
  eye: FaceMark;
  pupil: FaceMark;
  shine: FaceMark;
  blush: FaceMark | null;
}

/** Local fish coordinates, with +x toward the mouth and y mirrored about the spine. */
export const cuteFacePair = (
  radius: number,
  eyeXRatio: number,
  eyeYRatio: number,
  eyeScale: number,
  eyeType: EyeType,
): readonly [FaceSide, FaceSide] => {
  const eyeX = radius * eyeXRatio;
  const eyeY = radius * Math.abs(eyeYRatio);
  // Keep a sliver of face between the eyes, including on narrow species.
  const size = Math.min(radius * eyeScale * (eyeType === 'NORMAL' ? 1.32 : 1), eyeY * 0.94);
  const side = (sign: -1 | 1): FaceSide => ({
    eye: { x: eyeX, y: sign * eyeY, radius: size },
    pupil: { x: eyeX + size * 0.1, y: sign * eyeY, radius: size * 0.76 },
    shine: { x: eyeX - size * 0.12, y: sign * (eyeY + size * 0.29), radius: size * 0.25 },
    blush: eyeType === 'NORMAL' && radius >= 12
      ? { x: eyeX + radius * 0.23, y: sign * eyeY * 0.72, radius: radius * 0.145 }
      : null,
  });
  return [side(-1), side(1)];
};

/** 游戏与试衣镜共用的圆润五官，不依赖图片或额外纹理。 */
export const drawCuteFace = (
  ctx: CanvasRenderingContext2D, radius: number, eyeX: number, eyeY: number, eyeScale: number, openness = 1,
): void => {
  const faces = cuteFacePair(radius, eyeX / radius, eyeY / radius, eyeScale, 'NORMAL');
  // Ellipses preserve nonuniform eyelid scaling in both Canvas and Pixi's path adapter.
  const circle = (x: number, y: number, size: number) => {
    ctx.beginPath(); ctx.ellipse(x, y, size, size, 0, 0, Math.PI * 2); ctx.fill();
  };
  ctx.save();
  for (const face of faces) {
    if (face.blush) {
      ctx.fillStyle = 'rgba(255,135,157,0.58)';
      ctx.beginPath(); ctx.ellipse(face.blush.x, face.blush.y, face.blush.radius, face.blush.radius * 0.64, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,226,223,0.62)';
      ctx.beginPath(); ctx.ellipse(face.blush.x - face.blush.radius * 0.2, face.blush.y, face.blush.radius * 0.35, face.blush.radius * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    }
    const { eye, pupil, shine } = face;
    ctx.save();
    ctx.translate(eye.x, eye.y);
    if (openness <= 0.08) {
      ctx.scale(1, Math.sign(eye.y));
      drawClosedFishEye(ctx, eye.radius);
      ctx.restore();
      continue;
    }
    ctx.scale(1, openness);
    ctx.translate(-eye.x, -eye.y);
    ctx.fillStyle = '#5b526c';
    circle(eye.x, eye.y, eye.radius * 1.065);
    ctx.fillStyle = '#fffdf9';
    circle(eye.x, eye.y, eye.radius);
    ctx.fillStyle = '#34435e';
    circle(pupil.x, pupil.y, pupil.radius);
    ctx.fillStyle = '#182b47';
    circle(pupil.x + eye.radius * 0.045, pupil.y, pupil.radius * 0.73);
    ctx.fillStyle = '#819fc5';
    ctx.beginPath(); ctx.ellipse(pupil.x + eye.radius * 0.24, pupil.y - Math.sign(eye.y) * eye.radius * 0.28, eye.radius * 0.23, eye.radius * 0.12, -Math.sign(eye.y) * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    circle(shine.x, shine.y, shine.radius);
    circle(pupil.x + eye.radius * 0.35, pupil.y - Math.sign(eye.y) * eye.radius * 0.2, eye.radius * 0.105);
    ctx.restore();
  }
  ctx.restore();
};
