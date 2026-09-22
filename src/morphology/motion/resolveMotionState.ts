import type { Entity } from '../../types';
import type { ResolvedMorphology, ResolvedMotionState } from '../types';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const signedAngle = (from: number, to: number): number => {
  let value = to - from;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
};

export const resolveMorphologyMotion = (
  entity: Pick<Entity, 'vx' | 'vy' | 'speed' | 'angle' | 'isIdle' | 'speedBoostTimer' | 'hitReactionTimer'>,
  morphology: Pick<ResolvedMorphology, 'motion'>
): ResolvedMotionState => {
  const velocity = Math.hypot(entity.vx, entity.vy);
  const speedRatio = clamp(velocity / Math.max(0.01, entity.speed), 0, 2);
  const velocityAngle = velocity > 0.001 ? Math.atan2(entity.vy, entity.vx) : entity.angle;
  const turn = velocity > 0.001 ? clamp(signedAngle(entity.angle, velocityAngle) / (Math.PI / 2), -1, 1) : 0;
  const boosting = Boolean(entity.speedBoostTimer && entity.speedBoostTimer > 0) || speedRatio > 1.35;
  const braking = !entity.isIdle && speedRatio > 0.02 && speedRatio < 0.35;
  const hitReaction = clamp((entity.hitReactionTimer ?? 0) / 8, 0, 1);
  const activity = entity.isIdle ? 0 : clamp(speedRatio, 0, 1);
  const thrust = clamp(speedRatio + (boosting ? 0.45 : 0), 0, 1.7);
  const baseFin = morphology.motion.finFlutter * (0.35 + activity * 0.65);
  const brakeSpread = braking ? 0.42 : 0;
  return {
    speedRatio,
    turn,
    boosting,
    braking,
    hitReaction,
    tailAmplitude: morphology.motion.tailAmplitude * (0.28 + thrust * 0.72),
    tailFrequency: morphology.motion.tailFrequency * (0.55 + thrust * 0.65),
    finAmplitude: baseFin,
    leftFin: clamp(baseFin + brakeSpread, -1, 1),
    rightFin: clamp(baseFin + brakeSpread, -1, 1),
    breathAmplitude: morphology.motion.idleBreath * (1 - clamp(speedRatio / 1.7, 0, 1) * 0.8),
    bodyStretch: (1 + clamp(thrust - 0.75, 0, 1) * 0.045) * (1 - hitReaction * 0.09),
  };
};
