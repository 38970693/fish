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
 *
 * 2026-09-13 调整：150 → **80**（用户反馈「水草下面视野度降低」）。
 * 取值依据：大鱼（双髻鲨 r≈50）身体压上来时与玩家的间距约 50+17=67px < 80，
 * 所以「贴脸照样被识破」这条语义还在；中体型的鱼则要贴进 80px 内才行。
 * ⚠️ 不要再往下压到 50 以下 —— 那时大鱼半径已大于识破距离，隐蔽会退化成
 * 「绝对看不见」，本文件开头「隐蔽不是无敌」的设计意图就没了。
 */
export const CONCEAL_REVEAL_RANGE = 80;
export const CONCEAL_REVEAL_RANGE_SQ = CONCEAL_REVEAL_RANGE * CONCEAL_REVEAL_RANGE;

/**
 * 藏在掩体里被「咬中」的概率倍率（0.2 = 砍到五分之一）。
 *
 * 为什么需要：`canPerceive` 只管「能不能锁定目标」；可一旦被识破（贴脸破功 /
 * 被声呐照到），后面的扑咬判定里**没有任何隐蔽项** —— 体型 2 倍以上的猎手基础
 * 命中率就有 0.8，藏没藏住都是照咬。用户体感「躲进水草还是被杀」正来自这里。
 *
 * ⚠️ 用法：见 `combat.ts` —— **FQ-04 之后，它是整条扑咬判定里唯一还掷骰子的地方**
 *    （旧实现是 `Math.max(eatProbability, 0.5)` 那个地板值覆盖它，命中率本身已随
 *    「稳定撕咬」整体删除，别再去找那个 max 了）。所以顺序已经不再敏感，
 *    但语义上仍然只该管「藏在掩体里那一下」，不要拿它当通用命中率用。
 */
export const CONCEAL_BITE_PROB_MULT = 0.2;

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
 * 能否察觉到目标 —— **所有锁定判定的唯一收口**。
 *
 * 隐蔽单位（藏在水草里 / 开着隐身技能）默认看不见，只有两种例外：
 *   · 已经贴到脸上（CONCEAL_REVEAL_RANGE）—— 钻草丛不等于无敌
 *   · 猎手刚放过「声呐扫描」（sonarTimer > 0）—— 这是隐蔽的反制手段
 *
 * ⚠️ 2026-09-15（FQ-05）从 `ai.ts` 搬到这里并导出：集火指令也要挑「可感知的敌人」，
 *    如果 squad 再写一份自己的可见性判断，就又回到 FQ-03 之前
 *    「同一件事三处各写一份、口径不一」的老毛病上。锁定类判定一律走这里。
 *
 * @param distSq 调用方已经算好的平方距离（避免这里重算一次）
 */
export const canPerceive = (seeker: Entity, target: Entity, distSq: number): boolean => {
  if (!isConcealed(target)) return true;
  if (seeker.sonarTimer && seeker.sonarTimer > 0) return true;
  return distSq <= CONCEAL_REVEAL_RANGE_SQ;
};

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
