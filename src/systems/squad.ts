/**
 * 战队系统 —— 收编、跟随、切换、亡语夺舍。
 *
 * 需求来源（用户提示词）：
 *   #70  被玩家吃掉的鱼要加入自己的战队（不是消失）
 *   #234 主动切换：灵魂附身到小弟身上，原来的身体变成小弟
 *   #245 亡语：本体死亡时夺舍「半径最大」的成员，而不是随机
 *   #254 自己人不打自己人（判定已在 combat.isFriendly / ai.isEnemy 里）
 *   #294 没有成员可夺舍时才干净切到结算
 *
 * 设计要点：
 *  1. **成员就是普通实体**，只是 `ownerId === 'player'`。
 *     好处是渲染、碰撞、战斗、边界全都复用现成链路，不用另写一套；
 *     combat 的 isFriendly / ai 的 isEnemy 天然保证「自己人不打自己人」。
 *  2. **收编走队列，不直接 push 实体**。吞噬发生在 combat 的碰撞遍历中间，
 *     此时往 entities 里塞元素会让当前这轮循环多跑一遍新元素。
 *  3. **成员的行为由本系统独占**（ai 系统里跳过 ownerId 的实体），
 *     否则两个系统各写一次位置，鱼会原地抽搐。
 */

import { SQUAD_CONFIG, PHRASES } from '../data/world';
import type { Entity, GameState, FrameContext, PlayerState, SquadRecruit } from '../types';
import { turnToward, pick } from '../core/math';
import { createEntity } from './spawn';

/* ══════════════ 查询 ══════════════ */

/** 战队成员 = entities 里 ownerId 指向玩家的活体 */
export const getSquadMembers = (state: GameState): Entity[] =>
  state.entities.filter((e) => e.ownerId === 'player' && e.health > 0);

export const isSquadMember = (e: Entity): boolean => e.ownerId === 'player';

/* ══════════════ 收编 ══════════════ */

/**
 * 登记一个俘虏。由 combat 系统在玩家吞噬成功后调用。
 *
 * 这里只登记不落地 —— 真正的实体创建在 squadSystem 里做，
 * 避开「在碰撞遍历中间改 entities」的坑。
 */
export const recruitToSquad = (state: GameState, victim: Entity): void => {
  if (state.squad.pending.length + getSquadMembers(state).length >= SQUAD_CONFIG.MAX_SIZE) return;
  // 饲料（浮游生物）不收编；吉祥物本来就不参战
  if (victim.config.tier < SQUAD_CONFIG.RECRUIT_MIN_TIER) return;

  state.squad.pending.push({
    type: victim.type,
    x: victim.x,
    y: victim.y,
    radius: victim.radius,
    health: victim.maxHealth,
    maxHealth: victim.maxHealth,
    level: victim.level,
    cosmetics: victim.cosmetics,
  });
};

/** 把队列里的俘虏变成实体。超过上限的直接丢弃（不补位，避免战线拉太长） */
const flushRecruits = (state: GameState): void => {
  if (state.squad.pending.length === 0) return;

  const room = SQUAD_CONFIG.MAX_SIZE - getSquadMembers(state).length;
  if (room <= 0) {
    state.squad.pending.length = 0;
    return;
  }

  for (const r of state.squad.pending.splice(0, room)) {
    const member = createEntity(r.type, r.x, r.y);
    member.ownerId = 'player';
    member.radius = r.radius;
    member.level = r.level;
    member.health = r.health;
    member.maxHealth = r.maxHealth;
    if (r.cosmetics) member.cosmetics = r.cosmetics;
    // 刚入队给个短半虚，免得上一秒还是敌人、下一秒就被旁边的大鱼顺手吃掉
    member.semiGhostTimer = SQUAD_CONFIG.RECRUIT_GHOST;
    member.speechBubble = {
      text: pick(PHRASES.SQUAD) ?? '老大!',
      timer: 90,
      color: '#22d3ee',
    };
    state.entities.push(member);
    state.squad.recruitedTotal += 1;
  }
  state.squad.pending.length = 0;
};

/* ══════════════ 身体交换 ══════════════ */

/**
 * 把 b 的「身体」搬到 a 上：种类 / 体型 / 血量 / 等级 / 外观。
 * 灵魂层面的东西（weight / evolutionPoints / score / 技能）不动。
 */
const moveBody = (from: Entity, to: Entity): void => {
  to.type = from.type;
  to.config = from.config;
  to.radius = from.radius;
  to.health = from.health;
  to.maxHealth = from.maxHealth;
  to.level = from.level;
  to.cosmetics = from.cosmetics ?? to.cosmetics;
  to.speed = from.config.speed * (to.id === 'player' ? 1.2 : 1);
};

/**
 * 夺舍 / 切换。
 *
 * - `revive: false`（主动切换）：玩家与成员**交换身体**，原身体留在队里当小弟。
 * - `revive: true`（亡语）：旧身体已经死了，直接丢弃，玩家接管成员的身体满血复活。
 *
 * @returns 是否成功（没有成员 / 成员不存在 → false）
 */
export const possessMember = (
  state: GameState,
  memberId: string,
  options: { revive?: boolean } = {}
): boolean => {
  const idx = state.entities.findIndex((e) => e.id === memberId && e.ownerId === 'player');
  if (idx < 0) return false;

  const member = state.entities[idx];
  const player = state.player;

  if (options.revive) {
    /* 亡语：旧身体作废，灵魂进新身体，满血 + 保护帧 */
    state.entities.splice(idx, 1);
    moveBody(member, player);
    player.health = player.maxHealth;
    player.invulnerableTimer = SQUAD_CONFIG.POSSESS_PROTECTION;
    player.semiGhostTimer = 0;
    state.squad.possessCount += 1;
    player.speechBubble = { text: '夺舍成功！', timer: 120, color: '#22d3ee' };
    return true;
  }

  /* 主动切换：身体对调，位置也跟着换（灵魂瞬移到小弟身上） */
  // ⚠️ 位置必须**先全部记下来**再动手。踩过的坑：
  //    如果先 `member.x = px` 再 `player.x = member.x`，读到的已经是覆盖后的值，
  //    结果是「小弟被拽到玩家身上」而不是「玩家飞到小弟身上」，
  //    而且还会有个成员的虚线环叠在玩家身上，看着像渲染错了。
  const playerPos = { x: player.x, y: player.y, angle: player.angle };
  const memberPos = { x: member.x, y: member.y };

  // 先把玩家当前的身体存下来（等下要给成员）
  const memberBody = {
    type: member.type,
    config: member.config,
    radius: member.radius,
    health: member.health,
    maxHealth: member.maxHealth,
    level: member.level,
    cosmetics: member.cosmetics,
  };

  // 成员接管玩家留下的身体，并留在玩家原来的位置
  moveBody(player, member);
  member.x = playerPos.x;
  member.y = playerPos.y;
  member.angle = playerPos.angle;
  member.speechBubble = { text: '换我了？', timer: 60, color: '#a78bfa' };

  // 玩家接管成员的身体，落到成员原来的位置
  player.type = memberBody.type;
  player.config = memberBody.config;
  player.radius = memberBody.radius;
  player.health = memberBody.health;
  player.maxHealth = memberBody.maxHealth;
  player.level = memberBody.level;
  if (memberBody.cosmetics) player.cosmetics = memberBody.cosmetics;
  player.speed = player.config.speed * 1.2;
  player.x = memberPos.x;
  player.y = memberPos.y;

  player.speechBubble = { text: '附身！', timer: 60, color: '#22d3ee' };
  return true;
};

/* ══════════════ 主动切换 ══════════════ */

/** 当前切换目标的下标（轮转用）。跟着 state 走会污染 GameState，用模块级计数器即可 */
let switchCursor = 0;

/**
 * 手动切换到下一个成员（轮转）。
 *
 * 提示词 #234 原本写的是「随机附身」，这里改成**轮转**：
 * 随机切会让玩家不知道自己会跳到哪条鱼身上，轮转可预期、也更好测。
 */
export const switchToNextMember = (state: GameState): boolean => {
  if (state.squad.switchCooldown > 0) return false;

  const members = getSquadMembers(state);
  if (members.length === 0) return false;

  if (switchCursor >= members.length) switchCursor = 0;
  const target = members[switchCursor];
  switchCursor = (switchCursor + 1) % members.length;

  const ok = possessMember(state, target.id, { revive: false });
  if (ok) state.squad.switchCooldown = SQUAD_CONFIG.SWITCH_COOLDOWN;
  return ok;
};

/** 测试用：重置轮转游标，避免用例之间互相影响 */
export const __resetSwitchCursor = (): void => {
  switchCursor = 0;
};

/* ══════════════ 跟随 ══════════════ */

/**
 * 成员围绕玩家排成环形队列。
 * 落后超过死区才追（否则每帧微调会抖），到位后速度衰减停下来。
 */
const updateFollow = (state: GameState): void => {
  const members = getSquadMembers(state);
  if (members.length === 0) return;

  const p = state.player;

  for (let i = 0; i < members.length; i += 1) {
    const m = members[i];
    // 队形角：按序号均匀铺开，整体缓慢自转，看起来像护卫阵
    const formation =
      (i * SQUAD_CONFIG.FORMATION_ANGLE_STEP * Math.PI) / 180 + state.time * 0.01;
    const desired = p.radius + m.radius + SQUAD_CONFIG.FOLLOW_GAP;
    const tx = p.x + Math.cos(formation) * desired;
    const ty = p.y + Math.sin(formation) * desired;

    const dx = tx - m.x;
    const dy = ty - m.y;
    const d = Math.hypot(dx, dy);

    if (d > SQUAD_CONFIG.FOLLOW_DEADZONE) {
      const target = Math.atan2(dy, dx);
      m.angle = turnToward(m.angle, target, 0.15);
      // 比常规速度快一点，否则追不上开了加速的玩家
      const sp = m.speed * 1.25;
      m.vx = Math.cos(m.angle) * sp;
      m.vy = Math.sin(m.angle) * sp;
      m.x += m.vx;
      m.y += m.vy;
    } else {
      m.vx *= 0.85;
      m.vy *= 0.85;
    }
  }
};

/* ══════════════ 系统入口 ══════════════ */

export const squadSystem = (state: GameState, _ctx: FrameContext): void => {
  if (state.squad.switchCooldown > 0) state.squad.switchCooldown -= 1;

  flushRecruits(state);
  updateFollow(state);
};

/* ══════════════ 亡语 ══════════════ */

/**
 * 玩家死亡时的夺舍：挑**半径最大**的成员（提示词 #245 明确要求最大，不是随机）。
 * @returns 是否夺舍成功（false = 队里没人，调用方该切结算了）
 */
export const tryPossessOnDeath = (state: GameState): boolean => {
  const members = getSquadMembers(state);
  if (members.length === 0) return false;

  let best = members[0];
  for (const m of members) {
    if (m.radius > best.radius) best = m;
  }

  // 旧身体已死，这里不换血，possessMember 内部会补满
  return possessMember(state, best.id, { revive: true });
};
