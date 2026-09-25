import type { EyeType } from '../types';

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
  const size = radius * eyeScale * (eyeType === 'NORMAL' ? 1.12 : 1);
  const side = (sign: -1 | 1): FaceSide => ({
    eye: { x: eyeX, y: sign * eyeY, radius: size },
    pupil: { x: eyeX + size * 0.23, y: sign * eyeY, radius: size * 0.54 },
    shine: { x: eyeX + size * 0.41, y: sign * (eyeY + size * 0.18), radius: size * 0.17 },
    blush: eyeType === 'NORMAL' && radius >= 12
      ? { x: eyeX + radius * 0.24, y: sign * Math.max(eyeY * 0.45, eyeY - size * 0.72), radius: radius * 0.105 }
      : null,
  });
  return [side(-1), side(1)];
};
