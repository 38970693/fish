import type { Graphics } from 'pixi.js';
import type { Particle } from '../types';

export const isBoostTrail = (p: Particle): boolean => p.shape === 'BOOST_JET' || p.shape === 'BOOST_BUBBLE';

const opacity = (p: Particle) => Math.max(0, Math.min(1, p.life / p.maxLife));

// Sample once: soft droplets and a rounded, three-lobed little flame.
const softJetOutlines = {
  JET: Array.from({ length: 28 }, (_, i) => {
    const a = i * Math.PI * 2 / 28;
    return [-0.15 + Math.cos(a) * 0.65, Math.sin(a) * (0.6 + Math.cos(a) * 0.18)];
  }),
  FLAME: Array.from({ length: 32 }, (_, i) => {
    const a = i * Math.PI * 2 / 32;
    const petal = 0.87 + Math.cos(a * 3) * 0.1;
    return [-0.2 + Math.cos(a) * 0.7 * petal, Math.sin(a) * 0.85 * petal];
  }),
};

/** 两套渲染器共用圆润轮廓和奶糖配色。 */
const jetPoints = (p: Particle, width: number, length: number): number[] => {
  const c = Math.cos(p.spin ?? 0);
  const s = Math.sin(p.spin ?? 0);
  const outline = softJetOutlines[p.boostStyle === 'FLAME' ? 'FLAME' : 'JET'];
  return outline
    .flatMap(([x, y]) => [p.x + c * x * length - s * y * width, p.y + s * x * length + c * y * width]);
};

const brighten = (color: string, amount: number): string => {
  const rgb = parseInt(color.slice(1), 16);
  return '#' + [16, 8, 0].map(shift => {
    const channel = (rgb >> shift) & 255;
    return Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, '0');
  }).join('');
};

export const drawBoostTrailCanvas = (ctx: CanvasRenderingContext2D, p: Particle): void => {
  const fade = opacity(p);
  ctx.save();
  if (p.shape === 'BOOST_BUBBLE') {
    const radius = p.size * (1 + (1 - fade) * 0.6);
    ctx.globalAlpha = fade * 0.65;
    ctx.strokeStyle = p.color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f0f9ff';
    ctx.beginPath(); ctx.arc(p.x - radius * 0.25, p.y - radius * 0.25, radius * 0.28, 0, Math.PI * 2); ctx.fill();
  } else {
    const polygon = (width: number, length: number, color: string, alpha: number) => {
      const points = jetPoints(p, width, length);
      ctx.beginPath(); ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
      ctx.closePath(); ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.fill();
    };
    const length = (p.length ?? 24) * (0.7 + fade * 0.3);
    polygon(p.size * 2.4, length * 1.15, p.color, fade * fade * 0.16);
    polygon(p.size, length, brighten(p.color, 0.4), fade * fade * 0.6);
    polygon(p.size * 0.4, length * 0.8, brighten(p.color, 0.85), fade * fade * 0.85);
  }
  ctx.restore();
};

export const drawBoostTrailPixi = (g: Graphics, p: Particle): void => {
  const fade = opacity(p);
  if (p.shape === 'BOOST_BUBBLE') {
    const radius = p.size * (1 + (1 - fade) * 0.6);
    g.circle(p.x, p.y, radius).stroke({ color: p.color, width: 1, alpha: fade * 0.65 });
    g.circle(p.x - radius * 0.25, p.y - radius * 0.25, radius * 0.28).fill({ color: '#f0f9ff', alpha: fade * 0.65 });
  } else {
    const length = (p.length ?? 24) * (0.7 + fade * 0.3);
    g.poly(jetPoints(p, p.size * 2.4, length * 1.15)).fill({ color: p.color, alpha: fade * fade * 0.16 });
    g.poly(jetPoints(p, p.size, length)).fill({ color: brighten(p.color, 0.4), alpha: fade * fade * 0.6 });
    g.poly(jetPoints(p, p.size * 0.4, length * 0.8)).fill({ color: brighten(p.color, 0.85), alpha: fade * fade * 0.85 });
  }
};
