import { Graphics } from 'pixi.js';
import type { Obstacle } from '../../types';
import { OBSTACLE_ECOLOGY, stableObstacleSample } from '../../data/obstacleEcology';
import { drawCuteObstacleDecoration } from '../obstacles/cuteOceanDecor';
import { CosmeticGraphicsContext } from './CosmeticGraphicsContext';
const drawEcologyFeature = (g: Graphics, obstacle: Obstacle, visualTime: number): void => {
  const radius = obstacle.radius;
  if (obstacle.feature === 'BRITTLE') {
    for (let i = 0; i < 4; i += 1) {
      const angle = i * Math.PI * 0.5 + stableObstacleSample(obstacle.id, 550) * 0.7;
      g.moveTo(obstacle.x + Math.cos(angle) * radius * 0.08, obstacle.y + Math.sin(angle) * radius * 0.08)
        .lineTo(obstacle.x + Math.cos(angle + 0.12) * radius * 0.34, obstacle.y + Math.sin(angle + 0.12) * radius * 0.34)
        .lineTo(obstacle.x + Math.cos(angle - 0.08) * radius * 0.58, obstacle.y + Math.sin(angle - 0.08) * radius * 0.58)
        .stroke({ color: '#fde68a', width: Math.max(2, radius * 0.025), cap: 'round', join: 'round' });
    }
    return;
  }
  if (obstacle.feature !== 'VENT') return;
  const active = obstacle.featureState === 'ACTIVE';
  const warning = obstacle.featureState === 'WARNING';
  const range = OBSTACLE_ECOLOGY.VENT_RANGE;
  if (active || warning) {
    const progress = warning ? 1 - (obstacle.featureTimer ?? 0) / OBSTACLE_ECOLOGY.VENT_WARNING_FRAMES : 1;
    g.circle(obstacle.x, obstacle.y, range)
      .fill({ color: active ? '#67e8f9' : '#fbbf24', alpha: active ? 0.1 : 0.035 + progress * 0.045 });
    if (warning) {
      g.circle(obstacle.x, obstacle.y, radius * 0.48 + progress * (range - radius * 0.48))
        .stroke({ color: '#fbbf24', width: Math.max(2, radius * 0.018), alpha: 0.35 + progress * 0.45 });
    } else {
      for (let i = 0; i < 3; i += 1) {
        const waveRadius = radius * 0.36 + ((visualTime * 2.8 + i * range / 3) % (range - radius * 0.36));
        g.circle(obstacle.x, obstacle.y, waveRadius)
          .stroke({ color: '#67e8f9', width: Math.max(2, radius * 0.018), alpha: 0.52 * (1 - waveRadius / range) });
      }
    }
  }
  g.circle(obstacle.x, obstacle.y, radius * 0.24).fill({ color: '#0f172a' })
    .stroke({ color: active ? '#a5f3fc' : warning ? '#fcd34d' : '#475569', width: Math.max(3, radius * 0.035) });
  if (warning) {
    const pulse = 0.34 + (1 - (obstacle.featureTimer ?? 0) / OBSTACLE_ECOLOGY.VENT_WARNING_FRAMES) * 0.22;
    g.circle(obstacle.x, obstacle.y, radius * pulse).stroke({ color: '#fbbf24', width: Math.max(2, radius * 0.025), alpha: 0.75 });
  }
  if (active) {
    for (let i = 0; i < 9; i += 1) {
      const travel = (visualTime * (2.6 + i * 0.08) + i * 47) % range;
      const angle = i * 2.39996 + visualTime * 0.012;
      const x = obstacle.x + Math.cos(angle) * travel;
      const y = obstacle.y + Math.sin(angle) * travel;
      g.circle(x, y, Math.max(3, radius * 0.045 * (1 - travel / range * 0.45)))
        .fill({ color: i % 2 ? '#cffafe' : '#67e8f9', alpha: 0.82 - travel / range * 0.58 });
    }
  }
};

export const drawObstaclePixi = (g: Graphics, obstacle: Obstacle, visualTime: number): void => {
  drawCuteObstacleDecoration(new CosmeticGraphicsContext(g).asCanvas(), obstacle, visualTime);
  if (obstacle.featureState !== 'BROKEN') drawEcologyFeature(g, obstacle, visualTime);
};
