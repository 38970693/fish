/**
 * 隐蔽系统 —— 水草掩体 + 伪装技能。
 *
 * 为什么需要这个系统：
 *   1. 沼泽区的「水草」(Obstacle.type === 'SEAWEED') 原本只是**实体障碍**，
 *      `resolveObstacles` 会把玩家推开 —— 也就是说物理上根本进不去，
 *      「躲进水草」这件事从来就没法发生。
 *   2. AI 的全部锁定判定（`systems/ai.ts` 的 `findNearest`）只看体型/距离，
 *      从不检查隐蔽状态 —— 于是连「伪装」技能（camouflage）都是摆设，
 *      技能文案「敌人无法发现」是假的，`isHidden` 更是个从没被设成 true 的死字段。
 *
 * 本系统负责把「隐蔽」算成一个每帧刷新的**派生状态**，放在 `ai` 之前执行，
 * 让 AI 当帧就能读到。判定的事实只有两个来源：
 *   · 站在水草里     → `inCover`
 *   · 开着隐身技能   → `camoActive`（由 skills 写入，本系统只读）
 *
 * ⚠️ 隐蔽不是无敌：贴脸范围内照样会被发现（见 `CONCEAL_REVEAL_RANGE`），
 *    否则会出现「钻进草丛就绝对安全」的刷分漏洞。反制手段见 `ai.ts` 的声呐门闸。
 */

import type { Entity, GameState, Obstacle } from '../types';

/**
 * 掩体半径倍率：要进到水草半径的 85% 以内才算藏好。
 * 取不到 1.0 是刻意的 —— 擦着叶子边缘不算藏住，得真的钻进去。
 */
export const COVER_RADIUS_MULT = 0.85;

/**
 * 贴脸识破距离：追到这么近就藏不住了。
 * 没有这一条，玩家只要站在草丛里就能把任何大鱼耗到放弃，变成无脑刷分点。
 */
export const CONCEAL_REVEAL_RANGE = 150;
export const CONCEAL_REVEAL_RANGE_SQ = CONCEAL_REVEAL_RANGE * CONCEAL_REVEAL_RANGE;

/**
 * 水位线：坐标是否落在某片水草的掩体内。
 * 只认 SEAWEED —— 岩石和珊瑚是实心的，本来就进不去。
 */
export const isInSeaweedCover = (
  x: number,
  y: number,
  obstacles: readonly Obstacle[]
): boolean => {
  for (const o of obstacles) {
    if (o.type !== 'SEAWEED') continue;
    const dx = x - o.x;
    const dy = y - o.y;
    const reach = o.radius * COVER_RADIUS_MULT;
    if (dx * dx + dy * dy < reach * reach) return true;
  }
  return false;
};

/** 是否处于隐蔽状态（隐身技能 或 藏在水草里） */
export const isConcealed = (entity: Entity): boolean =>
  Boolean(entity.camoActive || entity.inCover);

/**
 * 复用缓冲，避免每帧 `filter` 分配一个新数组。
 * 每次调用都整体重建，所以不存在跨帧/跨用例的脏数据。
 */
const seaweedBuf: Obstacle[] = [];

export const concealmentSystem = (state: GameState): void => {
  seaweedBuf.length = 0;
  for (const o of state.obstacles) {
    if (o.type === 'SEAWEED') seaweedBuf.push(o);
  }

  const player = state.player;
  player.inCover = seaweedBuf.length
    ? isInSeaweedCover(player.x, player.y, seaweedBuf)
    : false;

  for (const e of state.entities) {
    e.inCover = seaweedBuf.length ? isInSeaweedCover(e.x, e.y, seaweedBuf) : false;
  }
};
