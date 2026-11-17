import type { Entity, GameState } from '../types';
import { canTraverseSegment, pointSegmentDistance, REEF_MARGIN, isSolidObstacle, type Point } from '../core/obstacleGeometry';
import { getReefPassages, type ReefPassage } from '../data/reefClusters';

const frames = new WeakMap<GameState, { time: number; source: GameState['obstacles']; passages: ReefPassage[] }>();
const waiting = new WeakMap<Entity, { targetId: string; since: number; skipUntil: number }>();
export const isReefChaseSkipped = (fish: Entity, target: Entity, time: number): boolean => {
  const memory = waiting.get(fish);
  return memory?.targetId === target.id && memory.skipUntil > time;
};
export const reefPassagesFor = (state: GameState): ReefPassage[] => {
  let cached = frames.get(state);
  if (!cached || cached.time !== state.time || cached.source !== state.obstacles) {
    cached = { time: state.time, source: state.obstacles, passages: getReefPassages(state.obstacles) };
    frames.set(state, cached);
  }
  return cached.passages;
};

/** Wait outside a protected chamber for at most three seconds, then seek another meal. */
export const reefChaseWaitPoint = (fish: Entity, target: Entity, state: GameState): Point | null => {
  for (const p of reefPassagesFor(state)) {
    if (p.kind !== 'REFUGE' || p.clearance >= fish.radius + REEF_MARGIN
      || p.clearance < target.radius + REEF_MARGIN
      || Math.hypot(target.x - p.center.x, target.y - p.center.y) > 130
      || !canTraverseSegment(target, target, target.radius, state.obstacles)) continue;
    let memory = waiting.get(fish);
    if (!memory || memory.targetId !== target.id) {
      memory = { targetId: target.id, since: state.time, skipUntil: 0 };
      waiting.set(fish, memory);
    }
    if (memory.skipUntil > 0 && memory.skipUntil <= state.time) {
      memory.since = state.time; memory.skipUntil = 0;
    }
    if (state.time - memory.since >= 180) {
      memory.skipUntil = state.time + 300;
      fish.lockId = null;
    }
    const [a, , b] = p.points;
    const exit = Math.hypot(fish.x - a.x, fish.y - a.y) < Math.hypot(fish.x - b.x, fish.y - b.y) ? a : b;
    const dx = exit.x - p.center.x, dy = exit.y - p.center.y, length = Math.hypot(dx, dy);
    return { x: exit.x + dx / length * (fish.radius + 40), y: exit.y + dy / length * (fish.radius + 40) };
  }
  waiting.delete(fish);
  return null;
};

/** Reach a safe entrance, then choose the exit away from the pursuer. */
export const findRefugeWaypoint = (fish: Entity, threat: Entity, state: GameState): Point | null => {
  let best: Point | null = null, bestCost = Infinity;
  for (const passage of reefPassagesFor(state)) {
    if (passage.kind !== 'REFUGE' || passage.clearance < fish.radius + REEF_MARGIN
      || passage.clearance >= threat.radius + REEF_MARGIN) continue;
    if (Math.hypot(fish.x - passage.center.x, fish.y - passage.center.y) > 900) continue;
    const [a, center, b] = passage.points;
    const inside = pointSegmentDistance(fish, a, b) <= passage.clearance - fish.radius + 12;
    if (inside) {
      const far = Math.hypot(threat.x - a.x, threat.y - a.y) > Math.hypot(threat.x - b.x, threat.y - b.y) ? a : b;
      if (canTraverseSegment(fish, far, fish.radius, state.obstacles)) return far;
    }
    for (const entry of [a, b]) {
      if (!canTraverseSegment(fish, entry, fish.radius, state.obstacles)) continue;
      const distance = Math.hypot(fish.x - entry.x, fish.y - entry.y);
      const threatDistance = Math.hypot(threat.x - entry.x, threat.y - entry.y);
      const cost = distance + Math.max(0, 260 - threatDistance) * 2;
      if (cost >= bestCost) continue;
      bestCost = cost; best = distance < Math.max(28, fish.radius * 2) ? center : entry;
    }
  }
  return best;
};

const detours = new WeakMap<Entity, { goal: Point; point: Point; until: number; radius: number }>();
/** Local visibility navigation; lane capacity and every connector use actual clearance. */
export const reefNavigationPoint = (fish: Entity, goal: Point, state: GameState): Point => {
  const near = state.obstacles.filter(o => isSolidObstacle(o)
    && pointSegmentDistance(o, fish, goal) < o.radius + fish.radius + 180);
  if (canTraverseSegment(fish, goal, fish.radius, near)) { detours.delete(fish); return goal; }
  const memory = detours.get(fish);
  if (memory && memory.until > state.time && memory.radius === fish.radius
    && Math.hypot(goal.x - memory.goal.x, goal.y - memory.goal.y) < 100
    && Math.hypot(fish.x - memory.point.x, fish.y - memory.point.y) > 30
    && canTraverseSegment(fish, memory.point, fish.radius, state.obstacles)) return memory.point;
  let best = goal, bestCost = Infinity;
  for (const passage of reefPassagesFor(state)) {
    if (passage.clearance < fish.radius + REEF_MARGIN) continue;
    for (const [entry, exit] of [[passage.points[0], passage.points[2]], [passage.points[2], passage.points[0]]]) {
      if (!canTraverseSegment(fish, entry, fish.radius, state.obstacles)
        || !canTraverseSegment(exit, goal, fish.radius, state.obstacles)) continue;
      const cost = Math.hypot(fish.x - entry.x, fish.y - entry.y) + Math.hypot(entry.x - exit.x, entry.y - exit.y)
        + Math.hypot(exit.x - goal.x, exit.y - goal.y);
      if (cost < bestCost) { bestCost = cost; best = Math.hypot(fish.x - entry.x, fish.y - entry.y) < 30 ? exit : entry; }
    }
  }
  const blockers = near.filter(o => !canTraverseSegment(fish, goal, fish.radius, [o]))
    .sort((a, b) => Math.hypot(a.x - fish.x, a.y - fish.y) - Math.hypot(b.x - fish.x, b.y - fish.y)).slice(0, 3);
  for (const o of blockers) for (let i = 0; i < 12; i++) {
    const angle = Math.atan2(fish.y - o.y, fish.x - o.x) + i * Math.PI / 6;
    const radius = o.radius + fish.radius + 36;
    const point = { x: o.x + Math.cos(angle) * radius, y: o.y + Math.sin(angle) * radius };
    const distance = Math.hypot(point.x - fish.x, point.y - fish.y);
    if (distance < 25 || !canTraverseSegment(fish, point, fish.radius, state.obstacles)) continue;
    const complete = canTraverseSegment(point, goal, fish.radius, state.obstacles);
    const cost = distance + Math.hypot(point.x - goal.x, point.y - goal.y) + (complete ? 0 : 300);
    if (cost < bestCost) { bestCost = cost; best = point; }
  }
  if (best !== goal) detours.set(fish, { goal: { x: goal.x, y: goal.y }, point: best, until: state.time + 45, radius: fish.radius });
  return best;
};

const feedback = new WeakMap<GameState, { refuge: string | null; frame: number }>();
export const updateReefFeedback = (state: GameState): void => {
  const p = state.player;
  const memory = feedback.get(state) ?? { refuge: null, frame: -1000 };
  let current: string | null = null;
  for (const passage of reefPassagesFor(state)) {
    const distance = Math.hypot(p.x - passage.center.x, p.y - passage.center.y);
    if (distance < 90 && passage.kind === 'REFUGE' && p.radius + REEF_MARGIN <= passage.clearance) {
      current = passage.id;
      if (current !== memory.refuge && state.time - memory.frame > 180 && !p.pendingEvolutionType) {
        p.speechBubble = { text: '珊瑚小窝 · 两边都能出去♪', timer: 100, color: '#bdebd9' };
        memory.frame = state.time;
      }
    } else if (distance < 320 && p.radius + REEF_MARGIN > passage.clearance
      && !canTraverseSegment(p, passage.center, p.radius, state.obstacles)
      && state.time - memory.frame > 240 && Math.hypot(p.vx, p.vy) > 0.1 && !p.pendingEvolutionType) {
      p.speechBubble = { text: '缝隙有点窄，沿礁石绕过去吧', timer: 100, color: '#efc8e8' };
      memory.frame = state.time;
    }
  }
  memory.refuge = current; feedback.set(state, memory);
};
