import { describe, expect, it } from 'vitest';
import { CreatureType } from '../types';
import { createEntity } from '../gameEngine';
import { resolveMorphology, resolveMorphologyMotion } from '../morphology';
import { dealDamage } from '../systems/combat';

const fish = () => {
  const entity = createEntity(CreatureType.CLOWN_FISH, 0, 0);
  entity.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed: 42 };
  return entity;
};

describe('V3-04A 共享动作状态', () => {
  it('待机保持低幅尾摆与呼吸，不产生转向偏置', () => {
    const entity = fish(); entity.vx = 0; entity.vy = 0; entity.isIdle = true;
    const motion = resolveMorphologyMotion(entity, resolveMorphology(entity));
    expect(motion.speedRatio).toBe(0);
    expect(motion.turn).toBe(0);
    expect(motion.tailAmplitude).toBeGreaterThan(0);
    expect(motion.tailAmplitude).toBeLessThan(resolveMorphology(entity).motion.tailAmplitude);
    expect(motion.breathAmplitude).toBeGreaterThan(0);
  });

  it('直游与加速提高尾摆振幅和频率，并轻微拉直身体', () => {
    const entity = fish(); const morphology = resolveMorphology(entity);
    entity.vx = entity.speed; entity.vy = 0; entity.angle = 0; entity.isIdle = false;
    const cruise = resolveMorphologyMotion(entity, morphology);
    entity.vx = entity.speed * 1.8; entity.speedBoostTimer = 30;
    const boost = resolveMorphologyMotion(entity, morphology);
    expect(boost.tailAmplitude).toBeGreaterThan(cruise.tailAmplitude);
    expect(boost.tailFrequency).toBeGreaterThan(cruise.tailFrequency);
    expect(boost.bodyStretch).toBeGreaterThan(cruise.bodyStretch);
    expect(boost.breathAmplitude).toBeLessThan(cruise.breathAmplitude);
  });

  it('转弯只弯曲脊柱，成对鳍始终保持镜像等幅', () => {
    const entity = fish(); entity.angle = 0; entity.vx = 0; entity.vy = entity.speed;
    const left = resolveMorphologyMotion(entity, resolveMorphology(entity));
    entity.vy = -entity.speed;
    const right = resolveMorphologyMotion(entity, resolveMorphology(entity));
    expect(left.turn).toBeGreaterThan(0);
    expect(left.leftFin).toBeCloseTo(left.rightFin);
    expect(right.turn).toBeLessThan(0);
    expect(right.leftFin).toBeCloseTo(right.rightFin);
    expect(right.leftFin).toBeCloseTo(left.leftFin);
    expect(Math.abs(left.turn)).toBeLessThanOrEqual(1);
  });

  it('低速非待机触发刹停双鳍展开，恢复巡航后回到对称姿态', () => {
    const entity = fish(); const morphology = resolveMorphology(entity);
    entity.isIdle = false; entity.angle = 0; entity.vx = entity.speed * 0.15; entity.vy = 0;
    const braking = resolveMorphologyMotion(entity, morphology);
    entity.vx = entity.speed; entity.angle = 0;
    const recovered = resolveMorphologyMotion(entity, morphology);
    expect(braking.braking).toBe(true);
    expect(braking.leftFin).toBeCloseTo(braking.rightFin);
    expect(braking.leftFin).toBeGreaterThan(recovered.leftFin);
    expect(recovered.braking).toBe(false);
    expect(recovered.leftFin).toBeCloseTo(recovered.rightFin);
  });

  it('有效伤害启动短促受击压缩，无敌伤害不产生视觉反应', () => {
    const target = fish(); target.invulnerableTimer = 0;
    expect(dealDamage(target, 5)).toBe(5);
    expect(target.hitReactionTimer).toBeGreaterThan(0);
    const hit = resolveMorphologyMotion(target, resolveMorphology(target));
    expect(hit.hitReaction).toBeGreaterThan(0);
    expect(hit.bodyStretch).toBeLessThan(1);
    const protectedFish = fish(); protectedFish.invulnerableTimer = 10;
    expect(dealDamage(protectedFish, 5)).toBe(0);
    expect(protectedFish.hitReactionTimer).toBeUndefined();
  });
});
