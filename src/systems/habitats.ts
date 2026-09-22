import type { Entity, FrameContext, GameState } from '../types';
import type { WaterCurrentZone } from '../data/habitats';

export interface CurrentSample {
  factor: number;
  pushX: number;
  pushY: number;
}

/**
 * 采样矩形流区。边缘使用短距离渐入，避免跨过边线时速度突然跳变。
 * 返回 factor=0 代表不在流区内。
 */
export const sampleCurrent = (
  zone: WaterCurrentZone,
  point: { x: number; y: number }
): CurrentSample => {
  const dx = point.x - zone.x;
  const dy = point.y - zone.y;
  const cos = Math.cos(zone.angle);
  const sin = Math.sin(zone.angle);
  const along = dx * cos + dy * sin;
  const across = -dx * sin + dy * cos;
  const halfLength = zone.length / 2;
  const halfWidth = zone.width / 2;
  if (Math.abs(along) > halfLength || Math.abs(across) > halfWidth) {
    return { factor: 0, pushX: 0, pushY: 0 };
  }

  const longitudinalFeather = Math.min(1, (halfLength - Math.abs(along)) / 80);
  const lateralFeather = Math.min(1, (halfWidth - Math.abs(across)) / 55);
  const factor = Math.max(0, Math.min(longitudinalFeather, lateralFeather));
  return {
    factor,
    pushX: cos * zone.strength * factor,
    pushY: sin * zone.strength * factor,
  };
};

const applyCurrent = (actor: Entity, currents: readonly WaterCurrentZone[]): void => {
  actor.currentZoneId = undefined;
  actor.currentStrength = 0;
  for (const zone of currents) {
    const sample = sampleCurrent(zone, actor);
    if (sample.factor <= 0) continue;
    actor.x += sample.pushX;
    actor.y += sample.pushY;
    actor.vx += sample.pushX;
    actor.vy += sample.pushY;
    actor.currentZoneId = zone.id;
    actor.currentStrength = sample.factor;
    return;
  }
};

/** 玩家、野生鱼、玩家队与敌队共用同一条流场规则。 */
export const habitatsSystem = (state: GameState, _ctx: FrameContext): void => {
  const currents = state.currents;
  if (!currents?.length) {
    state.player.currentZoneId = undefined;
    state.player.currentStrength = 0;
    return;
  }
  applyCurrent(state.player, currents);
  for (const entity of state.entities) {
    if (entity.health > 0) applyCurrent(entity, currents);
  }
};

