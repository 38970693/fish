import type { Entity } from '../types';

const smooth = (value: number): number => value * value * (3 - 2 * value);

const blinkAt = (elapsed: number): number => {
  if (elapsed < 0 || elapsed >= 220) return 1;
  if (elapsed < 70) return 1 - smooth(elapsed / 70);
  if (elapsed < 110) return 0;
  return smooth((elapsed - 110) / 110);
};

/** Render-only clock: stable fish identity staggers blinking without consuming gameplay randomness. */
export const fishEyeOpenness = (fish: Pick<Entity, 'id' | 'animOffset' | 'cosmetics'>, nowMs: number): number => {
  if (!Number.isFinite(nowMs) || fish.cosmetics?.eyeType === 'DEAD') return 1;
  let seed = 2166136261;
  const identity = `${fish.id}:${fish.animOffset}`;
  for (let i = 0; i < identity.length; i++) seed = Math.imul(seed ^ identity.charCodeAt(i), 16777619) >>> 0;
  const firstBlink = 1400 + ((seed >>> 8) % 2100);
  if (nowMs < firstBlink) return 1; // Static shop thumbnails use an early, open-eyed frame.
  const interval = 3600 + (seed % 2300);
  const elapsed = nowMs - firstBlink;
  const cycle = Math.floor(elapsed / interval);
  const phase = elapsed % interval;
  const doubleBlink = (cycle + (seed >>> 16)) % 4 === 0;
  const openness = Math.min(blinkAt(phase), doubleBlink ? blinkAt(phase - 330) : 1);
  // Shared small steps keep Canvas/Pixi identical and avoid rebuilding idle eye graphics.
  return Math.round(openness * 24) / 24;
};

/** A little smiling eyelid, mirrored on each side of the fish. */
export const drawClosedFishEye = (ctx: CanvasRenderingContext2D, radius: number): void => {
  ctx.strokeStyle = '#5b526c';
  ctx.lineWidth = Math.max(0.8, radius * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-radius * 0.85, -radius * 0.08);
  ctx.quadraticCurveTo(0, radius * 0.42, radius * 0.85, -radius * 0.08);
  ctx.stroke();
};
