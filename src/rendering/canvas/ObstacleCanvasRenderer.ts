import type { Obstacle } from '../../types';
import { OBSTACLE_ECOLOGY, stableObstacleSample } from '../../data/obstacleEcology';
import { drawCuteObstacleDecoration } from '../obstacles/cuteOceanDecor';
const drawEcologyFeature = (ctx: CanvasRenderingContext2D, obstacle: Obstacle, visualTime: number): void => {
  const radius = obstacle.radius;
  if (obstacle.feature === 'BRITTLE') {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fde68a';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 5;
    ctx.lineWidth = Math.max(2, radius * 0.025);
    for (let i = 0; i < 4; i += 1) {
      const angle = i * Math.PI * 0.5 + stableObstacleSample(obstacle.id, 550) * 0.7;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 0.08, Math.sin(angle) * radius * 0.08);
      ctx.lineTo(Math.cos(angle + 0.12) * radius * 0.34, Math.sin(angle + 0.12) * radius * 0.34);
      ctx.lineTo(Math.cos(angle - 0.08) * radius * 0.58, Math.sin(angle - 0.08) * radius * 0.58);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    return;
  }
  if (obstacle.feature !== 'VENT') return;
  const active = obstacle.featureState === 'ACTIVE';
  const warning = obstacle.featureState === 'WARNING';
  ctx.save();
  const range = OBSTACLE_ECOLOGY.VENT_RANGE;
  if (active || warning) {
    const progress = warning
      ? 1 - (obstacle.featureTimer ?? 0) / OBSTACLE_ECOLOGY.VENT_WARNING_FRAMES
      : 1;
    ctx.globalAlpha = active ? 0.1 : 0.035 + progress * 0.045;
    ctx.fillStyle = active ? '#67e8f9' : '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = active ? '#67e8f9' : '#fbbf24';
    ctx.lineWidth = Math.max(2, radius * 0.018);
    if (warning) {
      ctx.globalAlpha = 0.35 + progress * 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.48 + progress * (range - radius * 0.48), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      for (let i = 0; i < 3; i += 1) {
        const waveRadius = radius * 0.36 + ((visualTime * 2.8 + i * range / 3) % (range - radius * 0.36));
        ctx.globalAlpha = 0.52 * (1 - waveRadius / range);
        ctx.beginPath();
        ctx.arc(0, 0, waveRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = active ? '#a5f3fc' : warning ? '#fcd34d' : '#475569';
  ctx.lineWidth = Math.max(3, radius * 0.035);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (warning) {
    const pulse = 0.34 + (1 - (obstacle.featureTimer ?? 0) / OBSTACLE_ECOLOGY.VENT_WARNING_FRAMES) * 0.22;
    ctx.strokeStyle = '#fbbf24';
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (active) {
    for (let i = 0; i < 9; i += 1) {
      const travel = (visualTime * (2.6 + i * 0.08) + i * 47) % range;
      const angle = i * 2.39996 + visualTime * 0.012;
      ctx.fillStyle = i % 2 ? '#cffafe' : '#67e8f9';
      ctx.globalAlpha = 0.82 - travel / range * 0.58;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * travel, Math.sin(angle) * travel, Math.max(3, radius * 0.045 * (1 - travel / range * 0.45)), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};

export const drawObstacleCanvas = (ctx: CanvasRenderingContext2D, obstacle: Obstacle, visualTime: number): void => {
  drawCuteObstacleDecoration(ctx, obstacle, visualTime);
  if (obstacle.featureState === 'BROKEN') return;
  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);
  drawEcologyFeature(ctx, obstacle, visualTime);
  ctx.restore();
};
