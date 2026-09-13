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
import { QuadTree } from '../utils/SpatialHash';

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
 * 贴约束面（障碍物 / 地图边缘）时每帧最多把朝向掰多少弧度。
 * 与常规转向同量级 —— 一帧扭到切向本身就是一次可见的抽搐（渲染是 `ctx.rotate(angle)`）。
 */
const SLIDE_TURN_PER_FRAME = 0.35;

/**
 * 把朝向**限速**掰到「贴着约束面滑走」的方向（障碍物与地图边缘共用）。
 *
 * 约束面的法线 `(nx, ny)` 由约束中心指向实体（即外侧），切向基是 `(-ny, nx)`。
 * 取与当前朝向**同侧**的那一支：正对撞上时切向速度 ≈ 0，不选分支就会左右乱翻。
 */
const alignToSurface = (entity: Mover, nx: number, ny: number): void => {
  const tx = -ny;
  const ty = nx;
  const sign = Math.cos(entity.angle) * tx + Math.sin(entity.angle) * ty >= 0 ? 1 : -1;
  const tangent = Math.atan2(sign * ty, sign * tx);
  entity.angle += clamp(
    normalizeAngle(tangent - entity.angle),
    -SLIDE_TURN_PER_FRAME,
    SLIDE_TURN_PER_FRAME
  );
};

/**
 * 把实体约束在地图内。
 *
 * 三级，避免边界抽搐：
 *   softLimit 以外 → 平滑减速（削减外向速度分量 + 轻微向心修正）
 *   limit     以外 → 推回**表面** + 朝向限速掰向切向（沿边滑走）
 *   NaN / 非法   → 直接传送回地图中心（兜底）
 *
 * ⚠️ 硬分支以前做两件过头的事，合起来就是「碰到边缘会反弹」：
 *    ① 往内拉到 `limit * 0.95`（≈ 边界半径的 5%，玩家实测一次倒飞 **159px**）；
 *    ② 朝向向心压缩 40%，而且**不限速** —— 一帧最多扭 **1.257rad（72°）**，
 *       连速度归零的伏击鱼贴到边界都会被甩头。
 *    现在与 `resolveObstacles` 走同一套（只推回表面 + `alignToSurface` 限速掰向切向），
 *    顶边界的表现从「弹回」变成「贴着边缘滑走」。
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
    // ① 只推回表面 —— 别再往内多拉一截（那才是「反弹」）
    const nx = dx / currentDist;
    const ny = dy / currentDist;
    entity.x = CENTER_X + nx * limit;
    entity.y = CENTER_Y + ny * limit;

    // ② 朝向限速掰向切向 + 速度跟着朝向（保持「速度与朝向一致」的不变量）
    if (entity.vx !== undefined && entity.vy !== undefined) {
      const speed = Math.hypot(entity.vx, entity.vy);
      // 趴着不动的（伏击 / 打盹）只推位置：不能因为贴到边界就扭头
      if (speed >= 1e-4) {
        alignToSurface(entity, nx, ny);
        entity.vx = Math.cos(entity.angle) * speed;
        entity.vy = Math.sin(entity.angle) * speed;
      }
    }
  } else if (currentDist > softLimit) {
    // 缓入区：**只减速**，不动朝向。
    // ⚠️ 这里原来还会把朝向「向心压缩」30%（离边越近压得越狠）。硬分支改成
    //    「贴表面 + 掰向切向」之后，实体是**钉在 limit 上**的（penetrationRatio 恒为 1），
    //    于是这个向心力每帧满强度地跟「掰向切向」抢方向盘 —— 朝向在两个方向之间来回翻，
    //    `orbit.test` 立刻报「PLANKTON 转 6.4 圈 半径 9.0px」。
    //    两条约束通路必须同向：缓入区只管减速，转向统一交给硬分支的 alignToSurface。
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
    }
  }
};

/**
 * 障碍物宽相位索引 —— 性能基线（scripts/probe-perf.mjs）量出来
 * `resolveObstacles` 是逻辑层第二贵的一块（每帧 ~0.5ms / 29%）：
 * 它对**每个**实体把**全部**障碍物扫两遍（180 × 57 × 2 ≈ 2 万次 `Math.hypot`），
 * 而绝大多数障碍物根本不在那个实体旁边。
 *
 * 这个类用四叉树把「全部障碍物」缩成「附近那几个」，交给 `resolveObstacles` 精确判定。
 * 关键约束是**行为必须与全量扫描一模一样**：
 *   · 推挤有副作用（会改 x/y/angle），先被哪块石头推、结果就不一样
 *     → `collect` 把命中下标**按原数组顺序**排好序（命中通常 0~3 个，排序忽略不计）
 *   · 四叉树返回的是超集（圆相交判定用 `<=`，精确判定是 `<`）
 *     → 多出来的那几个在 `resolveObstacles` 里的 `d >= minDist` 处自然跳过
 */
export class ObstacleIndex {
  private tree = new QuadTree<Obstacle>();
  /** 查询结果缓冲（存障碍物在数组里的下标，升序） */
  private buf: number[] = [];
  private source: readonly Obstacle[] = [];

  /** 每帧重建。障碍物不移动，但重建只要几十微秒，换来「永远正确」 */
  rebuild(obstacles: readonly Obstacle[]): void {
    this.source = obstacles;
    this.tree.rebuild(obstacles);
  }

  /**
   * 收集可能与 (x, y, r) 相交的障碍物，按下标升序放进内部缓冲。
   * @returns 个数，配合 `at(k)` 逐个取
   */
  collect(x: number, y: number, r: number): number {
    this.buf.length = 0;
    this.tree.queryCircle(x, y, r, this.buf);
    if (this.buf.length > 1) this.buf.sort((a, b) => a - b);
    return this.buf.length;
  }

  at(k: number): Obstacle {
    return this.source[this.buf[k]];
  }
}

/**
 * 障碍物推挤：把实体挤出障碍物范围，并让它**沿障碍物表面滑走**。
 *
 * 为什么不能只推位置：AI / 玩家每帧都会先把实体朝目标推进（`moveForward`），
 * 如果目标在岩石另一侧，这一帧的推进方向就是「扎进石头里」，推挤再把它顶回表面 ——
 * 实体就此**顶死在石头上**：位置一动不动，尾巴还在摆，看着就是「撞上去顿挫」。
 * 实测（400 帧）：玩家贴面 387 帧、绕行扫掠 **0.00 rad**；鱼贴面 799/900 帧。
 *
 * 治法与 `clampToMap` 处理地图边界同款（两条约束通路共用 `alignToSurface`）：
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
 *
 * @param index 可选的宽相位索引。**不传时行为与旧版完全一致（全量扫描）**，
 *              既有单测一个都不用改；worldSystem 传索引换性能。
 */
export const resolveObstacles = (
  entity: Mover,
  obstacles: readonly Obstacle[],
  index?: ObstacleIndex
): void => {
  for (let pass = 0; pass < 2; pass += 1) {
    // 第二遍要重新收集：第一遍把实体推走过，它身边的障碍物集合可能已经变了
    const count = index ? index.collect(entity.x, entity.y, entity.radius) : obstacles.length;
    for (let k = 0; k < count; k += 1) {
      const o = index ? index.at(k) : obstacles[k];
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

      // ② 朝向限速掰向切向 → 顺着石头边缘滑走（与地图边界共用 alignToSurface）
      alignToSurface(entity, nx, ny);

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
