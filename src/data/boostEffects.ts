import { clamp } from '../core/math';
import type { BoostEffect, BoostStyle, Cosmetics, Entity, Particle } from '../types';

export const DEFAULT_BOOST_EFFECT: Readonly<BoostEffect> = {
  style: 'JET', color: '#38bdf8', length: 1, width: 1, bubbles: true,
};

export const BOOST_STYLE_OPTIONS: readonly { value: BoostStyle; label: string }[] = [
  { value: 'JET', label: '奶光小喷流' },
  { value: 'FLAME', label: '暖糖小火苗' },
  { value: 'BUBBLES', label: '啵啵气泡' },
  { value: 'NONE', label: '关闭效果' },
];

export const BOOST_COLOR_OPTIONS = [
  { value: '#38bdf8', label: '汽水蓝' }, { value: '#fb923c', label: '蜜桃橙' },
  { value: '#f43f5e', label: '草莓粉' }, { value: '#a78bfa', label: '香芋紫' },
  { value: '#4ade80', label: '薄荷绿' }, { value: '#facc15', label: '奶黄金' },
] as const;

export const getBoostEffect = (cosmetics?: Cosmetics): BoostEffect => {
  const effect = { ...DEFAULT_BOOST_EFFECT, ...cosmetics?.boostEffect };
  return {
    ...effect,
    style: BOOST_STYLE_OPTIONS.some(o => o.value === effect.style) ? effect.style : 'JET',
    color: /^#[\da-f]{6}$/i.test(effect.color) ? effect.color : DEFAULT_BOOST_EFFECT.color,
    length: Number.isFinite(effect.length) ? clamp(effect.length, 0.6, 1.6) : 1,
    width: Number.isFinite(effect.width) ? clamp(effect.width, 0.6, 1.6) : 1,
  };
};

/** 游戏与试衣镜共用发射逻辑，不消耗玩法随机数。 */
export const createBoostParticles = (e: Entity, time: number, bubble: boolean): Particle[] => {
  const effect = getBoostEffect(e.cosmetics);
  if (effect.style === 'NONE') return [];
  const forwardX = Math.cos(e.angle), forwardY = Math.sin(e.angle);
  const intensity = clamp(0.55 + ((e.accelerationMult ?? 1) - 1) * 0.22, 0.55, 1);
  const pulse = 0.88 + Math.sin(time * 0.65 + e.animOffset) * 0.12;
  const length = clamp(Math.hypot(e.vx, e.vy) * 3 + e.radius * 0.4, 18, 55) * intensity * effect.length;
  const tail = e.radius * 1.55 + length * 0.3;
  const x = e.x - forwardX * tail, y = e.y - forwardY * tail;
  const particles: Particle[] = [];
  if (effect.style !== 'BUBBLES') particles.push({
    id: `boost-jet-${e.id}-${time}`, sourceId: e.id, x, y,
    vx: -forwardX * 1.2, vy: -forwardY * 1.2,
    life: 0.36, maxLife: 0.36, color: effect.color,
    size: clamp(e.radius * 0.22, 3.5, 11) * intensity * pulse * effect.width,
    shape: 'BOOST_JET', spin: e.angle, length, boostStyle: effect.style,
  });
  if (effect.style === 'BUBBLES' || (bubble && effect.bubbles)) {
    const side = time % 4 < 2 ? -1 : 1;
    const spread = e.radius * (0.16 + Math.sin(time * 0.73 + e.animOffset) * 0.045);
    particles.push({
      id: `boost-bubble-${e.id}-${time}`, sourceId: e.id,
      x: x - forwardY * spread * side, y: y + forwardX * spread * side,
      vx: -forwardX * (0.7 + (effect.length - 1) * 0.5) - forwardY * side * 0.24,
      vy: -forwardY * (0.7 + (effect.length - 1) * 0.5) + forwardX * side * 0.24,
      life: 0.6 * effect.length, maxLife: 0.6 * effect.length, color: effect.color,
      size: clamp(e.radius * 0.085, 1.8, 4.5) * effect.width, shape: 'BOOST_BUBBLE',
    });
  }
  return particles;
};
