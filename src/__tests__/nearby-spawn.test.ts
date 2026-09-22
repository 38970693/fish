import { describe, expect, it } from 'vitest';
import { CreatureType } from '../data/creatures';
import { RIVALS_SPAWN_CONFIG } from '../data/world';
import { createInitialState } from '../factories/initialState';
import { spawnSystem } from '../systems/spawn';
import { isPositionValid } from '../systems/terrain';
import { withSeededRandom } from '../test/scenario';
import type { FrameContext } from '../types';

const emptyCtx = {} as FrameContext;

const distanceFromPlayer = (state: ReturnType<typeof createInitialState>, x: number, y: number): number =>
  Math.hypot(x - state.player.x, y - state.player.y);

describe('RIVALS 附近有效密度', () => {
  it('附近预算未满时，生成在玩家可参与的环带内', () => {
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });

    withSeededRandom(19, () => {
      for (let i = 0; i < 24; i += 1) spawnSystem(state, emptyCtx);
    });

    expect(state.entities).toHaveLength(24);
    for (const entity of state.entities) {
      const distance = distanceFromPlayer(state, entity.x, entity.y);
      expect(distance).toBeGreaterThanOrEqual(RIVALS_SPAWN_CONFIG.NEAR_MIN_DISTANCE);
      expect(distance).toBeLessThanOrEqual(RIVALS_SPAWN_CONFIG.NEAR_MAX_DISTANCE);
      expect(isPositionValid(entity.x, entity.y, RIVALS_SPAWN_CONFIG.SPAWN_BUFFER)).toBe(true);
    }
  });

  it('开局附近同时保证食物和可收编的一级鱼，不预送队伍', () => {
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });

    withSeededRandom(7, () => {
      for (let i = 0; i < 20; i += 1) spawnSystem(state, emptyCtx);
    });

    const food = state.entities.filter((entity) => entity.type === CreatureType.PLANKTON);
    const recruitable = state.entities.filter((entity) => entity.config.tier === 1);
    expect(food.length).toBeGreaterThanOrEqual(RIVALS_SPAWN_CONFIG.STARTER_FOOD_MIN);
    expect(recruitable.length).toBeGreaterThanOrEqual(RIVALS_SPAWN_CONFIG.STARTER_RECRUIT_MIN);
    expect(state.entities.every((entity) => entity.ownerId === undefined)).toBe(true);
    expect(state.squad.pending).toHaveLength(0);
  });

  it('高于玩家当前阶级的鱼从更远处进入，不贴脸生成', () => {
    const state = createInitialState({ mode: 'RIVALS', pondId: 'ABYSS', skipWorldGen: true });
    state.run!.clock = RIVALS_SPAWN_CONFIG.STARTER_WINDOW_FRAMES + 1;
    state.player.level = 1;

    withSeededRandom(31, () => {
      for (let i = 0; i < RIVALS_SPAWN_CONFIG.NEARBY_TARGET; i += 1) {
        spawnSystem(state, emptyCtx);
      }
    });

    const threats = state.entities.filter((entity) => entity.config.tier > state.player.config.tier);
    expect(threats.length).toBeGreaterThan(0);
    for (const threat of threats) {
      expect(distanceFromPlayer(state, threat.x, threat.y)).toBeGreaterThanOrEqual(
        RIVALS_SPAWN_CONFIG.THREAT_MIN_DISTANCE
      );
    }
  });

  it('LEGACY 继续使用旧的全图随机生成规则', () => {
    const state = createInitialState({ mode: 'LEGACY', skipWorldGen: true });
    state.player.x = 3000;
    state.player.y = 3000;

    withSeededRandom(3, () => {
      for (let i = 0; i < 30; i += 1) spawnSystem(state, emptyCtx);
    });

    expect(
      state.entities.some(
        (entity) => distanceFromPlayer(state, entity.x, entity.y) > RIVALS_SPAWN_CONFIG.NEAR_MAX_DISTANCE
      )
    ).toBe(true);
  });
});
