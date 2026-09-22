/**
 * 阵营关系（G1 / FQ-03 · 架构配套 AR-02）
 *
 * 为什么单开一个文件：FQ-03 之前，「谁能打谁」这件事散在两处且口径不一 ——
 *   · `combat.ts` 的 `isFriendly()`：只看 `id === 'player' || ownerId === 'player'`
 *   · `ai.ts` 的 `isEnemy()`：只看 `ownerId` 相等
 * 结果是**技能路径根本没有阵营过滤**（`skills.ts` 的 `forEachNearby` 只排除吉祥物），
 * 玩家一个范围技能下去，先躺下的是自己的战队 —— 这就是计划 §2 提醒的「友军误伤」。
 *
 * 本模块提供唯一权威判定，三个消费点（combat / ai / skills）全部改读这里：
 *   `factionOf`  阵营归属：玩家本体与战队成员同属 PLAYER；无主的野鱼属 WILD
 *   `canHarm`    能否伤害：同阵营不可互伤；WILD 之间保留生态链互吃
 *   `isPlayerFaction` 收益归属：击杀收益记到**阵营**而不是个人（见 combat.resolveDeath）
 *
 * ⚠️ WILD 是「无阵营」而不是「中立阵营」：野鱼互相捕食是生态链的一部分
 *    （`combatSystem` 的鱼 vs 鱼段就是靠它转起来的），所以 WILD vs WILD 必须返回 true。
 *    把它当成普通阵营做「同阵营不可互伤」，整个生态会当场静止。
 *
 * ⚠️ 只 import type：data 层 → types → data 层会接成运行环，类型导入会被擦除，安全。
 */

import type { Entity, PlayerState } from '../types';

/** 阵营 ID。玩家阵营是常量，敌对鱼群（G2/FQ-08）直接用队伍 id 当阵营 id */
export const FACTION = {
  PLAYER: 'PLAYER',
  /** 无阵营（野鱼）：不享受「同阵营不可互伤」，互相可吃 */
  WILD: 'WILD',
} as const;

export type FactionId = string;

/** 玩家阵营的 ownerId 写法（`ownerId === 'player'` 是既有约定，渲染/UI 都读它） */
export const PLAYER_OWNER_ID = 'player';

/**
 * 阵营归属。
 * 玩家本体没有 `ownerId`（它是 `state.player`，不在 `entities` 里），
 * 所以要单独认一次 `id === 'player'`，否则玩家和自己的战队会被判成两个阵营。
 */
export const factionOf = (e: Entity | PlayerState): FactionId => {
  if (e.id === 'player') return FACTION.PLAYER;
  if (typeof e.ownerId === 'string' && e.ownerId.length > 0) {
    return e.ownerId === PLAYER_OWNER_ID ? FACTION.PLAYER : e.ownerId;
  }
  return FACTION.WILD;
};

/** 是否玩家阵营（本体或战队成员）—— 击杀收益归属用它，避免「抢最后一口」成为最优解 */
export const isPlayerFaction = (e: Entity | PlayerState): boolean =>
  factionOf(e) === FACTION.PLAYER;

/**
 * 能否伤害 target。
 *
 * - 自己不打自己（`id` 相同）
 * - 同阵营不打（玩家 / 战队 / 将来的敌对鱼群内部）
 * - WILD 参与时通常放行：野鱼互吃、野鱼打玩家、玩家打野鱼都成立
 * - `rival-` 事件敌队与背景 WILD 互不消耗，避免主要对手在进场途中被清掉
 *
 * 吉祥物不在这里过滤 —— 「吉祥物不参战」是内容规则不是阵营规则，
 * 由 combat / skills 各自的 MASCOT 门闸负责（保持现有调用点语义不变）。
 */
export const canHarm = (attacker: Entity | PlayerState, target: Entity | PlayerState): boolean => {
  // ⚠️ 用**对象同一性**而不是 id 相等：单测里 `vi.spyOn(Math, 'random').mockReturnValue(0)`
  //    会让 `uuid()`（= `Math.random().toString(36)`）给所有实体生成同一个 id，
  //    按 id 判自伤会把「两个不同实体」误判成「自己打自己」，战斗判定整段失效。
  if (attacker === target) return false;
  const fa = factionOf(attacker);
  const fb = factionOf(target);
  // 投食事件的稳定敌队是主要玩法参与者，不能在赶路时被随机生态提前清场。
  // 它们仍可与玩家阵营及其他敌队交战；普通 WILD 彼此捕食也保持不变。
  const eventRivalVsWild = (fa === FACTION.WILD && fb.startsWith('rival-'))
    || (fb === FACTION.WILD && fa.startsWith('rival-'));
  if (eventRivalVsWild) return false;
  if (fa === FACTION.WILD || fb === FACTION.WILD) return true;
  return fa !== fb;
};
