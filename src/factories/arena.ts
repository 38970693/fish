import { ARENA_RULES, arenaRandom, getArenaCircle, getArenaFoodCap } from '../data/arena';
import { CreatureType } from '../data/creatures';
import { BiomeType } from '../data/biomes';
import type { GameState, PlayerState } from '../types';
import { createEntity } from '../systems/spawn';
import { canTraverseSegment } from '../core/obstacleGeometry';

export const seedArenaFood = (state: GameState, count: number, position?: { x: number; y: number }): void => {
  const arena = state.arena!;
  const budget = getArenaFoodCap(state) - state.entities.filter(e => !e.arenaStats && e.health > 0).length;
  for (let i = 0; i < Math.min(count, budget); i++) {
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = arenaRandom(arena) * Math.PI * 2;
      const distance = position ? 100 + arenaRandom(arena) * 160 : Math.sqrt(arenaRandom(arena)) * getArenaCircle(state).radius * 0.85;
      const center = position ?? arena.center;
      const point = { x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance };
      if (Math.hypot(point.x - arena.center.x, point.y - arena.center.y) > getArenaCircle(state).radius - 20) continue;
      if ([state.player, ...state.entities].some(e => e.health > 0 && Math.hypot(e.x - point.x, e.y - point.y)
        < (e.arenaStats ? e.radius + 60 : ARENA_RULES.foodSpacing))) continue;
      if (!canTraverseSegment(point, point, 6, state.obstacles)) continue;
      const food = createEntity(CreatureType.PLANKTON, point.x, point.y, { moodId: 'CALM' });
      food.id = `arena-food-${arena.nextId++}`;
      food.speed = 0; food.semiGhostTimer = 0;
      state.entities.push(food);
      break;
    }
  }
};

/** Reuse player bodies and controller for every contestant, with identical starting resources. */
export const initializeArena = (state: GameState, seed = 42, skipWorldGen = false): void => {
  const center = { x: state.worldWidth / 2, y: state.worldHeight / 2 };
  state.arena = { center, contestants: [], randomState: seed >>> 0, nextId: 0 };
  state.buildings = []; state.portals = []; state.obstacles = []; state.currents = [];
  state.player.arenaStats = { score: 0, damage: 0, kills: 0 };
  state.player.invulnerableTimer = ARENA_RULES.protection;
  state.player.currentBiome = BiomeType.SHALLOWS;
  state.player.x = center.x - ARENA_RULES.spawnRadius; state.player.y = center.y;
  state.player.angle = 0;
  state.arena.contestants.push({ body: state.player, name: '你', color: '#67e8f9', eliminatedAt: null });
  const colors = ['#fb7185', '#c4b5fd', '#fbbf24', '#a3e635', '#f0abfc'];
  for (let i = 1; i < 6; i++) {
    const angle = Math.PI + i * Math.PI / 3;
    const body: PlayerState = {
      ...state.player, id: `arena-bot-${i}`, ownerId: `arena-team-${i}`,
      x: center.x + Math.cos(angle) * ARENA_RULES.spawnRadius,
      y: center.y + Math.sin(angle) * ARENA_RULES.spawnRadius, angle: angle + Math.PI,
      boost: { ...state.player.boost }, stats: { ...state.player.stats }, eatenHistory: {},
      cosmetics: { ...state.player.cosmetics, skinColor: colors[i - 1] },
      arenaStats: { score: 0, damage: 0, kills: 0 },
    };
    state.entities.push(body);
    state.arena.contestants.push({ body, name: `对手 ${i}`, color: colors[i - 1], eliminatedAt: null });
  }
  // Four compact islands with grass on the outer lanes; every spawn and the center remain open.
  if (!skipWorldGen) for (let i = 0; i < 4; i++) {
    const angle = (i + 0.5) * Math.PI / 2;
    for (const [type, distance, radius] of [['ROCK', 300, 65], ['SEAWEED', 670, 95]] as const) {
      state.obstacles.push({ id: `arena-${type}-${i}`, type, radius,
        x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance,
        ecologyInitialized: true });
    }
  }
  for (const contestant of state.arena.contestants) seedArenaFood(state, 6, contestant.body);
  state.camera.x = state.player.x; state.camera.y = state.player.y;
}
