import type { Obstacle } from '../../types';
import { resolveObstacleAppearance, type NormalizedPoint, type ObstacleAppearance } from '../obstacles/ObstacleAppearance';
import { OBSTACLE_ECOLOGY, stableObstacleSample } from '../../data/obstacleEcology';

const tracePolygon = (ctx: CanvasRenderingContext2D, points: NormalizedPoint[], radius: number): void => {
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = point.x * radius;
    const y = point.y * radius;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
};

const spotColor = (appearance: ObstacleAppearance, tone: 'LIGHT' | 'DARK' | 'ACCENT'): string =>
  tone === 'LIGHT' ? appearance.palette.light : tone === 'DARK' ? appearance.palette.dark : appearance.palette.accent;

const drawGround = (ctx: CanvasRenderingContext2D, radius: number, appearance: ObstacleAppearance): void => {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = appearance.palette.ground;
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.48, radius * 0.94, radius * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = appearance.palette.light;
  for (let i = 0; i < 4; i += 1) {
    const angle = appearance.rotation + i * 2.37;
    ctx.beginPath();
    ctx.ellipse(Math.cos(angle) * radius * (0.62 + i * 0.05), radius * 0.62 + Math.sin(angle) * radius * 0.12, radius * 0.055, radius * 0.028, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawRock = (ctx: CanvasRenderingContext2D, radius: number, appearance: ObstacleAppearance): void => {
  tracePolygon(ctx, appearance.silhouette, radius);
  ctx.fillStyle = appearance.palette.base;
  ctx.fill();
  ctx.strokeStyle = appearance.palette.dark;
  ctx.lineWidth = Math.max(2, radius * 0.035);
  ctx.stroke();

  ctx.save();
  tracePolygon(ctx, appearance.silhouette, radius);
  ctx.clip();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = appearance.palette.light;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.78, -radius * 0.12);
  ctx.lineTo(-radius * 0.25, -radius * 0.72);
  ctx.lineTo(radius * 0.62, -radius * 0.42);
  ctx.lineTo(radius * 0.12, -radius * 0.03);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = appearance.palette.dark;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.75, radius * 0.15);
  ctx.lineTo(radius * 0.18, radius * 0.03);
  ctx.lineTo(radius * 0.76, radius * 0.6);
  ctx.lineTo(-radius * 0.5, radius * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = appearance.palette.dark;
  ctx.globalAlpha = 0.72;
  for (const stroke of appearance.strokes) {
    ctx.lineWidth = Math.max(1.5, radius * stroke.width);
    ctx.beginPath();
    stroke.points.forEach((point, i) => i === 0
      ? ctx.moveTo(point.x * radius, point.y * radius)
      : ctx.lineTo(point.x * radius, point.y * radius));
    ctx.stroke();
  }
  ctx.globalAlpha = 0.9;
  for (const spot of appearance.spots) {
    ctx.fillStyle = spotColor(appearance, spot.tone);
    ctx.beginPath();
    ctx.arc(spot.x * radius, spot.y * radius, spot.size * radius, 0, Math.PI * 2);
    ctx.fill();
    if (spot.tone !== 'DARK') {
      ctx.strokeStyle = appearance.palette.dark;
      ctx.lineWidth = Math.max(1, radius * 0.012);
      ctx.stroke();
    }
  }
};

const drawCoral = (ctx: CanvasRenderingContext2D, radius: number, appearance: ObstacleAppearance): void => {
  if (appearance.variant === 'BRAIN') {
    tracePolygon(ctx, appearance.silhouette, radius);
    ctx.fillStyle = appearance.palette.base;
    ctx.fill();
    ctx.strokeStyle = appearance.palette.dark;
    ctx.lineWidth = Math.max(2, radius * 0.035);
    ctx.stroke();
    ctx.save();
    tracePolygon(ctx, appearance.silhouette, radius);
    ctx.clip();
    ctx.strokeStyle = appearance.palette.light;
    ctx.globalAlpha = 0.72;
    ctx.lineCap = 'round';
    for (const stroke of appearance.strokes) {
      ctx.lineWidth = Math.max(1.5, radius * stroke.width);
      ctx.beginPath();
      stroke.points.forEach((point, i) => i === 0
        ? ctx.moveTo(point.x * radius, point.y * radius)
        : ctx.lineTo(point.x * radius, point.y * radius));
      ctx.stroke();
    }
    ctx.restore();
  } else {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const baseY = radius * 0.48;
    const branchEnds: Array<{ x: number; y: number }> = [];
    for (const branch of appearance.branches) {
      const endX = Math.sin(branch.angle) * branch.length * radius;
      const endY = baseY - Math.cos(branch.angle) * branch.length * radius;
      branchEnds.push({ x: endX, y: endY });
      const controlX = endX * 0.46 + branch.bend * radius;
      const controlY = baseY - branch.length * radius * 0.48;
      ctx.strokeStyle = appearance.palette.dark;
      ctx.lineWidth = Math.max(3, branch.width * radius * 1.65);
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      ctx.quadraticCurveTo(controlX, controlY, endX, endY);
      ctx.stroke();
      ctx.strokeStyle = appearance.palette.base;
      ctx.lineWidth = Math.max(2, branch.width * radius);
      ctx.stroke();
      const forkX = endX * branch.fork;
      const forkY = baseY + (endY - baseY) * branch.fork;
      const forkEndX = forkX + Math.cos(branch.angle) * radius * 0.2 * (branch.angle < 0 ? -1 : 1);
      const forkEndY = forkY - radius * 0.22;
      ctx.beginPath();
      ctx.moveTo(forkX, forkY);
      ctx.lineTo(forkEndX, forkEndY);
      ctx.stroke();
      ctx.fillStyle = appearance.palette.light;
      ctx.beginPath();
      ctx.arc(endX, endY, Math.max(2.5, branch.width * radius * 0.68), 0, Math.PI * 2);
      ctx.fill();
    }
    if (appearance.variant === 'FAN') {
      ctx.strokeStyle = appearance.palette.light;
      ctx.lineWidth = Math.max(1.2, radius * 0.018);
      ctx.globalAlpha = 0.58;
      for (const fraction of [0.48, 0.72]) {
        ctx.beginPath();
        branchEnds.forEach((end, i) => {
          const x = end.x * fraction;
          const y = baseY + (end.y - baseY) * fraction;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    tracePolygon(ctx, appearance.silhouette, radius);
    ctx.fillStyle = appearance.palette.base;
    ctx.fill();
    ctx.strokeStyle = appearance.palette.dark;
    ctx.lineWidth = Math.max(2, radius * 0.03);
    ctx.stroke();
  }

  for (const spot of appearance.spots) {
    ctx.fillStyle = spotColor(appearance, spot.tone);
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.arc(spot.x * radius, spot.y * radius, spot.size * radius, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawSeaweed = (ctx: CanvasRenderingContext2D, radius: number, appearance: ObstacleAppearance, visualTime: number): void => {
  tracePolygon(ctx, appearance.silhouette, radius);
  ctx.fillStyle = appearance.palette.ground;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.globalAlpha = 1;

  for (const [index, blade] of appearance.blades.entries()) {
    const baseX = blade.offset * radius;
    const baseY = radius * 0.55;
    const topY = baseY - blade.height * radius;
    const sway = Math.sin(visualTime * 0.035 + blade.phase) * radius * (0.07 + blade.depth * 0.035);
    const topX = baseX + blade.lean * radius + sway;
    const width = Math.max(2.2, blade.width * radius);
    ctx.fillStyle = index % 3 === 0 ? appearance.palette.light : appearance.palette.base;
    ctx.globalAlpha = 0.58 + blade.depth * 0.4;
    ctx.beginPath();
    ctx.moveTo(baseX - width, baseY);
    ctx.bezierCurveTo(baseX - width * 0.4, baseY - blade.height * radius * 0.32, topX - sway * 0.35 - width, topY + radius * 0.22, topX, topY);
    ctx.bezierCurveTo(topX + width, topY + radius * 0.18, baseX + width * 0.65, baseY - blade.height * radius * 0.28, baseX + width, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = appearance.palette.dark;
    ctx.lineWidth = Math.max(1, radius * 0.012);
    ctx.stroke();
    ctx.strokeStyle = appearance.palette.light;
    ctx.globalAlpha *= 0.45;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY - radius * 0.04);
    ctx.quadraticCurveTo(baseX + sway * 0.3, (baseY + topY) / 2, topX, topY + radius * 0.04);
    ctx.stroke();
    if (appearance.variant === 'REED') {
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = appearance.palette.accent;
      ctx.beginPath();
      ctx.ellipse(topX, topY - radius * 0.035, width * 1.35, width * 0.72, -0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 0.9;
  for (const spot of appearance.spots) {
    ctx.fillStyle = spotColor(appearance, spot.tone);
    ctx.beginPath();
    ctx.arc(spot.x * radius, spot.y * radius, spot.size * radius, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawBrokenRock = (ctx: CanvasRenderingContext2D, obstacle: Obstacle, appearance: ObstacleAppearance): void => {
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2 + stableObstacleSample(obstacle.id, 510) * 0.8;
    const distance = obstacle.radius * (0.2 + stableObstacleSample(obstacle.id, 511 + i) * 0.48);
    const size = obstacle.radius * (0.1 + stableObstacleSample(obstacle.id, 530 + i) * 0.11);
    ctx.save();
    ctx.translate(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.62 + obstacle.radius * 0.28);
    ctx.rotate(angle);
    ctx.fillStyle = i % 3 === 0 ? appearance.palette.light : appearance.palette.base;
    ctx.strokeStyle = appearance.palette.dark;
    ctx.lineWidth = Math.max(1.5, obstacle.radius * 0.018);
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.45);
    ctx.lineTo(-size * 0.42, -size * 0.68);
    ctx.lineTo(size * 0.7, -size * 0.46);
    ctx.lineTo(size, size * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
};

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

export const drawObstacleCanvas = (
  ctx: CanvasRenderingContext2D,
  obstacle: Obstacle,
  visualTime: number,
): void => {
  const appearance = resolveObstacleAppearance(obstacle);
  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);
  drawGround(ctx, obstacle.radius, appearance);
  if (obstacle.featureState === 'BROKEN') {
    drawBrokenRock(ctx, obstacle, appearance);
    ctx.restore();
    return;
  }
  ctx.rotate(appearance.rotation);
  if (obstacle.type === 'ROCK') drawRock(ctx, obstacle.radius, appearance);
  else if (obstacle.type === 'CORAL') drawCoral(ctx, obstacle.radius, appearance);
  else drawSeaweed(ctx, obstacle.radius, appearance, visualTime);
  ctx.rotate(-appearance.rotation);
  drawEcologyFeature(ctx, obstacle, visualTime);
  ctx.restore();
};
