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
 * 屏幕坐标 → 世界坐标。
 *
 * 变换与 `GameCanvas` 的相机完全一致：`screen = (world - camera) * zoom + size/2`。
 * 反解出来就是下面这个式子。画布没有做 devicePixelRatio 缩放
 * （`canvas.width = window.innerWidth`），所以屏幕坐标 == 画布坐标 == CSS 像素。
 *
 * 为什么要有它：鼠标在游戏里一直只当**方向**用（`playerControl` 拿它算屏幕中心的夹角），
 * 从来没有世界坐标。FQ-05 的「集火」必须知道玩家点的是**哪条鱼**，
 * 才需要这一次反解 —— 与其在 UI 里再抄一遍相机公式，不如收在这里一处。
 */
export const screenToWorld = (
  camera: { x: number; y: number; zoom: number },
  screenX: number,
  screenY: number,
  screenW: number,
  screenH: number
): { x: number; y: number } => {
  const zoom = camera.zoom || 1;
  return {
    x: camera.x + (screenX - screenW / 2) / zoom,
    y: camera.y + (screenY - screenH / 2) / zoom,
  };
};

/** 世界坐标 → 屏幕坐标；与 screenToWorld 互为逆变换。 */
export const worldToScreen = (
  camera: { x: number; y: number; zoom: number },
  worldX: number,
  worldY: number,
  screenW: number,
  screenH: number
): { x: number; y: number } => ({
  x: (worldX - camera.x) * (camera.zoom || 1) + screenW / 2,
  y: (worldY - camera.y) * (camera.zoom || 1) + screenH / 2,
});

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
