/**
 * 数学与几何工具 —— 无业务依赖，任何系统都可安全引用。
 * 所有函数对 NaN / Infinity 免疫，这是整个引擎容错的第一道防线。
 */

export interface Point {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

/** 数值安全：非有限数一律回退 */
export const num = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 平方距离：只做比较时用它，省一次开方 */
export const dist2 = (a: Point, b: Point): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

/** 把角度收敛到 [-PI, PI] */
export const normalizeAngle = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= TAU;
  while (x < -Math.PI) x += TAU;
  return x;
};

export const angleTo = (from: Point, to: Point): number =>
  Math.atan2(to.y - from.y, to.x - from.x);

/** 从 from 方向转到 to 方向的最短角差 */
export const angleDiff = (from: number, to: number): number => normalizeAngle(to - from);

/** 朝目标角度平滑转动，返回新角度 */
export const turnToward = (current: number, target: number, agility: number): number =>
  current + angleDiff(current, target) * clamp(agility, 0, 1);

/**
 * 位置体检：坐标一旦变成 NaN 就会污染整张 QuadTree 和所有碰撞计算，
 * 所以每帧在进入物理前统一修复。
 */
export const sanitizePosition = (e: Point, fallbackX: number, fallbackY: number): boolean => {
  if (Number.isFinite(e.x) && Number.isFinite(e.y)) return true;
  e.x = fallbackX;
  e.y = fallbackY;
  return false;
};

/** 半径、血量等标量体检 */
export const sanitizeScalar = (e: { radius: number; health: number; maxHealth: number }): void => {
  if (!Number.isFinite(e.radius) || e.radius <= 0) e.radius = 1;
  if (!Number.isFinite(e.health)) e.health = 0;
  if (!Number.isFinite(e.maxHealth) || e.maxHealth <= 0) e.maxHealth = Math.max(1, e.health);
};

export const randRange = (min: number, max: number): number => min + Math.random() * (max - min);

export const pick = <T>(arr: readonly T[]): T | undefined =>
  arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;

export const uuid = (): string => Math.random().toString(36).slice(2, 11);
