import { OBSTACLE_ECOLOGY, stableObstacleSample } from '../data/obstacleEcology';
import type { Entity, FrameContext, GameState, Obstacle, PlayerState } from '../types';
import { createParticle } from './combat';

type MovingCreature = Entity | PlayerState;

/** 给新生成的岩石挂载生态特征；只依赖 id，不消耗世界随机流。 */
export const configureObstacleEcology = (obstacle: Obstacle): Obstacle => {
  if (obstacle.ecologyInitialized) return obstacle;
  obstacle.ecologyInitialized = true;
  if (obstacle.type !== 'ROCK' || obstacle.feature) return obstacle;
  const roll = stableObstacleSample(obstacle.id, 401);
  if (roll < OBSTACLE_ECOLOGY.VENT_CHANCE) {
    obstacle.feature = 'VENT';
    obstacle.featureState = 'IDLE';
    obstacle.featureTimer = 60 + Math.floor(stableObstacleSample(obstacle.id, 402) * OBSTACLE_ECOLOGY.VENT_IDLE_FRAMES);
  } else if (roll < OBSTACLE_ECOLOGY.VENT_CHANCE + OBSTACLE_ECOLOGY.BRITTLE_CHANCE) {
    obstacle.feature = 'BRITTLE';
    obstacle.featureState = 'IDLE';
    obstacle.maxDurability = OBSTACLE_ECOLOGY.BRITTLE_DURABILITY;
    obstacle.durability = OBSTACLE_ECOLOGY.BRITTLE_DURABILITY;
  }
  return obstacle;
};

export interface VentForce {
  x: number;
  y: number;
  strength: number;
}

/** 采样俯视角的中心对称上涌流。返回 null 表示目标不在泉眼范围内。 */
export const sampleVentForce = (obstacle: Obstacle, target: { x: number; y: number }): VentForce | null => {
  const dx = target.x - obstacle.x;
  const dy = target.y - obstacle.y;
  const distance = Math.hypot(dx, dy);
  const range = OBSTACLE_ECOLOGY.VENT_RANGE + obstacle.radius * 0.35;
  if (distance < obstacle.radius * 0.24 || distance > range) return null;
  const fade = 1 - distance / range;
  const strength = OBSTACLE_ECOLOGY.VENT_PUSH * (0.35 + fade * 0.65);
  return { x: dx / distance * strength, y: dy / distance * strength, strength };
};

const applyVentForce = (obstacle: Obstacle, creature: MovingCreature): void => {
  const force = sampleVentForce(obstacle, creature);
  if (!force) return;
  creature.x += force.x;
  creature.y += force.y;
  creature.vx += force.x;
  creature.vy += force.y;
};

const breakBrittleRock = (state: GameState, obstacle: Obstacle, ctx: FrameContext): void => {
  obstacle.durability = 0;
  obstacle.featureState = 'BROKEN';
  obstacle.featureTimer = 0;
  const count = OBSTACLE_ECOLOGY.BRITTLE_COIN_COUNT;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + stableObstacleSample(obstacle.id, 420) * 0.7;
    const distance = obstacle.radius * (0.45 + stableObstacleSample(obstacle.id, 421 + i) * 0.25);
    state.powerUps.push({
      id: `${obstacle.id}-ore-${state.time}-${i}`,
      x: obstacle.x + Math.cos(angle) * distance,
      y: obstacle.y + Math.sin(angle) * distance,
      type: 'COIN',
      radius: 14,
    });
  }
  for (let i = 0; i < 22; i += 1) state.particles.push(createParticle(obstacle.x, obstacle.y, i % 3 === 0 ? '#fbbf24' : '#94a3b8'));
  state.player.speechBubble = { text: '岩层破碎：捷径开启！', timer: 75, color: '#fbbf24' };
  ctx.events.emit('pickup', { x: obstacle.x, y: obstacle.y, label: '岩层破碎', color: '#fbbf24' });
};

const tryBreakBrittleRock = (state: GameState, obstacle: Obstacle, ctx: FrameContext): void => {
  if (obstacle.featureState === 'BROKEN' || !state.player.boost.active) return;
  const player = state.player;
  const dx = obstacle.x - player.x;
  const dy = obstacle.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance > obstacle.radius + player.radius + 5) return;
  const approachSpeed = (player.vx * dx + player.vy * dy) / distance;
  if (approachSpeed < Math.max(0.8, player.speed * 0.25)) return;
  breakBrittleRock(state, obstacle, ctx);
};

const advanceVent = (state: GameState, obstacle: Obstacle): void => {
  obstacle.featureState ??= 'IDLE';
  obstacle.featureTimer = (obstacle.featureTimer ?? OBSTACLE_ECOLOGY.VENT_IDLE_FRAMES) - 1;
  if (obstacle.featureTimer <= 0) {
    if (obstacle.featureState === 'IDLE') {
      obstacle.featureState = 'WARNING';
      obstacle.featureTimer = OBSTACLE_ECOLOGY.VENT_WARNING_FRAMES;
    } else if (obstacle.featureState === 'WARNING') {
      obstacle.featureState = 'ACTIVE';
      obstacle.featureTimer = OBSTACLE_ECOLOGY.VENT_ACTIVE_FRAMES;
    } else {
      obstacle.featureState = 'IDLE';
      obstacle.featureTimer = OBSTACLE_ECOLOGY.VENT_IDLE_FRAMES;
    }
  }
  if (obstacle.featureState !== 'ACTIVE') return;
  applyVentForce(obstacle, state.player);
  for (const entity of state.entities) applyVentForce(obstacle, entity);
  if (state.time % 6 === 0) {
    const bubbleAngle = stableObstacleSample(obstacle.id, 440 + state.time / 6) * Math.PI * 2;
    const mouthX = obstacle.x + Math.cos(bubbleAngle) * obstacle.radius * 0.18;
    const mouthY = obstacle.y + Math.sin(bubbleAngle) * obstacle.radius * 0.18;
    const particle = createParticle(mouthX, mouthY, '#67e8f9');
    particle.vx += Math.cos(bubbleAngle) * 3.2;
    particle.vy += Math.sin(bubbleAngle) * 3.2;
    particle.size *= 1.4;
    state.particles.push(particle);
  }
};

export const obstacleEcologySystem = (state: GameState, ctx: FrameContext): void => {
  for (const obstacle of state.obstacles) {
    if (!obstacle.ecologyInitialized) configureObstacleEcology(obstacle);
    if (obstacle.feature === 'BRITTLE') tryBreakBrittleRock(state, obstacle, ctx);
    else if (obstacle.feature === 'VENT') advanceVent(state, obstacle);
  }
};
