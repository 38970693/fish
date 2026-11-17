/** 玩家专用挂机：选目标，再用短期轨迹评分避开危险。只产出输入，不改游戏状态。 */
import { BOOST_CONFIG, MAP_SHAPE_CONFIG } from '../data/world';
import { BuildingType } from '../data/buildings';
import { CREATURES, CreatureType } from '../data/creatures';
import { BIOME_EFFECTS } from '../data/biomes';
import { SKILL_COOLDOWN } from '../data/skills';
import { angleDiff, turnToward } from '../core/math';
import type { Entity, GameState, Obstacle } from '../types';
import { GameStatus } from '../types';
import { canHarm } from './factions';
import { getPlayerAgility, getPlayerSpeed } from './playerControl';
import { getBiome, isPositionValid } from './terrain';
import { getSchoolSkill } from './skills';
import { sampleCurrent } from './habitats';
import { canTraverseSegment } from '../core/obstacleGeometry';
import { findRefugeWaypoint, reefNavigationPoint } from './reefNavigation';

interface Goal {
  id: string; x: number; y: number; radius: number; value: number;
  kind: 'PREY' | 'ITEM' | 'HEAL' | 'WANDER';
  fish?: Entity;
}

export interface AutopilotMemory {
  targetId: string | null;
  heading: number;
  boosting: boolean;
  bestDistance: number;
  targetHealth: number;
  stalledFrames: number;
  lastTime: number;
  skipped: Record<string, number>;
  detour: { obstacleId: string; side: number } | null;
}

export interface AutopilotInput {
  mouse: { x: number; y: number };
  space: boolean;
  rightMouseDown: boolean;
  q: boolean;
  targetId: string | null;
}

export const createAutopilotMemory = (): AutopilotMemory => ({
  targetId: null, heading: 0, boosting: false, bestDistance: Infinity, targetHealth: Infinity,
  stalledFrames: 0, lastTime: -1, skipped: {}, detour: null,
});

/** 进化界面会暂停主循环；挂机只从这一轮已经冻结的候选中挑生存能力最强的。 */
export const chooseAutopilotEvolution = (state: GameState): CreatureType | null => {
  const options = state.evolveOptions ?? [];
  let best: CreatureType | null = null;
  let bestScore = -Infinity;
  for (const type of options) {
    const config = CREATURES[type];
    if (!config) continue;
    const score = config.health * 0.35 + config.speed * 12 + config.damage * 2;
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const isActiveFish = (e: Entity): boolean =>
  e.health > 0 && !e.deathSettled && !e.semiGhostTimer && e.type !== CreatureType.MASCOT;

const isThreat = (state: GameState, e: Entity): boolean => {
  const p = state.player;
  return isActiveFish(e) && e.type !== p.type && canHarm(e, p) &&
    (e.radius >= p.radius * 0.85 || e.level > p.level ||
      e.config.damage > Math.max(1, p.config.damage) * 2);
};

const getThreats = (state: GameState): Entity[] => {
  const range = Math.max(750, getPlayerSpeed(state, true) * 48 + state.player.radius + 200);
  return state.entities.filter(e =>
    isThreat(state, e) && distance(e, state.player) < range
  );
};

const goalDanger = (goal: Goal, threats: Entity[]): number => {
  let danger = 0;
  for (const threat of threats) {
    const gap = distance(goal, threat) - threat.radius;
    if (gap < 190) danger += (190 - Math.max(0, gap)) / 190;
  }
  return danger;
};

const chooseGoal = (state: GameState, memory: AutopilotMemory, threats: Entity[]): Goal => {
  const p = state.player;
  const healthRatio = p.health / Math.max(1, p.maxHealth);
  const goals: Goal[] = [];
  for (const e of state.entities) {
    if (!isActiveFish(e) || !canHarm(p, e) || e.type === p.type) continue;
    // 挂机优先找能安全吞下的小鱼；越级硬拼交给手动操作。
    if (e.radius > p.radius * 0.9 || (!state.run && e.level > p.level)) continue;
    // 近似比较换血成本，防止把体型小但伤害高的鱼当成免费食物。
    const bites = Math.ceil(e.health / Math.max(1, p.config.damage * p.radius / e.radius));
    const tradeCost = Math.max(0, bites - 1) * e.config.damage * e.radius / p.radius;
    if (tradeCost > p.health * (healthRatio < 0.45 ? 0.12 : 0.3)) continue;
    goals.push({ id: `fish:${e.id}`, x: e.x, y: e.y, radius: e.radius, fish: e,
      value: (105 + Math.min(50, e.radius)) * (0.45 + 0.55 * healthRatio)
        / (1 + bites * 0.08), kind: 'PREY' });
  }
  for (const t of state.treasures) {
    if (t.status !== 'ACTIVE') continue;
    const heal = t.type === 'FOOD';
    const value = heal ? 65 + 350 * (1 - healthRatio)
      : t.type === 'FEAST' ? 175 : t.type === 'GEM' ? 145 : 90;
    goals.push({ id: `treasure:${t.id}`, x: t.x, y: t.y, radius: t.radius, value, kind: heal ? 'HEAL' : 'ITEM' });
  }
  for (const item of state.powerUps) {
    const value = item.type === 'SHIELD' ? 115 : item.type === 'SPEED' ? 95 : 65;
    if (item.radius <= 0) continue;
    goals.push({ id: `power:${item.id}`, x: item.x, y: item.y, radius: item.radius, value, kind: 'ITEM' });
  }
  for (const drop of state.feedingEvent?.drops ?? []) {
    goals.push({ id: `drop:${drop.id}`, x: drop.x, y: drop.y, radius: drop.radius, value: 145, kind: 'ITEM' });
  }
  if (healthRatio < 0.65) {
    for (const building of state.buildings) {
      if (building.type !== BuildingType.HOSPITAL || building.cooldown > 0) continue;
      goals.push({ id: `hospital:${building.id}`, x: building.x, y: building.y, radius: building.radius,
        value: 100 + 520 * (1 - healthRatio), kind: 'HEAL' });
    }
  }

  let best: Goal | null = null;
  let bestScore = -Infinity;
  for (const goal of goals) {
    if ((memory.skipped[goal.id] ?? 0) > state.time) continue;
    const d = distance(p, goal);
    if (d > 1500) continue;
    const fleeing = goal.fish && ((goal.x - p.x) * goal.fish.vx + (goal.y - p.y) * goal.fish.vy) / Math.max(1, d);
    const pursuitCost = fleeing && fleeing > getPlayerSpeed(state) * 0.8 ? 1.4 : 1;
    const score = goal.value / (d + 180) / pursuitCost * (goal.id === memory.targetId ? 1.25 : 1)
      - goalDanger(goal, threats.filter(e => e !== goal.fish)) * 0.65;
    if (score > bestScore) {
      bestScore = score;
      best = goal;
    }
  }
  if (best && bestScore > 0) return best;

  // 周围暂时没有安全收益时巡游。黄金角避免固定八方向反复绕同一个闭环。
  const heading = Math.floor(state.time / 480) * 2.3999632297;
  return { id: 'wander', x: p.x + Math.cos(heading) * 1000,
    y: p.y + Math.sin(heading) * 1000, radius: 0, value: 0, kind: 'WANDER' };
};

const nearObstacles = (state: GameState): Obstacle[] => {
  const range = Math.max(600, getPlayerSpeed(state, true) * 48 + state.player.radius + 150);
  return state.obstacles.filter(o => o.type !== 'SEAWEED' && o.featureState !== 'BROKEN' &&
    distance(o, state.player) < range + o.radius);
};

const penaltyAt = (
  state: GameState, x: number, y: number, step: number,
  threats: Entity[], obstacles: Obstacle[]
): number => {
  const p = state.player;
  let penalty = 0;
  for (const e of threats) {
    const dx = x - (e.x + e.vx * step);
    const dy = y - (e.y + e.vy * step);
    const gap = Math.hypot(dx, dy);
    const collision = p.radius + e.radius;
    const buffer = collision + 115 + Math.min(80, e.speed * step * 0.4);
    if (gap < buffer) {
      const closeness = 1 - gap / buffer;
      penalty += 270 * closeness * closeness * Math.max(1, e.radius / p.radius);
      if (gap < collision + 25) penalty += 170;
    }
  }
  for (const o of obstacles) {
    const gap = Math.hypot(x - o.x, y - o.y);
    const collision = p.radius + o.radius;
    if (gap < collision + 65) {
      const closeness = 1 - gap / (collision + 65);
      penalty += 120 * closeness * closeness;
      if (gap < collision + 12) penalty += 140;
    }
  }
  for (const hazard of state.hazards) {
    if (hazard.stage === 'COOLDOWN') continue;
    if (Math.hypot(x - hazard.x, y - hazard.y) < hazard.radius + p.radius + 70) penalty += 220;
  }
  for (const portal of state.portals) {
    if (Math.hypot(x - portal.x, y - portal.y) < portal.radius + p.radius + 50) penalty += 160;
  }
  for (const building of state.buildings) {
    if (building.type !== BuildingType.SHOP) continue;
    if (Math.hypot(x - building.x, y - building.y) < building.radius * 1.5 + p.radius + 40) penalty += 160;
  }
  const biome = getBiome(x, y, state.worldMode, state.endlessWorld?.seed,
    state.endlessWorld?.originChunkX, state.endlessWorld?.originChunkY);
  if (BIOME_EFFECTS[biome].corrosionPerFrame > 0 && p.config.special !== 'SHELL') {
    penalty += 35 + 45 * (1 - p.health / Math.max(1, p.maxHealth));
  }
  if (state.status === GameStatus.BATTLE_TEST) {
    if (Math.hypot(x - MAP_SHAPE_CONFIG.CENTER_X, y - MAP_SHAPE_CONFIG.CENTER_Y) > 800 - p.radius - 90) penalty += 200;
  } else if (!isPositionValid(x, y, p.radius + 100, state.pondId, state.worldMode)) {
    penalty += 200;
  }
  return penalty;
};

/** 从相对速度求拦截时间；快鱼无法直线追上时只做有限预判。 */
const interceptPoint = (state: GameState, goal: Goal, boosted: boolean): { x: number; y: number } => {
  if (!goal.fish) return goal;
  const dx = goal.x - state.player.x;
  const dy = goal.y - state.player.y;
  const { vx, vy } = goal.fish;
  const speed = getPlayerSpeed(state, boosted);
  const a = vx * vx + vy * vy - speed * speed;
  const b = 2 * (dx * vx + dy * vy);
  const c = dx * dx + dy * dy;
  const discriminant = b * b - 4 * a * c;
  const roots = Math.abs(a) < 0.001 ? [-c / b]
    : discriminant >= 0 ? [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)] : [];
  const time = Math.min(90, ...roots.filter(t => t > 0 && Number.isFinite(t)));
  return { x: goal.x + vx * time, y: goal.y + vy * time };
};

/** 直线被岩石截断时固定绕行侧，避免在障碍两侧来回换方向。 */
const navigationPoint = (
  state: GameState, goal: Goal, memory: AutopilotMemory, threats: Entity[], obstacles: Obstacle[], boosted: boolean,
): { x: number; y: number } => {
  const p = state.player;
  const aim = interceptPoint(state, goal, boosted);
  const nearbyThreat = threats.filter(e => distance(e, p) < 450).sort((a, b) => distance(a, p) - distance(b, p))[0];
  const refuge = nearbyThreat ? findRefugeWaypoint(p, nearbyThreat, state) : null;
  if (refuge) return refuge;
  if (canTraverseSegment(p, aim, p.radius, obstacles)) { memory.detour = null; return aim; }
  if (obstacles.some(o => o.reef)) return reefNavigationPoint(p, aim, state);
  const dx = aim.x - p.x;
  const dy = aim.y - p.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const blocker = obstacles.filter(o => {
    const along = (o.x - p.x) * ux + (o.y - p.y) * uy;
    const across = Math.abs((o.x - p.x) * uy - (o.y - p.y) * ux);
    return along > 0 && along < length && across < o.radius + p.radius + 25;
  }).sort((a, b) => distance(a, p) - distance(b, p))[0];
  if (!blocker) { memory.detour = null; return aim; }
  const waypoint = (side: number) => ({
    x: blocker.x - uy * side * (blocker.radius + p.radius + 100),
    y: blocker.y + ux * side * (blocker.radius + p.radius + 100),
  });
  if (memory.detour?.obstacleId !== blocker.id) {
    const left = waypoint(1);
    const right = waypoint(-1);
    const cost = (point: { x: number; y: number }) => distance(p, point) + distance(point, aim)
      + penaltyAt(state, point.x, point.y, 40, threats, obstacles) * 3;
    memory.detour = { obstacleId: blocker.id, side: cost(left) <= cost(right) ? 1 : -1 };
  }
  return waypoint(memory.detour.side);
};

interface Plan { heading: number; boosted: boolean; score: number }

/** 同时预测常速/加速的轨迹；最接近目标的时刻也计分，近距离不再只盯终点。 */
const planMovement = (state: GameState, goal: Goal, memory: AutopilotMemory, threats: Entity[]): Plan => {
  const p = state.player;
  const obstacles = nearObstacles(state);
  const closestThreat = threats.reduce((best, e) => Math.min(best, distance(e, p) - e.radius - p.radius), Infinity);
  const escape = closestThreat < 185;
  const chase = goal.kind === 'PREY' && distance(p, goal) < 700 && closestThreat > 400 && p.health > p.maxHealth * 0.55;
  const energyFloor = escape ? 0 : p.boost.max * (memory.boosting ? 0.3 : 0.75);
  const allowBoost = (escape || chase) && p.boost.current > energyFloor;
  const routeThreats = threats.filter(e => e !== goal.fish);
  const aim = navigationPoint(state, goal, memory, routeThreats, obstacles, allowBoost);
  const goalAngle = Math.atan2(aim.y - p.y, aim.x - p.x);
  const headings = [goalAngle, p.angle, memory.heading, goalAngle - Math.PI / 12, goalAngle + Math.PI / 12];
  for (let i = 0; i < 16; i += 1) headings.push(i * Math.PI / 8);
  const agility = getPlayerAgility(state);
  const before = distance(p, aim);
  let best: Plan = { heading: goalAngle, boosted: false, score: -Infinity };
  for (const boosted of allowBoost ? [false, true] : [false]) {
    for (const heading of headings) {
      let angle = p.angle;
      let x = p.x;
      let y = p.y;
      let risk = 0;
      let nearest = distance(p, goal);
      let contactStep = 0;
      for (let step = 1; step <= 48; step += 1) {
        angle = turnToward(angle, heading, agility);
        const speed = getPlayerSpeed(state, boosted && p.boost.current > (step - 1) * BOOST_CONFIG.DRAIN_RATE,
          step - 1, { x, y });
        x += Math.cos(angle) * speed;
        y += Math.sin(angle) * speed;
        for (const zone of state.currents ?? []) {
          const current = sampleCurrent(zone, { x, y });
          if (current.factor <= 0) continue;
          x += current.pushX; y += current.pushY; break;
        }
        const gap = Math.hypot(goal.x + (goal.fish?.vx ?? 0) * step - x, goal.y + (goal.fish?.vy ?? 0) * step - y);
        nearest = Math.min(nearest, gap);
        if (!contactStep && goal.kind !== 'WANDER' && gap < p.radius + goal.radius) contactStep = step;
        if (step % 6 === 0) {
          risk += penaltyAt(state, x, y, step, routeThreats, obstacles);
        }
      }
      const progress = before - Math.hypot(aim.x - x, aim.y - y);
      const approach = distance(p, goal) - nearest;
      const contactReward = contactStep ? 65 + (48 - contactStep) * 0.8 : 0;
      const score = progress * 0.12 + approach * 0.18 + contactReward - risk
        - Math.abs(angleDiff(p.angle, heading)) * 1.5
        - Math.abs(angleDiff(memory.heading, heading)) * 0.8
        - (boosted ? (escape ? 0.2 : memory.boosting ? 2 : 5) : 0);
      if (score > best.score) {
        best = { heading, boosted, score };
      }
    }
  }
  return best;
};

/** 技能只在有效距离内触发；位移类额外检查落点和地形。 */
const chooseSkills = (state: GameState, goal: Goal, plan: Plan, threats: Entity[]) => {
  const p = state.player;
  const power = 1 + p.skillLevel * SKILL_COOLDOWN.POWER_PER_LEVEL;
  const angle = turnToward(p.angle, plan.heading, getPlayerAgility(state));
  const speed = getPlayerSpeed(state, plan.boosted);
  const origin = { x: p.x + Math.cos(angle) * speed, y: p.y + Math.sin(angle) * speed };
  const enemies = state.entities.filter(e => isActiveFish(e) && canHarm(p, e));
  const skillThreats = enemies.filter(e => e !== goal.fish && isThreat(state, e));
  const nearest = enemies.reduce<Entity | null>((best, e) => !best || distance(origin, e) < distance(origin, best) ? e : best, null);
  const danger = threats.some(e => distance(origin, e) < p.radius + e.radius + 150);
  const inRange = (range: number) => danger
    ? threats.some(e => distance(origin, e) < range * power)
    : !!goal.fish && distance(origin, goal.fish) < range * power;
  const chasing = !!goal.fish && distance(origin, goal.fish) > p.radius + goal.radius + 40;
  const forwardHit = (offset: number, radius: number, range: number) => !!goal.fish &&
    distance(origin, goal.fish) <= range * power &&
    distance({ x: origin.x + Math.cos(angle) * offset, y: origin.y + Math.sin(angle) * offset }, goal.fish) <= radius * power;
  const safeRelocation = (end: { x: number; y: number }) => {
    const obstacles = nearObstacles(state);
    // 即便是瞬移也不跨过紧邻岩石；避免技能后下一帧被地形夹住。
    const steps = Math.ceil(distance(origin, end) / 25);
    for (let i = 1; i <= steps; i += 1) {
      const point = { x: origin.x + (end.x - origin.x) * i / steps, y: origin.y + (end.y - origin.y) * i / steps };
      if (!isPositionValid(point.x, point.y, p.radius + 15, state.pondId, state.worldMode)) return false;
      if (state.status === GameStatus.BATTLE_TEST && distance(point, { x: MAP_SHAPE_CONFIG.CENTER_X, y: MAP_SHAPE_CONFIG.CENTER_Y }) > 800 - p.radius - 15) return false;
      if (obstacles.some(o => distance(point, o) < o.radius + p.radius + 15)) return false;
      if (state.hazards.some(h => h.stage !== 'COOLDOWN' && distance(point, h) < h.radius + p.radius + 30)) return false;
      if (state.portals.some(portal => distance(point, portal) < portal.radius + p.radius + 20)) return false;
    }
    return penaltyAt(state, end.x, end.y, 1, skillThreats, obstacles)
      <= Math.max(35, penaltyAt(state, origin.x, origin.y, 1, threats, obstacles) * 0.5);
  };
  const jump = (length: number) => {
    const end = { x: origin.x + Math.cos(angle) * length * power, y: origin.y + Math.sin(angle) * length * power };
    return safeRelocation(end) && (danger || (!!goal.fish && distance(end, goal.fish) < distance(origin, goal.fish) - 60));
  };
  const shouldCast = (id?: string): boolean => {
    switch (id) {
      case 'DODGE': case 'HARD_SCALE': return danger && p.invulnerableTimer <= 1 && p.shieldTimer <= 1;
      case 'SHELL': case 'INFLATE': return danger && p.shieldTimer <= 1 && p.invulnerableTimer <= 1;
      case 'ROLL': return (danger && p.invulnerableTimer <= 1) || p.health < p.maxHealth * 0.8;
      case 'CAMO': case 'ABYSS_MIST': return !p.camoActive && (danger || chasing);
      case 'LURE': return !danger && chasing && !p.lureActive;
      case 'DASH': case 'TORRENT_GLIDE': return (danger || chasing) && (p.speedBoostTimer ?? 0) <= 1;
      case 'DEATH_FRENZY': return danger && p.health <= p.maxHealth * 0.6 && (p.speedBoostTimer ?? 0) <= 1;
      case 'INK': return danger && jump(-100);
      case 'BLINK_OUT': return danger && jump(-500);
      case 'HYDRO_BOUNCE': return jump(400);
      case 'PIERCE': return jump(300);
      case 'SHADOW_RUSH': {
        if (danger || !goal.fish || nearest !== goal.fish || !inRange(700)) return false;
        const behind = goal.fish.angle + Math.PI;
        return safeRelocation({ x: goal.x + Math.cos(behind) * (p.radius + goal.radius + 5),
          y: goal.y + Math.sin(behind) * (p.radius + goal.radius + 5) });
      }
      case 'DEADLY_TEAR': return !danger && nearest === goal.fish && inRange(p.radius * 3);
      case 'WEAKNESS_MARK': return !danger && nearest === goal.fish && inRange(600) && !(goal.fish?.vulnerableTimer);
      case 'SLAM': return forwardHit(p.radius * 2, p.radius * 2, p.radius * 4);
      case 'VENOM': return forwardHit(p.radius * 2, p.radius * 1.5, p.radius * 3) && !(goal.fish?.poisonTimer);
      case 'UNICORN': return forwardHit(p.radius * 3, p.radius * 1.5, p.radius * 4);
      case 'SHOCK': return inRange(150);
      case 'THUNDER': case 'AWE': case 'BUBBLE_LOCK': return inRange(300);
      case 'PRESSURE_BIND': return inRange(350);
      case 'DEEP_FROST': case 'SIREN': case 'TAIL_WAVE': return inRange(400);
      case 'SONIC': return inRange(500);
      case 'SONAR': return inRange(600);
      case 'SONAR_SCAN': return inRange(700);
      case 'WHIRL_SLASH': return inRange(250);
      case 'ENERGY_DRAIN': return p.health < p.maxHealth * 0.9 && inRange(350);
      case 'FATAL_PIERCE': return inRange(p.radius * 4);
      // 拉怪技能需要确保范围内没有大鱼，防止把捕食者拉到自己脸上。
      case 'VORTEX_TRAP': return !skillThreats.some(e => distance(origin, e) < 500 * power) && inRange(500);
      case 'TENTACLE': return !skillThreats.some(e => distance(origin, e) < 800 * power) && inRange(800);
      case 'DEVOUR': return !danger && !!goal.fish && goal.fish.level < p.level && inRange(p.radius * 4);
      default: return false;
    }
  };
  const rightMouseDown = p.level >= SKILL_COOLDOWN.UNLOCK_LEVEL && p.skillCooldown <= 1 && shouldCast(p.config.skillId);
  // 一个决策帧只主动释放一个技能，后续帧按实际生效后的状态重新判断。
  return { rightMouseDown, q: !rightMouseDown && p.schoolSkillCooldown <= 1 && shouldCast(getSchoolSkill(p)) };
};

export const chooseAutopilotInput = (
  state: GameState, memory: AutopilotMemory, screenWidth: number, screenHeight: number
): AutopilotInput => {
  const threats = getThreats(state);
  for (const [id, until] of Object.entries(memory.skipped)) {
    if (until <= state.time) delete memory.skipped[id];
  }
  let goal = chooseGoal(state, memory, threats);
  if (goal.id !== memory.targetId) {
    memory.bestDistance = distance(state.player, goal);
    memory.stalledFrames = 0;
    memory.detour = null;
  } else if (distance(state.player, goal) < memory.bestDistance - 10 ||
    (goal.fish && goal.fish.health < memory.targetHealth)) {
    memory.bestDistance = distance(state.player, goal);
    memory.stalledFrames = 0;
  } else {
    memory.stalledFrames += Math.max(0, Math.min(6, state.time - memory.lastTime));
  }
  if (goal.kind !== 'WANDER' && memory.stalledFrames >= 240) {
    memory.skipped[goal.id] = state.time + 600;
    goal = chooseGoal(state, memory, threats);
    memory.bestDistance = distance(state.player, goal);
    memory.stalledFrames = 0;
    memory.detour = null;
  }
  memory.targetHealth = goal.fish?.health ?? Infinity;
  memory.lastTime = state.time;
  const danger = threats.filter(e => e !== goal.fish);
  const plan = planMovement(state, goal, memory, danger);
  memory.targetId = goal.kind === 'WANDER' ? null : goal.id;
  memory.heading = plan.heading;
  memory.boosting = plan.boosted;
  return {
    mouse: { x: screenWidth / 2 + Math.cos(plan.heading) * 200,
      y: screenHeight / 2 + Math.sin(plan.heading) * 200 },
    space: plan.boosted,
    ...chooseSkills(state, goal, plan, danger),
    targetId: memory.targetId,
  };
};
