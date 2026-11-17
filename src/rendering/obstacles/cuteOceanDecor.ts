import type { Obstacle } from '../../types';
import type { PondScenery } from '../../data/pondScenery';
import { cuteHeart, cuteOval, cuteRoundRect, cuteStar } from '../cuteCosmeticShapes';
import { resolveObstacleAppearance, obstacleSample, type NormalizedPoint, type ObstacleAppearance } from './ObstacleAppearance';

type Ctx = CanvasRenderingContext2D;

/** Shared vector art: no textures, gameplay randomness, or changes to collision geometry. */
const paint = (ctx: Ctx, fill: string, outline: string, width: number) => {
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = width; ctx.stroke();
};

const smoothOutline = (ctx: Ctx, points: readonly NormalizedPoint[], r: number) => {
  const last = points[points.length - 1], first = points[0];
  ctx.beginPath(); ctx.moveTo((last.x + first.x) * r / 2, (last.y + first.y) * r / 2);
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length];
    ctx.quadraticCurveTo(p.x * r, p.y * r, (p.x + next.x) * r / 2, (p.y + next.y) * r / 2);
  });
  ctx.closePath();
};

const stroke = (ctx: Ctx, color: string, width: number) => {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
};

const sleepyFace = (ctx: Ctx, x: number, y: number, s: number) => {
  ctx.save(); ctx.translate(x, y);
  for (const side of [-1, 1]) {
    cuteOval(ctx, side * s * 0.95, s * 0.32, s * 0.4, s * 0.21, '#f5b6c5');
    ctx.beginPath(); ctx.moveTo(side * s * 0.62 - s * 0.2, -s * 0.12);
    ctx.quadraticCurveTo(side * s * 0.62, s * 0.12, side * s * 0.62 + s * 0.2, -s * 0.12);
    stroke(ctx, '#64758b', Math.max(1, s * 0.16));
  }
  ctx.beginPath(); ctx.moveTo(-s * 0.15, s * 0.24);
  ctx.quadraticCurveTo(0, s * 0.42, s * 0.15, s * 0.24); stroke(ctx, '#64758b', Math.max(1, s * 0.12));
  ctx.restore();
};

const flower = (ctx: Ctx, x: number, y: number, size: number, color: string) => {
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    cuteOval(ctx, x + Math.cos(a) * size * 0.48, y + Math.sin(a) * size * 0.48, size * 0.4, size * 0.4, color);
  }
  cuteOval(ctx, x, y, size * 0.28, size * 0.28, '#fff0ad');
};

const pearl = (ctx: Ctx, x: number, y: number, r: number) => {
  cuteOval(ctx, x, y, r, r, '#ede9f8');
  ctx.strokeStyle = '#acaac9'; ctx.lineWidth = Math.max(0.8, r * 0.1); ctx.stroke();
  cuteOval(ctx, x - r * 0.3, y - r * 0.35, r * 0.3, r * 0.23, '#fffdf8');
};

const shell = (ctx: Ctx, x: number, y: number, size: number, color = '#ffcbdc') => {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(-size * 0.35, size * 0.5);
  ctx.bezierCurveTo(-size * 1.3, -size * 0.1, -size * 0.95, -size * 0.72, -size * 0.55, -size * 0.58);
  ctx.bezierCurveTo(-size * 0.35, -size * 1.05, size * 0.15, -size * 0.95, size * 0.3, -size * 0.68);
  ctx.bezierCurveTo(size * 0.7, -size * 1, size * 1.35, -size * 0.35, size * 0.5, size * 0.5);
  ctx.quadraticCurveTo(0, size * 0.76, -size * 0.35, size * 0.5); ctx.closePath();
  paint(ctx, color, '#bf91ad', Math.max(1, size * 0.08));
  for (const offset of [-0.55, 0, 0.55]) {
    ctx.beginPath(); ctx.moveTo(0, size * 0.42);
    ctx.quadraticCurveTo(offset * size * 0.7, 0, offset * size, -size * 0.5);
    stroke(ctx, '#fff3e8', Math.max(1, size * 0.09));
  }
  pearl(ctx, 0, size * 0.35, size * 0.2); ctx.restore();
};

const starfish = (ctx: Ctx, x: number, y: number, size: number) => {
  cuteStar(ctx, x, y, size); paint(ctx, '#ffdb9d', '#cea37b', Math.max(1, size * 0.08));
  for (const side of [-1, 1]) cuteOval(ctx, x + side * size * 0.18, y - size * 0.02, size * 0.055, size * 0.065, '#987b83');
  cuteOval(ctx, x - size * 0.33, y + size * 0.1, size * 0.11, size * 0.06, '#f4b6a2');
  cuteOval(ctx, x + size * 0.33, y + size * 0.1, size * 0.11, size * 0.06, '#f4b6a2');
};

const ground = (ctx: Ctx, r: number, color: string) => {
  ctx.save(); ctx.globalAlpha *= 0.32;
  cuteOval(ctx, 0, r * 0.48, r * 0.98, r * 0.28, color);
  ctx.globalAlpha *= 0.7;
  for (let i = 0; i < 5; i++) cuteOval(ctx, r * (-0.7 + i * 0.34), r * (0.56 + i % 2 * 0.07), r * 0.027, r * 0.02, '#fff0d8');
  ctx.restore();
};

const rock = (ctx: Ctx, r: number, a: ObstacleAppearance) => {
  smoothOutline(ctx, a.silhouette, r); paint(ctx, a.palette.base, a.palette.dark, Math.max(1.6, r * 0.025));
  ctx.save(); ctx.globalAlpha *= 0.68;
  cuteOval(ctx, -r * 0.25, -r * 0.4, r * 0.28, r * 0.12, a.palette.light);
  cuteOval(ctx, r * 0.13, -r * 0.49, r * 0.075, r * 0.055, a.palette.light);
  ctx.globalAlpha *= 0.42;
  cuteOval(ctx, 0, r * 0.52, r * 0.53, r * 0.09, a.palette.dark); ctx.restore();
  if (a.variant === 'STRATA') {
    for (const y of [-0.12, 0.36]) {
      ctx.beginPath(); ctx.moveTo(-r * 0.56, y * r);
      ctx.bezierCurveTo(-r * 0.2, (y + 0.08) * r, r * 0.2, (y - 0.08) * r, r * 0.52, y * r);
      stroke(ctx, a.palette.light, Math.max(1.4, r * 0.025));
    }
  } else if (a.variant === 'VOLCANIC') {
    for (const spot of a.spots.slice(0, 4)) cuteOval(ctx, spot.x * r, spot.y * r, spot.size * r, spot.size * r * 0.7, a.palette.light);
  }
  sleepyFace(ctx, r * 0.15, r * 0.1, r * 0.15);
  // A tiny sprout makes the rounded stone feel like a little garden ornament.
  cuteOval(ctx, -r * 0.48, r * 0.4, r * 0.15, r * 0.08, '#a3dcb5');
  cuteOval(ctx, -r * 0.34, r * 0.33, r * 0.06, r * 0.13, '#cef0c0');
};

const coral = (ctx: Ctx, r: number, a: ObstacleAppearance) => {
  if (a.variant === 'BRAIN') {
    smoothOutline(ctx, a.silhouette, r); paint(ctx, a.palette.base, a.palette.dark, Math.max(1.6, r * 0.025));
    for (const row of [-0.4, -0.16, 0.3]) {
      ctx.beginPath(); ctx.moveTo(-r * 0.54, row * r);
      for (let i = 0; i < 3; i++) ctx.bezierCurveTo(r * (-0.48 + i * 0.36), r * (row - 0.12), r * (-0.3 + i * 0.36), r * (row + 0.12), r * (-0.18 + i * 0.36), row * r);
      stroke(ctx, a.palette.light, Math.max(2, r * 0.04));
    }
    sleepyFace(ctx, r * 0.05, r * 0.12, r * 0.14);
  } else if (a.variant === 'FAN') {
    // A scalloped sea fan, with soft ribs instead of a wire-like angular lattice.
    ctx.beginPath(); ctx.moveTo(0, r * 0.57);
    ctx.bezierCurveTo(-r * 0.9, r * 0.45, -r * 1.06, -r * 0.3, -r * 0.6, -r * 0.45);
    ctx.quadraticCurveTo(-r * 0.52, -r * 0.86, -r * 0.2, -r * 0.65);
    ctx.quadraticCurveTo(0, -r * 0.96, r * 0.2, -r * 0.65);
    ctx.quadraticCurveTo(r * 0.57, -r * 0.83, r * 0.64, -r * 0.43);
    ctx.bezierCurveTo(r * 1.09, -r * 0.22, r * 0.84, r * 0.5, 0, r * 0.57); ctx.closePath();
    paint(ctx, a.palette.base, a.palette.dark, Math.max(1.6, r * 0.025));
    for (const x of [-0.58, -0.3, 0, 0.3, 0.58]) {
      ctx.beginPath(); ctx.moveTo(0, r * 0.48);
      ctx.quadraticCurveTo(x * r * 0.68, -r * 0.05, x * r, r * (-0.48 + Math.abs(x) * 0.24));
      stroke(ctx, a.palette.light, Math.max(2, r * 0.034));
    }
    sleepyFace(ctx, 0, r * 0.24, r * 0.11);
  } else {
    for (const branch of a.branches.filter((_, i) => i % 2 === 0)) {
      const x = Math.sin(branch.angle) * branch.length * r;
      const y = r * 0.46 - Math.cos(branch.angle) * branch.length * r;
      const width = Math.max(4, branch.width * r * 1.5);
      const path = () => {
        ctx.beginPath(); ctx.moveTo(0, r * 0.47);
        ctx.quadraticCurveTo(x * 0.5 + branch.bend * r * 0.5, r * 0.02, x, y);
      };
      path(); stroke(ctx, a.palette.dark, width + Math.max(2, r * 0.045));
      path(); stroke(ctx, a.palette.base, width);
      const side = x < 0 ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x * 0.5, y * 0.5 + r * 0.22);
      ctx.quadraticCurveTo(x * 0.55 + r * side * 0.22, y * 0.5 + r * 0.13, x * 0.55 + r * side * 0.19, y * 0.5);
      stroke(ctx, a.palette.base, width * 0.73);
      cuteOval(ctx, x - r * 0.02, y - r * 0.015, width * 0.25, width * 0.18, a.palette.light);
    }
    cuteOval(ctx, 0, r * 0.47, r * 0.54, r * 0.21, a.palette.base);
    sleepyFace(ctx, 0, r * 0.46, r * 0.13);
  }
  flower(ctx, -r * 0.5, r * 0.51, r * 0.12, a.palette.accent);
};

const seaweed = (ctx: Ctx, r: number, a: ObstacleAppearance, time: number) => {
  cuteOval(ctx, 0, r * 0.49, r * 0.74, r * 0.18, a.palette.dark);
  for (const [i, blade] of a.blades.entries()) {
    const x = blade.offset * r, base = r * 0.53, top = base - blade.height * r;
    const sway = Math.sin(time * 0.035 + blade.phase) * r * (0.05 + blade.depth * 0.025);
    const tip = x + blade.lean * r * 0.65 + sway;
    const w = Math.max(r * 0.055, blade.width * r * 1.14);
    ctx.beginPath(); ctx.moveTo(x - w * 0.5, base);
    ctx.bezierCurveTo(x - w, base - r * 0.25, tip - w * 1.05, top + r * 0.12, tip - w * 0.4, top);
    ctx.quadraticCurveTo(tip + w * 0.1, top - w * 0.45, tip + w * 0.45, top + w * 0.18);
    ctx.bezierCurveTo(tip + w * 1.1, top + r * 0.2, x + w, base - r * 0.14, x + w * 0.5, base);
    ctx.closePath(); paint(ctx, i % 3 === 0 ? a.palette.light : a.palette.base, a.palette.dark, Math.max(0.9, r * 0.012));
    ctx.beginPath(); ctx.moveTo(x, base - r * 0.03); ctx.quadraticCurveTo(x + sway * 0.35, (base + top) / 2, tip, top + r * 0.1);
    stroke(ctx, '#e0f6d4', Math.max(1, r * 0.016));
    if (a.variant === 'REED' && i % 2 === 0) flower(ctx, tip, top + r * 0.02, r * 0.085, a.palette.accent);
  }
  pearl(ctx, -r * 0.43, r * 0.54, r * 0.065);
  pearl(ctx, -r * 0.29, r * 0.59, r * 0.044);
};

const reefStone = (ctx: Ctx, o: Obstacle, a: ObstacleAppearance): void => {
  const r = o.radius, reef = o.reef!;
  if (reef.anchor) {
    ctx.save(); ctx.translate(reef.centerOffsetX, reef.centerOffsetY); ctx.rotate(reef.angle);
    const halfWidth = reef.gap / 2 - 6;
    cuteRoundRect(ctx, -reef.halfLength, -halfWidth, reef.halfLength * 2, halfWidth * 2, halfWidth);
    ctx.fillStyle = 'rgba(250,230,186,0.12)'; ctx.fill();
    for (let x = -reef.halfLength + 30; x < reef.halfLength; x += 38) {
      ctx.beginPath(); ctx.moveTo(x - 5, -halfWidth * 0.45);
      ctx.quadraticCurveTo(x + 8, 0, x - 5, halfWidth * 0.45);
      stroke(ctx, 'rgba(255,239,200,0.3)', 2);
    }
    for (const side of [-1, 1]) shell(ctx, side * (reef.halfLength - 12), 0, 7, '#fff0b9');
    ctx.restore();
  }
  // The drawn perimeter is the physical circle; ornaments stay within it.
  ctx.beginPath(); ctx.arc(0, 0, r - 1.5, 0, Math.PI * 2);
  paint(ctx, o.type === 'CORAL' ? '#d8bde5' : a.palette.base, o.type === 'CORAL' ? '#9e87b7' : a.palette.dark, 3);
  cuteOval(ctx, -r * 0.22, -r * 0.44, r * 0.34, r * 0.14, '#f5edf4');
  ctx.save(); ctx.globalAlpha *= 0.24;
  cuteOval(ctx, 0, r * 0.48, r * 0.68, r * 0.16, a.palette.dark); ctx.restore();
  if (o.type === 'CORAL') {
    for (const x of [-0.45, -0.12, 0.24, 0.49]) {
      const y = -0.13 + Math.abs(x) * 0.2;
      cuteOval(ctx, x * r, y * r, r * 0.13, r * 0.2, x > 0 ? '#ffd2c7' : '#bde8d8');
      cuteOval(ctx, x * r - r * 0.025, (y - 0.08) * r, r * 0.035, r * 0.05, '#fff4e2');
    }
  }
  sleepyFace(ctx, 0, r * 0.28, r * 0.15);
  shell(ctx, -r * 0.51, r * 0.37, r * 0.13, '#ffdfcf');
  flower(ctx, r * 0.51, r * 0.35, r * 0.11, '#fff0b9');
};

export const drawCuteObstacleDecoration = (ctx: Ctx, obstacle: Obstacle, time: number): void => {
  const a = resolveObstacleAppearance(obstacle), r = obstacle.radius;
  ctx.save(); ctx.translate(obstacle.x, obstacle.y); ground(ctx, r, a.palette.ground);
  if (obstacle.reef && obstacle.featureState !== 'BROKEN') {
    reefStone(ctx, obstacle, a); ctx.restore(); return;
  }
  if (obstacle.featureState === 'BROKEN') {
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.39996 + obstacleSample(obstacle.id, 510);
      const distance = r * (0.2 + obstacleSample(obstacle.id, 511 + i) * 0.4);
      const s = r * (0.09 + obstacleSample(obstacle.id, 530 + i) * 0.09);
      cuteOval(ctx, Math.cos(angle) * distance, Math.sin(angle) * distance * 0.6 + r * 0.27, s, s * 0.72, a.palette.base);
      ctx.strokeStyle = a.palette.dark; ctx.lineWidth = Math.max(1, r * 0.015); ctx.stroke();
    }
  } else {
    ctx.save(); ctx.rotate(a.rotation);
    if (obstacle.type === 'ROCK') rock(ctx, r, a);
    else if (obstacle.type === 'CORAL') coral(ctx, r, a);
    else seaweed(ctx, r, a, time);
    ctx.restore();
    if (obstacle.type === 'ROCK') shell(ctx, r * 0.59, r * 0.64, r * 0.115, a.palette.accent);
    else if (obstacle.type === 'CORAL') starfish(ctx, r * 0.54, r * 0.58, r * 0.15);
  }
  ctx.restore();
};

const sandRipples = (ctx: Ctx, r: number) => {
  ctx.save(); ctx.globalAlpha *= 0.36;
  for (let i = 0; i < 5; i++) {
    const y = r * (-0.22 + i * 0.13), width = r * (0.5 + Math.sin(i * 1.7) * 0.18);
    ctx.beginPath(); ctx.moveTo(-width, y);
    ctx.bezierCurveTo(-width * 0.38, y - r * 0.09, width * 0.35, y + r * 0.07, width, y);
    stroke(ctx, '#f7e9bd', Math.max(1.2, r * 0.018));
  }
  for (const [x, y, s] of [[-0.65, 0.12, 0.06], [0.56, 0.3, 0.045], [0.71, -0.2, 0.035]])
    cuteOval(ctx, x * r, y * r, s * r, s * r * 0.65, '#e2d6b9');
  ctx.restore();
};

const anemone = (ctx: Ctx, x: number, y: number, r: number, tint = '#efb8dc') => {
  ctx.save(); ctx.translate(x, y);
  for (let i = 0; i < 9; i++) {
    const a = i * Math.PI * 2 / 9, endX = Math.cos(a) * r * 0.74, endY = Math.sin(a) * r * 0.52;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.17, Math.sin(a) * r * 0.12);
    ctx.quadraticCurveTo(endX - Math.sin(a) * r * 0.17, endY + Math.cos(a) * r * 0.12, endX, endY);
    stroke(ctx, tint, r * 0.17);
    cuteOval(ctx, endX - r * 0.02, endY - r * 0.035, r * 0.055, r * 0.03, '#fff2eb');
  }
  cuteOval(ctx, 0, 0, r * 0.37, r * 0.25, '#fff0be');
  cuteOval(ctx, 0, r * 0.025, r * 0.2, r * 0.14, '#eccda9');
  flower(ctx, -r * 0.57, r * 0.47, r * 0.15, '#bcecd3'); ctx.restore();
};

const sponge = (ctx: Ctx, r: number, phase: number) => {
  const colors = ['#ffd8a2', '#c6bcf0', '#acdacf'];
  for (let i = 0; i < 3; i++) {
    ctx.save(); ctx.translate(r * (-0.36 + i * 0.35), r * 0.28); ctx.rotate((i - 1) * 0.11);
    const height = r * (0.56 + (i === 1 ? 0.17 : 0)), width = r * (i === 1 ? 0.27 : 0.24);
    cuteRoundRect(ctx, -width / 2, -height, width, height + r * 0.06, width * 0.4);
    paint(ctx, colors[(i + Math.floor(phase)) % 3], '#a9aaa7', Math.max(1, r * 0.015));
    cuteOval(ctx, 0, -height + width * 0.23, width * 0.35, width * 0.17, '#9aa9b7');
    ctx.lineWidth = Math.max(1, r * 0.025); ctx.strokeStyle = '#fff4dd'; ctx.stroke();
    for (let pore = 0; pore < 3; pore++) {
      cuteOval(ctx, width * (pore % 2 ? 0.17 : -0.16), -height * (0.3 + pore * 0.21), width * 0.085, width * 0.1, '#aaafa4');
    }
    ctx.restore();
  }
  pearl(ctx, r * 0.42, r * 0.34, r * 0.08);
};

const garden = (ctx: Ctx, r: number) => {
  sandRipples(ctx, r);
  cuteOval(ctx, 0, r * 0.29, r * 0.77, r * 0.22, 'rgba(191,223,177,0.2)');
  for (let i = 0; i < 4; i++) {
    const x = r * (-0.5 + i * 0.12), top = r * (-0.22 - i % 2 * 0.23);
    ctx.beginPath(); ctx.moveTo(x, r * 0.28);
    ctx.quadraticCurveTo(x - r * 0.13, top * 0.4, x + r * 0.03, top);
    stroke(ctx, i % 2 ? '#b7e6c1' : '#8dcfc1', r * 0.08);
    cuteOval(ctx, x - r * 0.06, top * 0.5, r * 0.1, r * 0.048, '#b8e8bb');
  }
  for (const [x, h] of [[0.14, 0.46], [0.35, 0.65], [0.55, 0.4]]) {
    ctx.beginPath(); ctx.moveTo(x * r, r * 0.3);
    ctx.quadraticCurveTo((x + 0.08) * r, -h * r * 0.4, x * r, -h * r);
    stroke(ctx, x === 0.35 ? '#ffc6ae' : '#e5b5d6', r * 0.09);
    cuteOval(ctx, x * r - r * 0.01, -h * r, r * 0.055, r * 0.07, '#fff0d9');
  }
  anemone(ctx, -r * 0.05, r * 0.24, r * 0.25);
  shell(ctx, -r * 0.46, r * 0.5, r * 0.18, '#cbbce7');
  starfish(ctx, r * 0.5, r * 0.47, r * 0.2);
  pearl(ctx, r * 0.2, r * 0.55, r * 0.07);
  pearl(ctx, r * 0.33, r * 0.59, r * 0.045);
};

const bottle = (ctx: Ctx, r: number) => {
  sandRipples(ctx, r); ctx.save(); ctx.rotate(0.25);
  cuteRoundRect(ctx, -r * 0.21, -r * 0.29, r * 0.42, r * 0.65, r * 0.16);
  paint(ctx, 'rgba(178,231,224,0.58)', '#b5e5df', Math.max(1.2, r * 0.025));
  cuteRoundRect(ctx, -r * 0.095, -r * 0.48, r * 0.19, r * 0.25, r * 0.05);
  paint(ctx, '#b2ded6', '#a6c9cc', Math.max(1, r * 0.02));
  cuteRoundRect(ctx, -r * 0.1, -r * 0.52, r * 0.2, r * 0.11, r * 0.035);
  paint(ctx, '#dab391', '#b39380', Math.max(1, r * 0.014));
  cuteRoundRect(ctx, -r * 0.125, -r * 0.16, r * 0.25, r * 0.33, r * 0.035);
  ctx.fillStyle = '#fff0d9'; ctx.fill();
  cuteHeart(ctx, 0, r * 0.02, r * 0.075); ctx.fillStyle = '#efb6c9'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-r * 0.15, -r * 0.12); ctx.lineTo(-r * 0.15, r * 0.17);
  stroke(ctx, '#effffd', Math.max(1.5, r * 0.035));
  ctx.restore(); shell(ctx, r * 0.37, r * 0.4, r * 0.14, '#ffe0b1');
};

const bubbles = (ctx: Ctx, r: number, time: number, phase: number) => {
  cuteOval(ctx, 0, r * 0.4, r * 0.38, r * 0.14, '#a5c4cf');
  cuteOval(ctx, -r * 0.09, r * 0.37, r * 0.15, r * 0.035, '#d8e5ec');
  for (let i = 0; i < 4; i++) {
    const travel = ((time * 0.004 + i * 0.25 + phase / (Math.PI * 2)) % 1 + 1) % 1;
    const x = Math.sin(travel * 4 + i) * r * 0.18, y = r * (0.22 - travel * 0.9), size = r * (0.055 + i * 0.009);
    ctx.save(); ctx.globalAlpha *= Math.sin(travel * Math.PI) * 0.75;
    cuteOval(ctx, x, y, size, size, 'rgba(206,246,246,0.15)');
    ctx.strokeStyle = '#c5eef5'; ctx.lineWidth = Math.max(0.9, r * 0.015); ctx.stroke();
    cuteOval(ctx, x - size * 0.25, y - size * 0.25, size * 0.2, size * 0.16, '#fafff3');
    ctx.restore();
  }
  pearl(ctx, -r * 0.34, r * 0.45, r * 0.06);
};

/** Decorative floor marks use the same low-contrast art in both rendering engines. */
export const drawCutePondScenery = (ctx: Ctx, mark: PondScenery, visualTime = 0): void => {
  const r = mark.radius;
  ctx.save(); ctx.translate(mark.x, mark.y); ctx.globalAlpha *= 0.62;
  ground(ctx, r * 0.85, '#ebdebc');
  const motif = Math.floor(Math.abs(mark.angle) * 10) % 5;
  if (mark.kind === 'GARDEN') garden(ctx, r);
  else if (mark.kind === 'ANEMONE') {
    sandRipples(ctx, r); anemone(ctx, -r * 0.17, 0, r * 0.65);
    anemone(ctx, r * 0.44, r * 0.3, r * 0.32, '#bfc3ed'); pearl(ctx, -r * 0.42, r * 0.48, r * 0.07);
  } else if (mark.kind === 'SPONGE') sponge(ctx, r, mark.angle);
  else if (mark.kind === 'SAND') { sandRipples(ctx, r); shell(ctx, r * 0.6, r * 0.23, r * 0.12, '#e7daca'); }
  else if (mark.kind === 'BUBBLES') bubbles(ctx, r, visualTime, mark.angle);
  else if (mark.kind === 'BOTTLE') bottle(ctx, r);
  else if (motif === 1) shell(ctx, 0, 0, r * 0.48);
  else if (motif === 2) starfish(ctx, 0, 0, r * 0.65);
  else if (mark.kind === 'LILY') {
    cuteOval(ctx, 0, r * 0.13, r * 0.74, r * 0.43, '#8fd4b4');
    ctx.beginPath(); ctx.moveTo(0, r * 0.12); ctx.quadraticCurveTo(r * 0.25, r * 0.2, r * 0.62, r * 0.33);
    stroke(ctx, '#d4f6cb', Math.max(1.2, r * 0.026));
    flower(ctx, -r * 0.13, -r * 0.1, r * 0.34, '#ffd7e3');
  } else if (mark.kind === 'CORAL') {
    for (const x of [-0.42, 0, 0.42]) {
      ctx.beginPath(); ctx.moveTo(x * r * 0.35, r * 0.4);
      ctx.quadraticCurveTo(x * r * 0.9, 0, x * r, -r * (0.45 - Math.abs(x) * 0.25));
      stroke(ctx, x === 0 ? '#ffc8a2' : '#eab6d9', r * 0.16);
      cuteOval(ctx, x * r - r * 0.02, -r * (0.43 - Math.abs(x) * 0.25), r * 0.035, r * 0.025, '#fff1df');
    }
    pearl(ctx, r * 0.27, r * 0.4, r * 0.11);
  } else {
    cuteOval(ctx, 0, r * 0.1, r * 0.85, r * 0.64, 'rgba(177,164,244,0.12)');
    for (const [x, size] of [[-0.27, 0.48], [0.37, 0.29]]) {
      cuteOval(ctx, x * r, r * 0.19, r * size * 0.2, r * size * 0.67, '#d9d5fb');
      ctx.beginPath(); ctx.moveTo(r * (x - size), -r * 0.06);
      ctx.bezierCurveTo(r * (x - size), -r * size * 1.1, r * (x + size), -r * size * 1.1, r * (x + size), -r * 0.06);
      ctx.quadraticCurveTo(x * r, r * 0.13, r * (x - size), -r * 0.06); ctx.closePath();
      paint(ctx, '#c9b8f1', '#9d8bc2', Math.max(1, r * 0.018));
      for (const offset of [-0.4, 0.35]) cuteOval(ctx, r * (x + size * offset), -r * size * 0.42, r * size * 0.13, r * size * 0.09, '#fff0f6');
    }
    pearl(ctx, -r * 0.32, r * 0.37, r * 0.08);
  }
  ctx.restore();
};
