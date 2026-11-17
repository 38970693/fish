import { describe, expect, it, vi } from 'vitest';
import { getOceanScenery, getPondScenery } from '../data/pondScenery';
import { createInitialState } from '../factories/initialState';

describe('海底小景的分布与远航坐标', () => {
  it('短局移除纯装饰，实际岩石与水草继续存在，普通鱼塘仍有小景', () => {
    const arena = createInitialState({ mode: 'ARENA' });
    expect(getOceanScenery(arena)).toHaveLength(0);
    expect(arena.obstacles).toHaveLength(8);
    expect(getOceanScenery(createInitialState({ mode: 'LEGACY' })).length).toBeGreaterThan(0);
  });
  it('每个鱼塘都有丰富的植物、小物与气泡，重复读取保持同一分布', () => {
    for (const pond of ['CLEAR', 'CORAL', 'ABYSS']) {
      const scenery = getPondScenery(pond);
      const kinds = new Set(scenery.map(mark => mark.kind));
      expect(kinds.size).toBeGreaterThanOrEqual(7);
      for (const kind of ['GARDEN', 'ANEMONE', 'SPONGE', 'SAND', 'BUBBLES', 'BOTTLE'] as const) expect(kinds.has(kind)).toBe(true);
      expect(getPondScenery(pond)).toBe(scenery);
    }
  });

  it('无尽装饰不改变世界、不消耗玩法随机数，区块重访仍保持原样', () => {
    const state = createInitialState({ skipWorldGen: true, worldMode: 'ENDLESS', worldSeed: 42 });
    state.endlessWorld!.loadedChunks = ['0,0', '-1,0'];
    const before = structuredClone(state);
    const random = vi.spyOn(Math, 'random');
    try {
      const first = getOceanScenery(state);
      expect(first).toHaveLength(50);
      expect(getOceanScenery(state)).toBe(first);
      expect(state).toEqual(before);
      state.endlessWorld!.loadedChunks = ['5,5']; getOceanScenery(state);
      state.endlessWorld!.loadedChunks = ['0,0', '-1,0'];
      expect(getOceanScenery(state)).toEqual(first);
      expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });

  it('超大坐标的浮动原点只平移小景，不重新生成它们', () => {
    const state = createInitialState({ skipWorldGen: true, worldMode: 'ENDLESS', worldSeed: 87 });
    const origin = 9007199254741993n;
    Object.assign(state.endlessWorld!, { originChunkX: String(origin), originChunkY: '-2', loadedChunks: [`${origin + 1n},-2`] });
    const first = getOceanScenery(state);
    state.endlessWorld!.originChunkX = String(origin + 1n);
    const shifted = getOceanScenery(state);
    for (let i = 0; i < first.length; i++) {
      expect(shifted[i].id).toBe(first[i].id);
      expect(shifted[i].x).toBeCloseTo(first[i].x - 1800);
      expect({ ...shifted[i], x: first[i].x }).toEqual(first[i]);
      expect(Math.abs(shifted[i].x)).toBeLessThan(1800);
    }
  });
});
