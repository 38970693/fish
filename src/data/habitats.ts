import type { PondId } from './ponds';
import type { PondLayout } from './pondLayout';

/**
 * 有界的单向洋流区。坐标是世界坐标，length 沿 angle 方向，width 与其垂直。
 * strength 是每逻辑帧附加的位移，刻意低于普通小鱼自身速度，保证逆流仍能退出。
 */
export interface WaterCurrentZone {
  id: string;
  name: string;
  x: number;
  y: number;
  length: number;
  width: number;
  angle: number;
  strength: number;
  color: string;
}

const POND_CURRENTS: Record<PondId, readonly WaterCurrentZone[]> = {
  CLEAR: [{
    id: 'clear-east-stream', name: '银鳞顺流', x: 3650, y: 2800,
    length: 920, width: 260, angle: -0.18, strength: 1.25, color: '#67e8f9',
  }],
  CORAL: [{
    id: 'coral-reef-stream', name: '珊瑚回流', x: 2750, y: 3700,
    length: 840, width: 240, angle: -0.82, strength: 1.4, color: '#5eead4',
  }],
  ABYSS: [{
    id: 'abyss-updraft', name: '深渊上升流', x: 2250, y: 2850,
    length: 780, width: 280, angle: -1.28, strength: 1.55, color: '#818cf8',
  }],
};

/** 返回新数组，避免换塘或调试代码改写静态配置。 */
export const createCurrentZones = (pondId: PondId, layout?: PondLayout): WaterCurrentZone[] => {
  const zones = POND_CURRENTS[pondId].map(zone => ({ ...zone }));
  if (!layout) return zones;

  // 程序化布局的洋流跟随当局主路线。这样障碍、传送门、渲染与实际流场
  // 都能消费同一份布局，而不是继续依赖一组与 seed 无关的固定坐标。
  const route = layout.routes.find(candidate => candidate.id === 'spawn-shop') ?? layout.routes[0];
  if (!route || route.points.length < 2) return zones;
  const a = route.points[Math.max(0, Math.floor((route.points.length - 1) / 2))];
  const b = route.points[Math.min(route.points.length - 1, Math.floor((route.points.length - 1) / 2) + 1)];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return zones.map((zone, i) => ({
    ...zone,
    id: `${zone.id}-layout-${layout.version}-${layout.seed}`,
    x: midpoint.x,
    y: midpoint.y,
    angle: Math.atan2(dy, dx),
    length: Math.min(zone.length, Math.max(620, length * 0.72)),
    width: Math.min(zone.width, Math.max(220, route.width * 0.55)),
    // 多洋流时沿法线轻微错开，避免完全重叠；目前每塘只有一条。
    ...(i === 0 ? null : {
      x: midpoint.x - Math.sin(Math.atan2(dy, dx)) * i * 180,
      y: midpoint.y + Math.cos(Math.atan2(dy, dx)) * i * 180,
    }),
  }));
};
