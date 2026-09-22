import type { PondId } from './ponds';

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
export const createCurrentZones = (pondId: PondId): WaterCurrentZone[] =>
  POND_CURRENTS[pondId].map(zone => ({ ...zone }));

