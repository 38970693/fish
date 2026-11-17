import { ARENA_RULES, getArenaCircle, getArenaStandings, getArenaFoodCap } from '../data/arena';
import { BiomeType } from '../data/biomes';
import { seedArenaFood } from '../factories/arena';
import { GameStatus, type FrameContext, type GameState, type PlayerState } from '../types';
import { playerControlSystem } from './playerControl';
import { skillsSystem } from './skills';
import { concealmentSystem, canPerceive } from './concealment';
import { captureTerrainFrame, resolveObstacles, takeTerrainPosition } from './terrain';
import { applyPlayerRadiusGrowth } from './playerGrowth';
import { combatSystem, dealDamage, resolveDeath } from './combat';
import { progressionSystem } from './progression';
import { boostTrailSystem } from './boostTrail';
import { markRunPractice } from './runFlow';

const botView = (state: GameState, body: PlayerState): GameState => ({ ...state, player: body,
  entities: [state.player, ...state.entities].filter(e => e !== body && e.health > 0) });

/** Decisions differ, but movement, boost, cooldowns, status timers and skill execution do not. */
export const arenaAiSystem = (state: GameState, ctx: FrameContext): void => {
  const arena = state.arena;
  if (!arena) return;
  const circle = getArenaCircle(state);
  const selectedFood = new Set<string>();
  for (const { body } of arena.contestants) {
    if (body === state.player || body.health <= 0) continue;
    const view = botView(state, body);
    const fromCenter = Math.hypot(body.x - arena.center.x, body.y - arena.center.y);
    let target: { x: number; y: number } = arena.center;
    let best = Infinity;
    let danger: PlayerState | undefined;
    for (const other of view.entities) {
      const distance = Math.hypot(other.x - body.x, other.y - body.y);
      if (!canPerceive(body, other, distance * distance)) continue;
      if (other.arenaStats && other.level > body.level && distance < 160) danger = other as PlayerState;
      const outside = Math.hypot(other.x - arena.center.x, other.y - arena.center.y) > circle.radius - 15;
      if (outside) continue;
      const priority = other.arenaStats ? (other.level <= body.level && body.health > body.maxHealth * 0.55 ? 1.6 : 6) : 1;
      const score = distance * priority * (selectedFood.has(other.id) ? 5 : 1);
      if (score < best) { best = score; target = other; }
    }
    const retreating = fromCenter > circle.radius - 45;
    if (retreating) target = arena.center;
    else if (danger) target = { x: body.x + (body.x - danger.x), y: body.y + (body.y - danger.y) };
    else if ('id' in target) selectedFood.add(String(target.id));
    const angle = Math.atan2(target.y - body.y, target.x - body.x);
    const fighting = view.entities.some(e => !!e.arenaStats && Math.hypot(e.x - body.x, e.y - body.y) < 140
      && canPerceive(body, e, (e.x - body.x) ** 2 + (e.y - body.y) ** 2));
    const input: FrameContext = { ...ctx, screen: { width: 1000, height: 1000 },
      mouse: { x: 500 + Math.cos(angle) * 200, y: 500 + Math.sin(angle) * 200 },
      input: { space: (retreating || fighting || !!danger) && body.boost.current > 20,
        rightMouseDown: retreating || fighting, q: fighting, interact: false, mouseDown: false } };
    playerControlSystem(view, input);
    skillsSystem(view, input);
  }
};

/** Circle damage settles every body before deciding the match, including simultaneous elimination. */
export const arenaFinishSystem = (state: GameState, ctx: FrameContext): void => {
  const arena = state.arena;
  if (!arena || arena.result || state.status !== GameStatus.PLAYING) return;
  const circle = getArenaCircle(state);
  for (const contestant of arena.contestants) {
    const body = contestant.body;
    if (body.health > 0 && Math.hypot(body.x - arena.center.x, body.y - arena.center.y) > circle.radius) {
      dealDamage(body, body.maxHealth * (0.04 + circle.stage * 0.03) / 60);
    }
    if (body.health <= 0 && contestant.eliminatedAt === null) {
      contestant.eliminatedAt = state.run!.clock;
      if (!body.deathSettled) {
        const killer = arena.contestants.find(c => c.body.id === body.lastHitById)?.body;
        resolveDeath(state, ctx, body, killer);
      }
    }
  }
  state.entities = state.entities.filter(e => e.health > 0);
  state.score = state.player.arenaStats?.score ?? 0;
  const alive = arena.contestants.filter(c => c.eliminatedAt === null);
  const playerDead = arena.contestants[0].eliminatedAt !== null;
  if (!playerDead && alive.length > 1 && state.run!.clock < ARENA_RULES.duration) return;
  const rank = getArenaStandings(state).find(c => c.body === state.player)!.rank;
  arena.result = { reason: playerDead ? 'ELIMINATED' : alive.length <= 1 ? 'LAST_SURVIVOR' : 'TIME_LIMIT', rank };
  state.status = !playerDead && rank === 1 ? GameStatus.VICTORY : GameStatus.GAME_OVER;
};

/** An explicit mode pipeline reuses the existing systems without adventure reward/spawn directors. */
export const runArenaSystems = (state: GameState, ctx: FrameContext): void => {
  if (!state.arena || state.status !== GameStatus.PLAYING) return;
  state.run!.clock++;
  if (state.player.isGodMode) markRunPractice(state, '无敌模式');
  if (state.autopilotEnabled) markRunPractice(state, '自动驾驶');
  if (state.run!.clock % 60 === 0) {
    maintainArenaFood(state);
  }
  captureTerrainFrame(state);
  if (state.player.health > 0) {
    playerControlSystem(state, ctx);
    skillsSystem(state, ctx);
  }
  concealmentSystem(state);
  arenaAiSystem(state, ctx);
  for (const body of [state.player, ...state.entities]) {
    body.currentBiome = BiomeType.SHALLOWS;
    resolveObstacles(body, state.obstacles.filter(o => o.type !== 'SEAWEED'), undefined, takeTerrainPosition(body, state.time));
    const dx = body.x - state.arena.center.x, dy = body.y - state.arena.center.y;
    const distance = Math.hypot(dx, dy), limit = ARENA_RULES.radius - body.radius;
    if (distance > limit) {
      body.x = state.arena.center.x + dx / distance * limit;
      body.y = state.arena.center.y + dy / distance * limit;
    }
    if (body.arenaStats && ((body as PlayerState).pendingRadiusGrowth ?? 0) > 0)
      applyPlayerRadiusGrowth({ ...state, player: body as PlayerState });
  }
  combatSystem(state, ctx);
  arenaFinishSystem(state, ctx);
  boostTrailSystem(state, ctx);
  progressionSystem(state, ctx);
};

export const maintainArenaFood = (state: GameState): void => {
  const arena = state.arena;
  if (!arena) return;
  const circle = getArenaCircle(state);
  const bodies = arena.contestants.filter(c => c.body.health > 0).map(c => c.body);
  const foods = state.entities.filter(e => !e.arenaStats && e.health > 0
    && Math.hypot(e.x - arena.center.x, e.y - arena.center.y) < circle.radius - 20);
  const nearest = (e: { x: number; y: number }) => Math.min(...bodies.map(b => Math.hypot(e.x - b.x, e.y - b.y)));
  const keep = new Set(foods.sort((a, b) => nearest(a) - nearest(b)).slice(0, getArenaFoodCap(state)).map(e => e.id));
  state.entities = state.entities.filter(e => !!e.arenaStats || keep.has(e.id));
  seedArenaFood(state, 2);
};
