import { CREATURES, type CreatureType } from '../data/creatures';
import type { Cosmetics, Entity, Particle } from '../types';
import { createBoostParticles } from '../data/boostEffects';

/** Only the presentation pose changes: keep the actual fish's seed, species and V2 appearance. */
export const makePreviewEntity = (
  type: CreatureType, cosmetics: Cosmetics, width: number, height: number,
  boosting = false, source?: Entity,
): Entity => {
  const template = source?.type === type ? source : undefined;
  const config = template?.config ?? CREATURES[type];
  const hasTrail = cosmetics.trailType !== 'NONE';
  return {
    id: 'player', type, config, speed: config.speed,
    health: 1, maxHealth: 1, level: 1, mouthOpenValue: 0,
    lureActive: false, ambushTimer: 0, animOffset: 0,
    ...template,
    cosmetics,
    radius: Math.min(width, height) * (boosting ? 0.19 : hasTrail ? 0.175 : 0.25),
    x: width * (boosting ? 0.72 : hasTrail ? 0.64 : 0.58), y: height / 2,
    angle: 0, vx: boosting ? 5 : 0, vy: 0, renderScale: 1,
    isIdle: !boosting, semiGhostTimer: 0, inCover: false, camoActive: false,
    hitReactionTimer: 0, speedBoostTimer: 0, accelerationMult: boosting ? 3 : 1,
  };
};

export const previewBoostParticles = (entity: Entity, visualTime: number): Particle[] => {
  const particles: Particle[] = [];
  const frame = Math.floor(visualTime);
  for (let age = 34; age >= 0; age--) {
    for (const p of createBoostParticles(entity, frame - age, (frame - age) % 2 === 0)) {
      p.life -= age * 0.02;
      if (p.life <= 0) continue;
      p.x += p.vx * age; p.y += p.vy * age;
      particles.push(p);
    }
  }
  return particles;
};
