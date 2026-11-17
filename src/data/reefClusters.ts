import type { Obstacle } from '../types';
import { pathClearance, type Point } from '../core/obstacleGeometry';

export const REEF_GAPS = [56, 88, 144] as const;
export interface ReefPassage {
  id: string;
  kind: 'GATE' | 'REFUGE';
  center: Point;
  points: Point[];
  clearance: number;
}

/** Closed side walls, two open ends. Metadata describes intent; capacity always comes from geometry. */
export const createReefCluster = (
  id: string, center: Point, angle: number, gap: number, kind: 'GATE' | 'REFUGE' = 'REFUGE',
): Obstacle[] => {
  const radius = kind === 'GATE' ? 74 : 62;
  const columns = kind === 'GATE' ? [0] : [-108, 0, 108];
  const halfLength = kind === 'GATE' ? 170 : 242;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const obstacles: Obstacle[] = [];
  for (const along of columns) for (const side of [-1, 1]) {
    const across = side * (radius + gap / 2 + (kind === 'REFUGE' && along === 0 ? 16 : 0));
    const dx = along * cos - across * sin, dy = along * sin + across * cos;
    obstacles.push({
      id: `${id}:stone:${obstacles.length}`, x: center.x + dx, y: center.y + dy, radius,
      type: side === 1 ? 'CORAL' : 'ROCK', ecologyInitialized: true,
      reef: { groupId: id, kind, angle, centerOffsetX: -dx, centerOffsetY: -dy, halfLength, gap, anchor: obstacles.length === 0 },
    });
  }
  return obstacles;
};

/** Deriving from the anchor's local offsets keeps navigation correct after world rebasing. */
export const getReefPassages = (obstacles: readonly Obstacle[]): ReefPassage[] => {
  const passages: ReefPassage[] = [];
  for (const o of obstacles) {
    if (!o.reef?.anchor || o.featureState === 'BROKEN') continue;
    const { groupId, kind, angle, centerOffsetX, centerOffsetY, halfLength } = o.reef;
    const center = { x: o.x + centerOffsetX, y: o.y + centerOffsetY };
    const points = [-halfLength, 0, halfLength].map(t => ({ x: center.x + Math.cos(angle) * t, y: center.y + Math.sin(angle) * t }));
    passages.push({ id: groupId, kind, center, points, clearance: pathClearance(points, obstacles) });
  }
  return passages;
};
