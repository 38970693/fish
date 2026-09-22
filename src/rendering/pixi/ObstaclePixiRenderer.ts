import { Graphics } from 'pixi.js';
import type { Obstacle } from '../../types';
import { resolveObstacleAppearance, type NormalizedPoint, type ObstacleAppearance } from '../obstacles/ObstacleAppearance';
import { OBSTACLE_ECOLOGY, stableObstacleSample } from '../../data/obstacleEcology';

type WorldPoint = { x: number; y: number };

const transformPoint = (obstacle: Obstacle, rotation: number, point: NormalizedPoint): WorldPoint => {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const x = point.x * obstacle.radius;
  const y = point.y * obstacle.radius;
  return { x: obstacle.x + x * cos - y * sin, y: obstacle.y + x * sin + y * cos };
};

const polygon = (obstacle: Obstacle, appearance: ObstacleAppearance, points = appearance.silhouette): number[] =>
  points.flatMap(point => {
    const world = transformPoint(obstacle, appearance.rotation, point);
    return [world.x, world.y];
  });

const toneColor = (appearance: ObstacleAppearance, tone: 'LIGHT' | 'DARK' | 'ACCENT'): string =>
  tone === 'LIGHT' ? appearance.palette.light : tone === 'DARK' ? appearance.palette.dark : appearance.palette.accent;

const rotateLocal = (obstacle: Obstacle, appearance: ObstacleAppearance, x: number, y: number): WorldPoint =>
  transformPoint(obstacle, appearance.rotation, { x: x / obstacle.radius, y: y / obstacle.radius });

const drawGround = (g: Graphics, obstacle: Obstacle, appearance: ObstacleAppearance): void => {
  g.ellipse(obstacle.x, obstacle.y + obstacle.radius * 0.48, obstacle.radius * 0.94, obstacle.radius * 0.34)
    .fill({ color: appearance.palette.ground, alpha: 0.28 });
  for (let i = 0; i < 4; i += 1) {
    const angle = appearance.rotation + i * 2.37;
    g.ellipse(
      obstacle.x + Math.cos(angle) * obstacle.radius * (0.62 + i * 0.05),
      obstacle.y + obstacle.radius * 0.62 + Math.sin(angle) * obstacle.radius * 0.12,
      obstacle.radius * 0.055,
      obstacle.radius * 0.028,
    ).fill({ color: appearance.palette.light, alpha: 0.22 });
  }
};

const drawRock = (g: Graphics, obstacle: Obstacle, appearance: ObstacleAppearance): void => {
  g.poly(polygon(obstacle, appearance)).fill({ color: appearance.palette.base })
    .stroke({ color: appearance.palette.dark, width: Math.max(2, obstacle.radius * 0.035) });

  const highlight = [
    { x: -0.66, y: -0.1 }, { x: -0.24, y: -0.65 }, { x: 0.56, y: -0.38 }, { x: 0.1, y: -0.03 },
  ];
  g.poly(polygon(obstacle, appearance, highlight)).fill({ color: appearance.palette.light, alpha: 0.28 });
  const shade = [{ x: -0.62, y: 0.2 }, { x: 0.18, y: 0.04 }, { x: 0.62, y: 0.52 }, { x: -0.44, y: 0.62 }];
  g.poly(polygon(obstacle, appearance, shade)).fill({ color: appearance.palette.dark, alpha: 0.2 });

  for (const stroke of appearance.strokes) {
    stroke.points.forEach((point, index) => {
      const world = transformPoint(obstacle, appearance.rotation, point);
      if (index === 0) g.moveTo(world.x, world.y); else g.lineTo(world.x, world.y);
    });
    g.stroke({ color: appearance.palette.dark, width: Math.max(1.5, obstacle.radius * stroke.width), alpha: 0.72, cap: 'round', join: 'round' });
  }
  for (const spot of appearance.spots) {
    const point = transformPoint(obstacle, appearance.rotation, spot);
    g.circle(point.x, point.y, spot.size * obstacle.radius).fill({ color: toneColor(appearance, spot.tone), alpha: 0.9 });
    if (spot.tone !== 'DARK') g.circle(point.x, point.y, spot.size * obstacle.radius)
      .stroke({ color: appearance.palette.dark, width: Math.max(1, obstacle.radius * 0.012), alpha: 0.65 });
  }
};

const drawCoral = (g: Graphics, obstacle: Obstacle, appearance: ObstacleAppearance): void => {
  if (appearance.variant === 'BRAIN') {
    g.poly(polygon(obstacle, appearance)).fill({ color: appearance.palette.base })
      .stroke({ color: appearance.palette.dark, width: Math.max(2, obstacle.radius * 0.035) });
    for (const stroke of appearance.strokes) {
      stroke.points.forEach((point, index) => {
        const world = transformPoint(obstacle, appearance.rotation, point);
        if (index === 0) g.moveTo(world.x, world.y); else g.lineTo(world.x, world.y);
      });
      g.stroke({ color: appearance.palette.light, width: Math.max(1.5, obstacle.radius * stroke.width), alpha: 0.72, cap: 'round' });
    }
  } else {
    const baseY = obstacle.radius * 0.48;
    const branchEnds: Array<{ x: number; y: number }> = [];
    for (const branch of appearance.branches) {
      const endX = Math.sin(branch.angle) * branch.length * obstacle.radius;
      const endY = baseY - Math.cos(branch.angle) * branch.length * obstacle.radius;
      branchEnds.push({ x: endX, y: endY });
      const controlX = endX * 0.46 + branch.bend * obstacle.radius;
      const controlY = baseY - branch.length * obstacle.radius * 0.48;
      const start = rotateLocal(obstacle, appearance, 0, baseY);
      const control = rotateLocal(obstacle, appearance, controlX, controlY);
      const end = rotateLocal(obstacle, appearance, endX, endY);
      g.moveTo(start.x, start.y).quadraticCurveTo(control.x, control.y, end.x, end.y)
        .stroke({ color: appearance.palette.dark, width: Math.max(3, branch.width * obstacle.radius * 1.65), cap: 'round' });
      g.moveTo(start.x, start.y).quadraticCurveTo(control.x, control.y, end.x, end.y)
        .stroke({ color: appearance.palette.base, width: Math.max(2, branch.width * obstacle.radius), cap: 'round' });
      const forkX = endX * branch.fork;
      const forkY = baseY + (endY - baseY) * branch.fork;
      const forkEndX = forkX + Math.cos(branch.angle) * obstacle.radius * 0.2 * (branch.angle < 0 ? -1 : 1);
      const forkEndY = forkY - obstacle.radius * 0.22;
      const fork = rotateLocal(obstacle, appearance, forkX, forkY);
      const forkEnd = rotateLocal(obstacle, appearance, forkEndX, forkEndY);
      g.moveTo(fork.x, fork.y).lineTo(forkEnd.x, forkEnd.y)
        .stroke({ color: appearance.palette.base, width: Math.max(2, branch.width * obstacle.radius), cap: 'round' });
      g.circle(end.x, end.y, Math.max(2.5, branch.width * obstacle.radius * 0.68)).fill({ color: appearance.palette.light });
    }
    if (appearance.variant === 'FAN') {
      for (const fraction of [0.48, 0.72]) {
        branchEnds.forEach((end, index) => {
          const point = rotateLocal(obstacle, appearance, end.x * fraction, baseY + (end.y - baseY) * fraction);
          if (index === 0) g.moveTo(point.x, point.y); else g.lineTo(point.x, point.y);
        });
        g.stroke({ color: appearance.palette.light, width: Math.max(1.2, obstacle.radius * 0.018), alpha: 0.58, cap: 'round' });
      }
    }
    g.poly(polygon(obstacle, appearance)).fill({ color: appearance.palette.base })
      .stroke({ color: appearance.palette.dark, width: Math.max(2, obstacle.radius * 0.03) });
  }

  for (const spot of appearance.spots) {
    const point = transformPoint(obstacle, appearance.rotation, spot);
    g.circle(point.x, point.y, spot.size * obstacle.radius).fill({ color: toneColor(appearance, spot.tone), alpha: 0.82 });
  }
};

const drawSeaweed = (g: Graphics, obstacle: Obstacle, appearance: ObstacleAppearance, visualTime: number): void => {
  g.poly(polygon(obstacle, appearance)).fill({ color: appearance.palette.ground, alpha: 0.7 });
  for (const [index, blade] of appearance.blades.entries()) {
    const baseX = blade.offset * obstacle.radius;
    const baseY = obstacle.radius * 0.55;
    const topY = baseY - blade.height * obstacle.radius;
    const sway = Math.sin(visualTime * 0.035 + blade.phase) * obstacle.radius * (0.07 + blade.depth * 0.035);
    const topX = baseX + blade.lean * obstacle.radius + sway;
    const width = Math.max(2.2, blade.width * obstacle.radius);
    const p0 = rotateLocal(obstacle, appearance, baseX - width, baseY);
    const c1 = rotateLocal(obstacle, appearance, baseX - width * 0.4, baseY - blade.height * obstacle.radius * 0.32);
    const c2 = rotateLocal(obstacle, appearance, topX - sway * 0.35 - width, topY + obstacle.radius * 0.22);
    const top = rotateLocal(obstacle, appearance, topX, topY);
    const c3 = rotateLocal(obstacle, appearance, topX + width, topY + obstacle.radius * 0.18);
    const c4 = rotateLocal(obstacle, appearance, baseX + width * 0.65, baseY - blade.height * obstacle.radius * 0.28);
    const p1 = rotateLocal(obstacle, appearance, baseX + width, baseY);
    g.moveTo(p0.x, p0.y).bezierCurveTo(c1.x, c1.y, c2.x, c2.y, top.x, top.y)
      .bezierCurveTo(c3.x, c3.y, c4.x, c4.y, p1.x, p1.y).closePath()
      .fill({ color: index % 3 === 0 ? appearance.palette.light : appearance.palette.base, alpha: 0.58 + blade.depth * 0.4 })
      .stroke({ color: appearance.palette.dark, width: Math.max(1, obstacle.radius * 0.012), alpha: 0.78 });
    const veinStart = rotateLocal(obstacle, appearance, baseX, baseY - obstacle.radius * 0.04);
    const veinControl = rotateLocal(obstacle, appearance, baseX + sway * 0.3, (baseY + topY) / 2);
    const veinEnd = rotateLocal(obstacle, appearance, topX, topY + obstacle.radius * 0.04);
    g.moveTo(veinStart.x, veinStart.y).quadraticCurveTo(veinControl.x, veinControl.y, veinEnd.x, veinEnd.y)
      .stroke({ color: appearance.palette.light, width: Math.max(1, obstacle.radius * 0.012), alpha: 0.3 });
    if (appearance.variant === 'REED') {
      const tip = rotateLocal(obstacle, appearance, topX, topY - obstacle.radius * 0.035);
      g.ellipse(tip.x, tip.y, width * 1.35, width * 0.72).fill({ color: appearance.palette.accent, alpha: 0.94 });
    }
  }
  for (const spot of appearance.spots) {
    const point = transformPoint(obstacle, appearance.rotation, spot);
    g.circle(point.x, point.y, spot.size * obstacle.radius).fill({ color: toneColor(appearance, spot.tone), alpha: 0.9 });
  }
};

const drawBrokenRock = (g: Graphics, obstacle: Obstacle, appearance: ObstacleAppearance): void => {
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2 + stableObstacleSample(obstacle.id, 510) * 0.8;
    const distance = obstacle.radius * (0.2 + stableObstacleSample(obstacle.id, 511 + i) * 0.48);
    const size = obstacle.radius * (0.1 + stableObstacleSample(obstacle.id, 530 + i) * 0.11);
    const cx = obstacle.x + Math.cos(angle) * distance;
    const cy = obstacle.y + Math.sin(angle) * distance * 0.62 + obstacle.radius * 0.28;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const local = [[-size, size * 0.45], [-size * 0.42, -size * 0.68], [size * 0.7, -size * 0.46], [size, size * 0.38]];
    const points = local.flatMap(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
    g.poly(points).fill({ color: i % 3 === 0 ? appearance.palette.light : appearance.palette.base })
      .stroke({ color: appearance.palette.dark, width: Math.max(1.5, obstacle.radius * 0.018) });
  }
};

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
  const appearance = resolveObstacleAppearance(obstacle);
  drawGround(g, obstacle, appearance);
  if (obstacle.featureState === 'BROKEN') {
    drawBrokenRock(g, obstacle, appearance);
    return;
  }
  if (obstacle.type === 'ROCK') drawRock(g, obstacle, appearance);
  else if (obstacle.type === 'CORAL') drawCoral(g, obstacle, appearance);
  else drawSeaweed(g, obstacle, appearance, visualTime);
  drawEcologyFeature(g, obstacle, visualTime);
};
