import { describe, expect, it } from 'vitest';
import {
  __generatePondLayoutWithValidatorForTest,
  generatePondLayout,
  getSafePondLayout,
  resolvePondLayoutMode,
  validatePondLayoutReachability,
} from '../data/pondLayout';
import { POND_LIST, type PondId } from '../data/ponds';
import { createCurrentZones } from '../data/habitats';
import { getPondScenery } from '../data/pondScenery';
import { createBuildings, createObstacles, createPortals, pondTravel, SHOP_PORTAL_KEEPOUT } from '../systems/world';
import { isPositionValid } from '../systems/terrain';
import { BuildingType } from '../data/buildings';
import { createInitialState } from '../factories/initialState';

describe('程序化鱼塘布局', () => {
  it('只在 RIVALS 显式实验入口启用，LEGACY 强制保持 CLASSIC', () => {
    expect(resolvePondLayoutMode('LEGACY', 'PROCEDURAL')).toBe('CLASSIC');
    expect(resolvePondLayoutMode('RIVALS', 'PROCEDURAL')).toBe('PROCEDURAL');
    const legacy = createInitialState({ mode: 'LEGACY', pondLayout: 'PROCEDURAL', pondSeed: 7, skipWorldGen: true });
    expect(legacy.pondLayoutMode).toBe('CLASSIC');
    expect(legacy.pondLayout).toBeUndefined();
  });

  it('每塘 200 个固定种子逐字段可重放，关键点合法且路线可达', () => {
    for (const { id } of POND_LIST) {
      for (let seed = 1; seed <= 200; seed += 1) {
        const a = generatePondLayout(seed, id);
        const b = generatePondLayout(seed, id);
        expect(a).toEqual(b);

        const shopDistance = Math.hypot(a.shop.x - a.spawn.x, a.shop.y - a.spawn.y);
        expect(shopDistance).toBeGreaterThanOrEqual(1300);
        expect(shopDistance).toBeLessThanOrEqual(1900);
        expect(isPositionValid(a.spawn.x, a.spawn.y, 300, id)).toBe(true);
        expect(isPositionValid(a.shop.x, a.shop.y, 300, id)).toBe(true);
        for (const landmark of a.landmarks) {
          expect(isPositionValid(landmark.x, landmark.y, 250, id)).toBe(true);
        }
        for (const route of a.routes) {
          for (const point of route.points) expect(isPositionValid(point.x, point.y, 180, id)).toBe(true);
        }

        const obstacles = createObstacles(id, a);
        expect(validatePondLayoutReachability(a, obstacles, id).ok).toBe(true);

        const buildings = createBuildings(id, a);
        for (const building of buildings) {
          expect(isPositionValid(building.x, building.y, building.radius, id)).toBe(true);
        }
        const shop = buildings.find(building => building.type === BuildingType.SHOP)!;
        expect({ x: shop.x, y: shop.y }).toEqual(a.shop);

        const portals = createPortals(id, a);
        for (const portal of portals) {
          expect(isPositionValid(portal.x, portal.y, portal.radius + 30, id)).toBe(true);
          expect(Math.hypot(portal.x - a.shop.x, portal.y - a.shop.y)).toBeGreaterThanOrEqual(SHOP_PORTAL_KEEPOUT);
        }

        const currents = createCurrentZones(id, a);
        for (const current of currents) {
          expect(isPositionValid(current.x, current.y, current.width / 2 + 40, id)).toBe(true);
          const half = current.length / 2;
          expect(isPositionValid(
            current.x + Math.cos(current.angle) * half,
            current.y + Math.sin(current.angle) * half,
            current.width / 2,
            id,
          )).toBe(true);
          expect(isPositionValid(
            current.x - Math.cos(current.angle) * half,
            current.y - Math.sin(current.angle) * half,
            current.width / 2,
            id,
          )).toBe(true);
        }
      }
    }
  }, 30_000);

  it('不同种子会改变地标或路线，而独立子系统仍保持确定性', () => {
    for (const { id } of POND_LIST) {
      const layouts = [11, 12, 13, 14, 15].map(seed => generatePondLayout(seed, id));
      expect(new Set(layouts.map(layout => JSON.stringify({ landmarks: layout.landmarks, routes: layout.routes }))).size).toBeGreaterThan(1);

      const layout = layouts[0];
      expect(createObstacles(id, layout)).toEqual(createObstacles(id, layout));
      expect(createBuildings(id, layout)).toEqual(createBuildings(id, layout));
      expect(createPortals(id, layout)).toEqual(createPortals(id, layout));
      expect(createCurrentZones(id, layout)).toEqual(createCurrentZones(id, layout));
    }
  });

  it('程序化地标绑定真实互动建筑，深渊有经过沉船的三点星光路线', () => {
    const coral = generatePondLayout(20260925, 'CORAL');
    const pearl = coral.landmarks.find(landmark => landmark.kind === 'PEARL_BED')!;
    const pearlFarm = createBuildings('CORAL', coral).find(building => building.type === BuildingType.PEARL_FARM)!;
    expect({ x: pearlFarm.x, y: pearlFarm.y }).toEqual({ x: pearl.x, y: pearl.y });

    const abyss = generatePondLayout(20260925, 'ABYSS');
    const wreck = abyss.landmarks.find(landmark => landmark.kind === 'WRECK')!;
    const wreckBuilding = createBuildings('ABYSS', abyss).find(building => building.type === BuildingType.SHIPWRECK)!;
    expect({ x: wreckBuilding.x, y: wreckBuilding.y }).toEqual({ x: wreck.x, y: wreck.y });
    const route = abyss.routes.find(candidate => candidate.id === 'abyss-starlight')!;
    expect(route.points).toHaveLength(3);
    expect(route.points[1]).toEqual({ x: wreck.x, y: wreck.y });
  });

  it('32 次候选全部失败后走安全模板，并保留 seed 与失败原因', () => {
    let checked = 0;
    const fallback = __generatePondLayoutWithValidatorForTest(77, 'CORAL', () => {
      checked += 1;
      return false;
    });
    expect(checked).toBe(32);
    expect(fallback.seed).toBe(77);
    expect(fallback.fallbackReason).toContain('32 candidates failed');
    expect(fallback.routes.some(route => route.id === 'coral-bypass')).toBe(true);

    const safe = getSafePondLayout(77, 'CORAL', 'forced failure');
    expect(safe.seed).toBe(77);
    expect(safe.fallbackReason).toBe('forced failure');
    expect(safe.routes.some(route => route.id === 'coral-bypass')).toBe(true);

    expect(generatePondLayout(88, 'UNKNOWN')).toEqual(generatePondLayout(88, 'CLEAR'));
  });

  it('程序化跨塘重建沿用同一 seed，并同步出生点、相机和布局引用', () => {
    const state = createInitialState({
      mode: 'RIVALS',
      pondLayout: 'PROCEDURAL',
      pondSeed: 24680,
      pondId: 'CLEAR',
      skipWorldGen: true,
    });
    expect(pondTravel(state, 'ABYSS')).toBe(true);
    expect(state.pondId).toBe('ABYSS');
    expect(state.pondLayout?.seed).toBe(24680);
    expect(state.layoutSeed).toBe(24680);
    expect(state.layoutVersion).toBe(state.pondLayout?.version);
    expect({ x: state.player.x, y: state.player.y }).toEqual(state.pondLayout?.spawn);
    expect({ x: state.camera.x, y: state.camera.y }).toEqual(state.pondLayout?.spawn);
    expect(state.discoveredLandmarks).toEqual([]);
  });

  it('程序化装饰按 pond/version/seed 缓存且总量不超过常规视距上限', () => {
    for (const { id } of POND_LIST) {
      const layout = generatePondLayout(99, id);
      const scenery = getPondScenery(id, layout);
      expect(scenery.length).toBeLessThanOrEqual(40);
      expect(getPondScenery(id, layout)).toBe(scenery);
    }
  });

  it('程序化传送门避开当局商店并留在边界内', () => {
    for (const { id } of POND_LIST as Array<{ id: PondId }>) {
      const layout = generatePondLayout(12345, id);
      for (const portal of createPortals(id, layout)) {
        expect(isPositionValid(portal.x, portal.y, portal.radius + 30, id)).toBe(true);
        expect(Math.hypot(portal.x - layout.shop.x, portal.y - layout.shop.y)).toBeGreaterThanOrEqual(SHOP_PORTAL_KEEPOUT);
      }
    }
  });
});
