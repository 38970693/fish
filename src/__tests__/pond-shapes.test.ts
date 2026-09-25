import { describe, expect, it } from 'vitest';
import { POND_LIST } from '../data/ponds';
import { getPondScenery } from '../data/pondScenery';
import { createBuildings, createObstacles, createPortals } from '../systems/world';
import { clampToMap, getMapBoundaryRadius, isPositionValid } from '../systems/terrain';

describe('鱼塘造型与世界内容', () => {
  it('三塘有可辨认的轮廓，岸线与碰撞读取同一半径', () => {
    const angle = Math.PI / 7;
    const radii = POND_LIST.map(({ id }) => getMapBoundaryRadius(angle, id));
    expect(new Set(radii.map(Math.round)).size).toBe(3);

    for (const { id } of POND_LIST) {
      for (let sample = 0; sample < 32; sample += 1) {
        const a = sample * Math.PI / 16;
        const radius = getMapBoundaryRadius(a, id);
        const x = 3000 + Math.cos(a) * radius;
        const y = 3000 + Math.sin(a) * radius;
        expect(isPositionValid(x * 0.99 + 30, y * 0.99 + 30, 0, id)).toBe(true);
        expect(isPositionValid(3000 + Math.cos(a) * (radius + 2), 3000 + Math.sin(a) * (radius + 2), 0, id)).toBe(false);
      }
    }
  });

  it('装饰稳定且全部留在可游水域内', () => {
    for (const { id } of POND_LIST) {
      const scenery = getPondScenery(id);
      expect(scenery).toHaveLength(180);
      expect(getPondScenery(id)).toBe(scenery);
      for (const mark of scenery) {
        expect(isPositionValid(mark.x, mark.y, mark.radius + 200, id)).toBe(true);
      }
    }
  });

  it('不同塘中的初始建筑、传送门和障碍物都能放进真实轮廓', () => {
    for (const { id } of POND_LIST) {
      for (const object of [
        ...createBuildings(id), ...createPortals(id), ...createObstacles(id),
      ]) {
        expect(isPositionValid(object.x, object.y, object.radius, id), `${id}: ${JSON.stringify(object)}`).toBe(true);
      }
    }
  });

  it('跨塘后按目标塘边界约束玩家', () => {
    const angle = Math.PI / 7;
    const radius = getMapBoundaryRadius(angle, 'ABYSS');
    const player = {
      x: 3000 + Math.cos(angle) * (radius + 100),
      y: 3000 + Math.sin(angle) * (radius + 100),
      radius: 20,
      angle,
      vx: 1,
      vy: 1,
    };
    clampToMap(player, false, 'ABYSS');
    expect(Math.hypot(player.x - 3000, player.y - 3000)).toBeCloseTo(radius - player.radius, 5);
  });
});
