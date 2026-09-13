/**
 * 地形系统 —— 花瓣形地图的边界计算与位置约束。
 *
 * 被移动、AI、生成三个系统共用。
 * ⚠️ 边界处理经历过一次「抽搐」修复（缓冲区分软硬两级），改动前先看懂下面的分级逻辑。
 */

import { MAP_SHAPE_CONFIG } from '../data/world';
import { BIOME_DATA, BiomeType } from '../data/biomes';
import type { Obstacle } from '../types';
import { clamp, normalizeAngle } from '../core/math';

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

/** 贴障碍物时每帧最多把朝向掰多少弧度：与常规转向同量级，避免一帧扭到切向又是一次抽搐 */
const SLIDE_TURN_PER_FRAME = 0.35;

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
 * 障碍物推挤：把实体挤出障碍物范围，并让它**沿障碍物表面滑走**。
 *
 * 为什么不能只推位置：AI / 玩家每帧都会先把实体朝目标推进（`moveForward`），
 * 如果目标在岩石另一侧，这一帧的推进方向就是「扎进石头里」，推挤再把它顶回表面 ——
 * 实体就此**顶死在石头上**：位置一动不动，尾巴还在摆，看着就是「撞上去顿挫」。
 * 实测（400 帧）：玩家贴面 387 帧、绕行扫掠 **0.00 rad**；鱼贴面 799/900 帧。
 *
 * 治法与 `clampToMap` 处理地图边界同款（那边早就算切向做平滑了，障碍物一直没跟上）：
 *   ① 推到表面（不是随便推出去了事）
 *   ② 朝向**限速**掰到切向 —— 切线取与当前朝向同侧的那一支，
 *      下一帧 AI / 玩家从这个方向继续转向目标，于是顺着石头边缘滑过去
 *   ③ vx / vy 跟着朝向走，保持「速度与朝向一致」这个不变量
 *
 * ⚠️ ② 必须限速，不能一帧直接设成切向：渲染是 `ctx.rotate(entity.angle)`，
 *    正面撞上时切向与当前朝向最多差 90°，一帧扭过去本身就是一次可见的抽搐。
 *    限速值取与常规转向同量级（~0.35 rad/帧），看起来就是「贴着石头拐个弯」。
 *
 * ⚠️ 朝向只在实体**确实在动**时才掰：趴着不动的伏击鱼 / 打盹鱼速度是 0，
 *    不能因为被推了一下就突然扭头。
 *
 * 两遍处理：单遍在障碍物成对重叠时可能把鱼从一块挤进另一块，来回抵消等于卡死；
 * 第二遍把第一遍的二次穿透也推出去，夹缝就锁不住鱼了。
 */
export const resolveObstacles = (entity: Mover, obstacles: readonly Obstacle[]): void => {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const o of obstacles) {
      const dx = entity.x - o.x;
      const dy = entity.y - o.y;
      const d = Math.hypot(dx, dy);
      const minDist = o.radius + entity.radius;
      if (d >= minDist || d === 0) continue;

      // ① 推到表面。法线 (nx, ny) 由障碍物圆心指向实体，也就是「外侧」
      const nx = dx / d;
      const ny = dy / d;
      entity.x = o.x + nx * minDist;
      entity.y = o.y + ny * minDist;

      // 趴着不动的（伏击 / 打盹）只推位置，不改朝向
      const vx = entity.vx ?? 0;
      const vy = entity.vy ?? 0;
      const speed = Math.hypot(vx, vy);
      if (speed < 1e-4) continue;

      // ② 朝向限速掰向切向。切向基是 (-ny, nx)，取与当前朝向同号的那一支 ——
      //    正对撞上时（切向速度 ≈ 0）不会左右乱翻，而是稳定地挑一侧滑走
      const tx = -ny;
      const ty = nx;
      const sign = Math.cos(entity.angle) * tx + Math.sin(entity.angle) * ty >= 0 ? 1 : -1;
      const tangent = Math.atan2(sign * ty, sign * tx);
      const diff = normalizeAngle(tangent - entity.angle);
      entity.angle += clamp(diff, -SLIDE_TURN_PER_FRAME, SLIDE_TURN_PER_FRAME);

      // ③ 速度跟着朝向走（本轮真正生效的是朝向，它才是下一帧位移的来源）
      entity.vx = Math.cos(entity.angle) * speed;
      entity.vy = Math.sin(entity.angle) * speed;
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
