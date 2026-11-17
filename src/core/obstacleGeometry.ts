import type { Obstacle } from '../types';

export interface Point { x: number; y: number }
export const REEF_MARGIN = 3;
export const GEOMETRY_EPSILON = 1e-5;
export const isSolidObstacle = (o: Obstacle): boolean => o.type !== 'SEAWEED' && o.featureState !== 'BROKEN';

export const pointSegmentDistance = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

export const segmentClearance = (a: Point, b: Point, obstacles: readonly Obstacle[]): number => {
  let clearance = Infinity;
  for (const o of obstacles) if (isSolidObstacle(o)) {
    clearance = Math.min(clearance, pointSegmentDistance(o, a, b) - o.radius);
  }
  return clearance;
};

export const pathClearance = (points: readonly Point[], obstacles: readonly Obstacle[]): number => {
  let clearance = Infinity;
  for (let i = 1; i < points.length; i++) clearance = Math.min(clearance, segmentClearance(points[i - 1], points[i], obstacles));
  return points.length === 1 ? segmentClearance(points[0], points[0], obstacles) : clearance;
};

export const canTraverseSegment = (a: Point, b: Point, radius: number, obstacles: readonly Obstacle[], margin = REEF_MARGIN): boolean =>
  segmentClearance(a, b, obstacles) + GEOMETRY_EPSILON >= radius + margin;

/** Entity centers are inside their own bodies: testing the complete connector also blocks buried mouths. */
export const hasObstacleOcclusion = (a: Point, b: Point, obstacles: readonly Obstacle[]): boolean =>
  segmentClearance(a, b, obstacles) < -GEOMETRY_EPSILON;
