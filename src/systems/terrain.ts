/**
 * 地形系统 —— 花瓣形地图的边界计算与位置约束。
 *
 * 被移动、AI、生成三个系统共用。
 * ⚠️ 边界处理经历过一次「抽搐」修复（缓冲区分软硬两级），改动前先看懂下面的分级逻辑。
 */

import { MAP_SHAPE_CONFIG } from '../data/world';
import { BIOME_DATA, BiomeType } from '../data/biomes';
import type { Obstacle } from '../types';
import { clamp, dist } from '../core/math';

const { BASE_RADIUS, PETAL_VARIANCE, CENTER_X, CENTER_Y } = MAP_SHAPE_CONFIG;

/** 某个角度上地图的最大半径（花瓣形状的关键） */
export const getMapBoundaryRadius = (angle: number): number =>
  BASE_RADIUS + PETAL_VARIANCE * Math.abs(Math.sin(2 * angle));

/** 坐标是否落在地图内（buffer 为额外安全边距） */
export const isPositionValid = (x: number, y: number, buffer = 0): boolean => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const dx = x - CENTER_X;
  const dy = y - CENTER_Y;
  const distance = Math.hypot(dx, dy);
  return distance < getMapBoundaryRadius(Math.atan2(dy, dx)) - buffer;
};

interface Mover {
  x: number;
  y: number;
  radius: number;
  angle: number;
  vx?: number;
  vy?: number;
}

/**
 * 把实体约束在地图内。
 *
 * 分三级，避免边界抽搐：
 *   softLimit 以外 → 平滑减速（转向 + 削减外向速度分量）
 *   limit     以外 → 拉回并平滑反弹
 *   NaN / 非法   → 直接传送回地图中心（兜底）
 */
export const clampToMap = (entity: Mover, isBattleTest = false): void => {
  if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) {
    entity.x = CENTER_X;
    entity.y = CENTER_Y;
    return;
  }

  const dx = entity.x - CENTER_X;
  const dy = entity.y - CENTER_Y;
  const currentDist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  const maxR = isBattleTest ? 800 : getMapBoundaryRadius(angle);

  const boundaryBuffer = Math.max(entity.radius * 3, 150);
  const limit = maxR - entity.radius;
  const softLimit = maxR - entity.radius - boundaryBuffer;

  if (currentDist > limit) {
    const correctedDist = Math.max(limit - boundaryBuffer, limit * 0.95);
    entity.x = CENTER_X + Math.cos(angle) * correctedDist;
    entity.y = CENTER_Y + Math.sin(angle) * correctedDist;

    if (entity.vx !== undefined && entity.vy !== undefined) {
      const angleToCenter = Math.atan2(CENTER_Y - entity.y, CENTER_X - entity.x);
      const dotProduct =
        entity.vx * Math.cos(angleToCenter) + entity.vy * Math.sin(angleToCenter);

      if (dotProduct > 0) {
        const perpX = -Math.sin(angleToCenter);
        const perpY = Math.cos(angleToCenter);
        const perpDot = entity.vx * perpX + entity.vy * perpY;
        const smoothFactor = 0.5;
        entity.vx =
          -Math.abs(entity.vx) * smoothFactor * Math.cos(angleToCenter) +
          perpX * perpDot * (1 - smoothFactor);
        entity.vy =
          -Math.abs(entity.vy) * smoothFactor * Math.sin(angleToCenter) +
          perpY * perpDot * (1 - smoothFactor);
      }
      entity.angle = angleToCenter + (entity.angle - angleToCenter) * 0.6;
    }
  } else if (currentDist > softLimit) {
    if (entity.vx !== undefined && entity.vy !== undefined) {
      const penetrationRatio = (currentDist - softLimit) / (limit - softLimit);
      const slowFactor = Math.max(0.4, 1 - penetrationRatio * 0.6);
      const angleToCenter = Math.atan2(CENTER_Y - entity.y, CENTER_X - entity.x);
      const dotProduct =
        entity.vx * Math.cos(angleToCenter) + entity.vy * Math.sin(angleToCenter);

      if (dotProduct > 0) {
        entity.vx -= Math.cos(angleToCenter) * dotProduct * (1 - slowFactor) * 0.3;
        entity.vy -= Math.sin(angleToCenter) * dotProduct * (1 - slowFactor) * 0.3;
      }
      entity.angle = angleToCenter + (entity.angle - angleToCenter) * (0.5 + slowFactor * 0.5);
    }
  }
};

/**
 * 障碍物推挤：把实体挤出障碍物范围。
 * 两遍处理：单遍在障碍物成对重叠时可能把鱼从一块挤进另一块，来回抵消等于卡死；
 * 第二遍把第一遍的二次穿透也推出去，夹缝就锁不住鱼了。
 */
export const resolveObstacles = (entity: Mover, obstacles: readonly Obstacle[]): void => {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const o of obstacles) {
      const d = dist(entity, o);
      const minDist = o.radius + entity.radius;
      if (d >= minDist || d === 0) continue;

      const push = (minDist - d) / d;
      entity.x += (entity.x - o.x) * push;
      entity.y += (entity.y - o.y) * push;
    }
  }
};

/** 坐标属于哪个生态区（四象限） */
export const getBiome = (x: number, y: number): BiomeType => {
  if (x < CENTER_X && y < CENTER_Y) return BiomeType.SHALLOWS;
  if (x >= CENTER_X && y < CENTER_Y) return BiomeType.REEF;
  if (x < CENTER_X && y >= CENTER_Y) return BiomeType.SWAMP;
  return BiomeType.ABYSS;
};

/** 在指定生态区内取一个随机点 */
export const getRandomPosInBiome = (biome: BiomeType): { x: number; y: number } => {
  const baseAngle: Record<BiomeType, number> = {
    [BiomeType.SHALLOWS]: -3 * Math.PI / 4,
    [BiomeType.REEF]: -Math.PI / 4,
    [BiomeType.SWAMP]: 3 * Math.PI / 4,
    [BiomeType.ABYSS]: Math.PI / 4,
  };

  const maxR = BASE_RADIUS + PETAL_VARIANCE * 0.8;
  const r = 500 + Math.random() * Math.max(0, maxR - 800);
  const a = baseAngle[biome] + (Math.random() - 0.5) * 0.5;

  return {
    x: CENTER_X + Math.cos(a) * r,
    y: CENTER_Y + Math.sin(a) * r,
  };
};

/** 地图内随机点（生成实体用） */
export const getRandomPos = (buffer = 50): { x: number; y: number } => {
  const size = MAP_SHAPE_CONFIG.CENTER_X * 2;
  return { x: Math.random() * size, y: Math.random() * size };
};

export const getBiomeName = (biome: BiomeType): string => BIOME_DATA[biome]?.name ?? '未知海域';

export const MAP_CENTER = { x: CENTER_X, y: CENTER_Y };

export { clamp };
