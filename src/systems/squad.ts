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
 *
 * ── G1 / FQ-05：三个指令与指定附身（《鱼群争霸开发计划》§6.2）──
 *
 *   · **指令是状态不是动作**：`squad.command` 一直挂着，队员每帧照着它动。
 *     集火的目标也是状态（`commandTargetId`），每帧重新校验有效性。
 *   · **离散输入走队列**：键盘 / 头像点击只 `queueSquadAction`，
 *     由 squadSystem 帧内**消费一次就出队**（AR-03：重复输入不多次换身）。
 *   · **附身不做兜底**：指定的成员没了就什么都不做 + 给原因。
 *     悄悄换到「另一个成员」身上比失败更糟 —— 玩家会以为换成功了。
 *   · **冷却归属写死**：技能 / 流派 / 切换冷却属于**灵魂**（不随身体走，
 *     所以附身刷不了），撕咬与反击冷却属于**身体**（随身体对调，也刷不了）。
 */

import { SQUAD_CONFIG, PHRASES } from '../data/world';
import {
  SQUAD_COMMAND,
  SQUAD_COMMAND_CONFIG,
  SQUAD_ROLE,
  SQUAD_ROLES,
  SQUAD_ROLE_CONFIG,
  DEFAULT_SQUAD_COMMAND,
  getSquadCommandConfig,
  getSquadRoleConfig,
  findRoleBySpecies,
  type SquadCommandId,
  type SquadRoleId,
} from '../data/squadRoles';
import type {
  Entity,
  GameState,
  FrameContext,
  PlayerState,
  SquadRecruit,
  SquadAction,
} from '../types';
import { GameStatus } from '../types';
import { turnToward, pick, dist, dist2 } from '../core/math';
import { createEntity } from './spawn';
import { canHarm } from './factions';
import { canPerceive } from './concealment';
import { getCreatureDisplayName } from '../data/rareVariants';
import { reefNavigationPoint } from './reefNavigation';
import { rememberTerrainPosition, forgetTerrainPosition } from './terrain';
import { getPlayerRadiusCapacity } from './playerGrowth';

/* ══════════════ 查询 ══════════════ */

/** 战队成员 = entities 里 ownerId 指向玩家的活体 */
export const getSquadMembers = (state: GameState): Entity[] =>
  state.entities.filter((e) => e.ownerId === 'player' && e.health > 0);

export const isSquadMember = (e: Entity): boolean => e.ownerId === 'player';

/**
 * 核心成员（G1 / FQ-06）—— 身上挂着 `coreRole` 的活体队员。
 *
 * 只有这一批人会触发专属能力。普通成员的能力开关恒为 undefined，
 * 于是「十条队员同时放控制」这件事在数据结构层面就不可能发生
 * （计划 §6.1 首版 + §12「队伍越大越无脑」）。
 */
export const getCoreMembers = (state: GameState): Entity[] =>
  state.entities.filter((e) => e.ownerId === 'player' && e.health > 0 && !!e.coreRole);

/* ══════════════ 收编 ══════════════ */

/**
 * 登记一个俘虏。由 combat 系统在玩家吞噬成功后调用。
 *
 * 这里只登记不落地 —— 真正的实体创建在 squadSystem 里做，
 * 避开「在碰撞遍历中间改 entities」的坑。
 */
export const recruitToSquad = (state: GameState, victim: Entity): void => {
  if (state.arena) return;
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
    appearanceV2: victim.appearanceV2,
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
    if (r.appearanceV2) member.appearanceV2 = structuredClone(r.appearanceV2);
    // 刚入队给个短半虚，免得上一秒还是敌人、下一秒就被旁边的大鱼顺手吃掉
    member.semiGhostTimer = SQUAD_CONFIG.RECRUIT_GHOST;
    member.speechBubble = {
      text: pick(PHRASES.SQUAD) ?? '老大!',
      timer: 90,
      color: '#22d3ee',
    };
    state.entities.push(member);
    state.squad.recruitedTotal += 1;
    assignCoreRole(state, member);
    state.squad.notice = {
      text: `${getCreatureDisplayName(member)} 加入战队 · ${getSquadMembers(state).length}/${SQUAD_CONFIG.MAX_SIZE}`,
      color: '#22d3ee',
      timer: SQUAD_COMMAND_CONFIG.NOTICE_FRAMES,
    };
  }
  state.squad.pending.length = 0;
};

/**
 * 给新成员分配核心角色（G1 / FQ-06 · 计划 §6.1）。
 *
 * 三条门槛，缺一不可：
 *   ① 物种要对得上（`findRoleBySpecies`）—— 角色是行为配置，不新增物种；
 *   ② 核心位没满（`CORE_SLOTS` = 3）；
 *   ③ 该角色还空着 —— 收第二条河豚也只是普通成员，不给第二个护卫位。
 *
 * 角色自带的**弱点在这里一次性落到身体上**：血量倍率改 `maxHealth`、
 * 伤害倍率改**克隆出来**的 config（绝不改 `data/creatures.ts` 的共享对象），
 * 速度倍率不落身体 —— 它每帧从角色配置读（换身体时自动跟着角色走）。
 */
const assignCoreRole = (state: GameState, member: Entity): void => {
  const role = findRoleBySpecies(member.type);
  if (!role) return;

  const cores = getCoreMembers(state);
  if (cores.length >= SQUAD_ROLE_CONFIG.CORE_SLOTS) return;
  if (cores.some((c) => c.coreRole === role.id)) return;

  member.coreRole = role.id;

  if (role.healthMult !== 1) {
    member.maxHealth = Math.max(1, Math.round(member.maxHealth * role.healthMult));
    member.health = Math.min(member.health, member.maxHealth);
  }
  if (role.damageMult !== 1) {
    // ⚠️ 必须克隆：直接改 `member.config.damage` 会改到 data/creatures.ts 的**共享配置**，
    //    全世界的剑鱼都会一起变弱（而且不可逆）。
    member.config = { ...member.config, damage: member.config.damage * role.damageMult };
  }

  member.speechBubble = { text: `${role.name} 入列！`, timer: 90, color: role.color };
};

/* ══════════════ 身体交换 ══════════════ */

/**
 * 攻击计时器属于**身体**，换身体时必须跟着一起换（FQ-05 · 计划 §6.1 末句
 * 「附身交换角色归属与技能冷却时必须明确迁移，禁止靠连续换身刷新技能」）。
 *
 * 归属划分（这条界线别改错）：
 *   · **灵魂的**：技能 / 流派 / 切换冷却 —— 挂在 `player` 这个实体上，
 *     换身体时压根不会被碰到，所以附身永远刷不掉它们（有单测钉着）。
 *   · **身体的**：撕咬冷却 + 反击前摇 / 冷却 —— 在下面的对调里。
 *
 * 对调而不是清零：清零等于白送一次先手，正是这条规则要防的事。
 * 反过来说，「谁的身体冷却长谁吃亏」也符合直觉 —— 冷却本来就长在那张嘴上。
 */
const swapAttackTimers = (a: Entity, b: Entity): void => {
  const bite = a.biteCooldown ?? 0;
  a.biteCooldown = b.biteCooldown ?? 0;
  b.biteCooldown = bite;

  const counterCd = a.counterCooldown ?? 0;
  a.counterCooldown = b.counterCooldown ?? 0;
  b.counterCooldown = counterCd;

  const windup = a.counterWindup ?? 0;
  a.counterWindup = b.counterWindup ?? 0;
  b.counterWindup = windup;
};

/**
 * 核心身份属于**身体**（G1 / FQ-06 · 计划 §6.1「核心身份绑定成员身体」），
 * 换身体时与角色冷却一起**对调**。
 *
 * 为什么要连 `roleCooldown` 一起换：只换角色不换冷却的话，连按 R 在两条身体之间来回跳
 * 就能让「刚放完技能的电鳗」变成「冷却清空的电鳗」—— 正是 §6.1 末句
 * 「禁止靠连续换身刷新技能」要堵的洞。对调之后，谁的身体在冷却里谁就得等。
 */
const swapBodyIdentity = (a: Entity, b: Entity): void => {
  const role = a.coreRole;
  a.coreRole = b.coreRole;
  b.coreRole = role;

  const cd = a.roleCooldown ?? 0;
  a.roleCooldown = b.roleCooldown ?? 0;
  b.roleCooldown = cd;
};

/**
 * 把 b 的「身体」搬到 a 上：种类 / 体型 / 血量 / 外观。
 * 灵魂层面的东西（weight / evolutionPoints / score / **level** / 技能）不动。
 *
 * ⚠️ level 明确**不算身体属性**：它由 combat 吃鱼推进（combat.ts），
 *    又用来解锁流派技能（skills.ts：Lv3 第 1 个、Lv6 第 2 个…）和门控右键主技能。
 *    如果跟着身体走，附身一条 t1 小鱼（Lv1）会把 `getSchoolSkill` 的 index 算成 -1，
 *    已解锁的 Q 技能当场消失 —— 这和「灵魂附身不该丢进度」的设计意图直接打架。
 */
const moveBody = (from: Entity, to: Entity): void => {
  to.type = from.type;
  to.config = from.config;
  to.radius = from.radius;
  to.health = from.health;
  to.maxHealth = from.maxHealth;
  to.cosmetics = from.cosmetics ?? to.cosmetics;
  to.appearanceV2 = from.appearanceV2 ? structuredClone(from.appearanceV2) : undefined;
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
  forgetTerrainPosition(player);
  forgetTerrainPosition(member);
  player.pendingRadiusGrowth = 0;
  player.pendingEvolutionType = undefined;

  if (options.revive) {
    /* 亡语：旧身体作废，灵魂进新身体，满血 + 保护帧 */
    state.entities.splice(idx, 1);
    moveBody(member, player);
    // Keep the established revive placement unless the new body would be trapped in a narrow refuge.
    if (player.radius > getPlayerRadiusCapacity(state)) {
      player.x = member.x;
      player.y = member.y;
    }
    // 亡语：旧身体作废，灵魂连同**身体的核心身份**一起接管（新身体是河豚就当河豚）
    player.coreRole = member.coreRole;
    player.roleCooldown = member.roleCooldown ?? 0;
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

  // 身体的攻击计时器也跟着对调（FQ-05：附身不能刷新冷却）
  swapAttackTimers(player, member);
  // 核心身份与角色冷却同属身体（FQ-06）：对调，不清零
  swapBodyIdentity(player, member);

  // 先把玩家当前的身体存下来（等下要给成员）
  const memberBody = {
    type: member.type,
    config: member.config,
    radius: member.radius,
    health: member.health,
    maxHealth: member.maxHealth,
    cosmetics: member.cosmetics,
    appearanceV2: member.appearanceV2,
  };

  // 成员接管玩家留下的身体，并留在玩家原来的位置。
  // 等级显式转交：这具身体刚才是玩家的，理应保留当时的等级。
  moveBody(player, member);
  member.level = player.level;
  member.x = playerPos.x;
  member.y = playerPos.y;
  member.angle = playerPos.angle;
  member.speechBubble = { text: '换我了？', timer: 60, color: '#a78bfa' };

  // 玩家接管成员的身体，落到成员原来的位置。等级不动 —— 那是灵魂的。
  player.type = memberBody.type;
  player.config = memberBody.config;
  player.radius = memberBody.radius;
  player.health = memberBody.health;
  player.maxHealth = memberBody.maxHealth;
  if (memberBody.cosmetics) player.cosmetics = memberBody.cosmetics;
  player.appearanceV2 = memberBody.appearanceV2 ? structuredClone(memberBody.appearanceV2) : undefined;
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
  // 只在正常游玩中允许切换。进化选择 / 结算 / 商场这些遮罩态下，
  // 世界是暂停的，这时候还让 R 生效会让玩家在弹窗背后偷偷换身体（还能白嫖一次位置对调）。
  if (state.status !== GameStatus.PLAYING) return false;
  if (state.squad.switchCooldown > 0) return false;

  const members = getSquadMembers(state);
  if (members.length === 0) {
    // 不静默失败（计划 §6.2）：按了没反应总得说一声为什么
    notify(state, '没有队员可附身', '#f87171');
    return false;
  }

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

/* ══════════════ 指令（G1 / FQ-05 · 计划 §6.2） ══════════════ */

/** 当前指令。没下过令 = 护卫（= FQ-05 之前的行为） */
export const getSquadCommand = (state: GameState): SquadCommandId =>
  state.squad.command ?? DEFAULT_SQUAD_COMMAND;

/**
 * 指令提示：**无法执行时必须给原因**（计划 §6.2 末句「不静默失败」）。
 * 存进 state 而不是直接画 —— 渲染层只读快照，不在渲染期算东西。
 */
const notify = (state: GameState, text: string, color: string): void => {
  state.squad.notice = { text, color, timer: SQUAD_COMMAND_CONFIG.NOTICE_FRAMES };
};

/** 当前集火目标实体（已通过 `validateFocusTarget` 的校验） */
const getFocusTarget = (state: GameState): Entity | undefined =>
  state.squad.commandTargetId
    ? state.entities.find((e) => e.id === state.squad.commandTargetId)
    : undefined;

/**
 * 集火选靶：鼠标附近、范围内**可感知**的敌人（计划 §6.2）。
 *
 * 打分规则（刻意让「鼠标圈内」绝对优先于「离玩家近」）：
 *   · 落点在 `FOCUS_CURSOR_TOLERANCE` 圈内 → 按**离鼠标**的距离排；
 *   · 圈内一个都没有 → 退回「离玩家最近的敌人」。
 * 这样既支持「精确点某条鱼」，也支持「随手按 1 打最近那个」。
 *
 * 可感知走 `concealment.canPerceive` 而不是自己写一遍隐蔽判断 ——
 * 否则集火能选中草丛里看不见的鱼，等于隔着掩体开全图。
 */
export const pickFocusTarget = (
  state: GameState,
  worldMouse?: { x: number; y: number }
): Entity | undefined => {
  const player = state.player;
  const pickRangeSq = SQUAD_COMMAND_CONFIG.FOCUS_PICK_RANGE ** 2;
  const tolerance = SQUAD_COMMAND_CONFIG.FOCUS_CURSOR_TOLERANCE;

  let best: Entity | undefined;
  let bestScore = Infinity;

  for (const e of state.entities) {
    if (e.health <= 0) continue;
    if (!canHarm(player, e)) continue; // 自己人不算敌人（阵营唯一收口）
    const d2p = dist2(player, e);
    if (d2p > pickRangeSq) continue;
    if (!canPerceive(player, e, d2p)) continue;

    let score = Math.sqrt(d2p); // 缺省：离玩家最近
    if (worldMouse) {
      const cursorD = Math.hypot(e.x - worldMouse.x, e.y - worldMouse.y);
      // 圈内按离鼠标排（乘个小系数，保证一定小于「圈外」那档）；圈外一律排到后面
      score = cursorD <= tolerance ? cursorD * 0.001 : 1e6 + Math.sqrt(d2p);
    }
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
};

/**
 * 下令。**指令是状态，不是一次性动作** —— 设完就一直挂着，直到下一条指令。
 *
 * 需要选靶的指令（集火）选不到目标时**不下令**，只给原因：
 * 否则玩家按了 1 看到「集火」高亮，队员却因为没有目标而原地不动，会以为是 bug。
 *
 * @returns 是否真的下了令
 */
export const issueCommand = (
  state: GameState,
  command: SquadCommandId,
  options: { worldMouse?: { x: number; y: number } } = {}
): boolean => {
  // 与 `requestPossess` 同一条门闸：进化选择 / 结算 / 商场 / 菜单这些遮罩态下世界是暂停的，
  // 队列根本没人消费；万一被别的路径调到这儿也一律不受理，避免在弹窗背后偷偷改指令。
  if (state.status !== GameStatus.PLAYING) {
    notify(state, '当前状态下无法下令', '#94a3b8');
    return false;
  }

  const cfg = getSquadCommandConfig(command);

  // 没有队员时任何指令都没有意义 —— 老实说而不是假装成功
  if (getSquadMembers(state).length === 0) {
    notify(state, '没有队员，无法下令', '#f87171');
    return false;
  }

  if (cfg.needsTarget) {
    const target = pickFocusTarget(state, options.worldMouse);
    if (!target) {
      notify(state, '附近没有可集火的敌人', '#f87171');
      return false;
    }
    state.squad.command = command;
    state.squad.commandTargetId = target.id;
    state.squad.targetLostTimer = 0;
    notify(state, `集火 · ${getCreatureDisplayName(target)}`, cfg.color);
    return true;
  }

  state.squad.command = command;
  state.squad.commandTargetId = undefined;
  state.squad.targetLostTimer = 0;
  notify(state, cfg.name, cfg.color);
  return true;
};

/**
 * 入队一条离散指令。**UI 的唯一入口**（键盘 / 头像点击都走这里）。
 *
 * 见 `SquadAction` 的注释：UI 事件不在游戏循环里，也没法保证只触发一次，
 * 所以这里只登记，由 `consumeSquadActions` 帧内执行一次。
 * 队列满了直接丢弃新指令 —— 连点不该变成连击。
 */
export const queueSquadAction = (state: GameState, action: SquadAction): void => {
  if (state.arena) return;
  const queue = (state.squad.pendingActions ??= []);
  if (queue.length >= SQUAD_COMMAND_CONFIG.ACTION_QUEUE_MAX) return;
  queue.push(action);
};

/**
 * 指定附身（点队员头像）。
 *
 * **绝不做兜底**：指定的成员没了就什么都不做，只给一句原因。
 * 悄悄换成「另一个成员」比失败更糟 —— 玩家以为换成功了，实际上身体换错了人，
 * 这也是计划里那条「指定成员失效时不交换错误身体」的落点。
 */
export const requestPossess = (state: GameState, memberId: string): boolean => {
  if (state.status !== GameStatus.PLAYING) return false;
  if (state.squad.switchCooldown > 0) {
    notify(state, `附身冷却中（${Math.ceil(state.squad.switchCooldown / 60)}s）`, '#94a3b8');
    return false;
  }
  const member = state.entities.find((e) => e.id === memberId && e.ownerId === 'player');
  if (!member || member.health <= 0) {
    notify(state, '该成员已阵亡或离队', '#f87171');
    return false;
  }
  const ok = possessMember(state, memberId, { revive: false });
  if (ok) state.squad.switchCooldown = SQUAD_CONFIG.SWITCH_COOLDOWN;
  return ok;
};

/**
 * 帧内消费离散指令。
 *
 * ⚠️ 先整体 `splice` 出来再执行：执行过程中若又入队（例如同一帧里玩家连按两下），
 * 新指令留到**下一帧**处理，本轮不会把同一批指令跑第二遍。
 * 「一次输入只换一次身」这条就是靠它 + 各指令自己的冷却共同保证的。
 */
const consumeSquadActions = (state: GameState): void => {
  const queue = state.squad.pendingActions;
  if (!queue || queue.length === 0) return;

  const actions = queue.splice(0, queue.length);
  for (const action of actions) {
    switch (action.kind) {
      case 'COMMAND':
        issueCommand(state, action.command, { worldMouse: action.worldMouse });
        break;
      case 'POSSESS':
        requestPossess(state, action.memberId);
        break;
      case 'POSSESS_NEXT':
        switchToNextMember(state);
        break;
    }
  }
};

/**
 * 每帧校验集火目标是否还成立 —— 计划 §6.2：
 * 「目标死亡、失去感知或超出追击范围后回护卫」。
 *
 * 「失去感知」刻意留了 `TARGET_LOST_GRACE` 宽限：目标钻进草丛一帧就整队散掉的话，
 * 这个指令等于没有。宽限内不成立才降级回护卫。
 */
const validateFocusTarget = (state: GameState): void => {
  if (getSquadCommand(state) !== 'FOCUS') return;

  const player = state.player;
  const fallback = (reason: string): void => {
    state.squad.command = DEFAULT_SQUAD_COMMAND;
    state.squad.commandTargetId = undefined;
    state.squad.targetLostTimer = 0;
    notify(state, reason, '#94a3b8');
  };

  const target = getFocusTarget(state);
  if (!target || target.health <= 0) {
    fallback('目标已消失，回到护卫');
    return;
  }
  if (!canHarm(player, target)) {
    fallback('目标已不是敌人，回到护卫');
    return;
  }
  const d2 = dist2(player, target);
  if (d2 > SQUAD_COMMAND_CONFIG.FOCUS_CHASE_RANGE ** 2) {
    fallback('目标太远，回到护卫');
    return;
  }
  if (!canPerceive(player, target, d2)) {
    const lost = (state.squad.targetLostTimer ?? 0) + 1;
    state.squad.targetLostTimer = lost;
    if (lost > SQUAD_COMMAND_CONFIG.TARGET_LOST_GRACE) fallback('跟丢了目标，回到护卫');
    return;
  }
  state.squad.targetLostTimer = 0;
};

/** HUD 用：下一次按 R 会附身到谁（不推进游标）。死亡 / 离队的成员本来就不在名单里 */
export const peekNextSwitchTarget = (state: GameState): Entity | null => {
  const members = getSquadMembers(state);
  if (members.length === 0) return null;
  return members[Math.min(switchCursor, members.length - 1)] ?? null;
};

/* ══════════════ 核心角色（G1 / FQ-06 · 计划 §6.1） ══════════════ */

/**
 * 找 `around` 周围最近的威胁。
 *
 * 「威胁」的定义刻意用 `canHarm(around, e)` —— 阵营唯一判定（FQ-03）：
 * 能打到 `around` 的才叫威胁，自己人永远不算。
 */
const nearestThreat = (
  state: GameState,
  around: Entity,
  rangePx: number,
  viewer: Entity
): Entity | undefined => {
  let best: Entity | undefined;
  let bestD = rangePx;
  for (const e of state.entities) {
    if (e.health <= 0) continue;
    if (e === around || e === viewer) continue;
    if (!canHarm(around, e)) continue;
    const d = dist(around, e);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
};

/**
 * 河豚该保护谁：**受威胁**的玩家或其它核心成员里离自己最近的那个（计划 §6.1
 * 「护卫时靠近受威胁的玩家或核心成员」）。普通成员不在这份名单里 —— 核心位只有 3 个，
 * 全队十个人都想要盾的话，护卫就变成了永远追不上需求的救火队。
 */
const findProtectee = (
  state: GameState,
  guard: Entity
): { ally: Entity; threat: Entity } | undefined => {
  const candidates: Entity[] = [state.player, ...getCoreMembers(state).filter((m) => m !== guard)];

  let best: { ally: Entity; threat: Entity } | undefined;
  let bestD = Infinity;
  for (const ally of candidates) {
    const threat = nearestThreat(state, ally, SQUAD_ROLE_CONFIG.GUARD_THREAT_RANGE, guard);
    if (!threat) continue;
    const d = dist(guard, ally);
    if (d < bestD) {
      bestD = d;
      best = { ally, threat };
    }
  }
  return best;
};

/** 河豚护卫：贴上去给盾。没贴到就什么都不做 —— 移动段会负责靠拢 */
const tryGuardAbility = (state: GameState, guard: Entity): void => {
  const found = findProtectee(state, guard);
  if (!found) return;
  if (dist(guard, found.ally) > SQUAD_ROLE_CONFIG.GUARD_PROTECT_RANGE) return;

  const cfg = SQUAD_ROLES.GUARD;
  found.ally.shieldTimer = Math.max(
    found.ally.shieldTimer ?? 0,
    SQUAD_ROLE_CONFIG.GUARD_SHIELD_FRAMES
  );
  guard.roleCooldown = SQUAD_ROLE_CONFIG.GUARD_COOLDOWN;
  state.labels.push({
    x: found.ally.x,
    y: found.ally.y - 45,
    text: '河豚护盾！',
    color: cfg.color,
    timer: 45,
  });
};

/**
 * 电鳗控制：优先控**集火目标**，没有集火就控贴近队伍的威胁（计划 §6.1）。
 *
 * 用 `speedBoostTimer = -N`（负值 = 减速 / 麻痹，与 PRESSURE_BIND 同一机制）——
 * 不引入新的状态字段，AI 与 HUD 现有读数天然认识它。
 * 持续只有 1.5 秒：这是**短控制**，与「三条控制鱼把塘主无限控死」划清界限
 * （塘主的控制抗性属 G4 / FQ-13，本轮不碰）。
 */
const tryControlAbility = (state: GameState, eel: Entity, focus?: Entity): void => {
  let target: Entity | undefined;
  if (focus && focus.health > 0 && dist(eel, focus) <= SQUAD_ROLE_CONFIG.CONTROL_RANGE) {
    target = focus;
  }
  if (!target) target = nearestThreat(state, state.player, SQUAD_ROLE_CONFIG.CONTROL_THREAT_RANGE, eel);
  if (!target) return;

  const cfg = SQUAD_ROLES.CONTROL;
  target.speedBoostTimer = -SQUAD_ROLE_CONFIG.CONTROL_SLOW_FRAMES;
  eel.roleCooldown = SQUAD_ROLE_CONFIG.CONTROL_COOLDOWN;
  state.labels.push({
    x: target.x,
    y: target.y - 45,
    text: '电麻！',
    color: cfg.color,
    timer: 45,
  });
};

/**
 * 每帧跑一遍核心能力。**只有核心成员进入这个循环** —— 普通鱼的 `coreRole`
 * 恒为 undefined，根本不会被 `getCoreMembers` 捞出来（计划 §6.1 首版）。
 *
 * 冷却在**能力之外**统一递减：还在冷却里的角色这一帧直接跳过，
 * 于是「控制有冷却」不是一句注释而是可测的行为。
 */
const runCoreAbilities = (state: GameState): void => {
  const focus = getSquadCommand(state) === SQUAD_COMMAND.FOCUS ? getFocusTarget(state) : undefined;

  for (const m of getCoreMembers(state)) {
    if (m.roleCooldown && m.roleCooldown > 0) {
      m.roleCooldown -= 1;
      continue;
    }
    if (m.coreRole === SQUAD_ROLE.GUARD) tryGuardAbility(state, m);
    else if (m.coreRole === SQUAD_ROLE.CONTROL) tryControlAbility(state, m, focus);
    // 机动鱼没有主动能力：它的价值全在移动上（快速接近 / 脱离包围）
  }
};

/**
 * 角色对移动的影响 —— **只有核心成员有**，普通成员永远走缺省队形。
 *
 * · 河豚护卫：有人受威胁就贴到那个人身上（「靠近受威胁的自己人」）
 * · 机动鱼 + 撤退：站到**背对敌群质心**的那一侧（「优先脱离包围」）
 */
const pickRoleMoveTarget = (
  state: GameState,
  member: Entity,
  command: SquadCommandId
): { x: number; y: number; stopAt: number } | undefined => {
  const p = state.player;

  if (member.coreRole === SQUAD_ROLE.GUARD) {
    const found = findProtectee(state, member);
    if (found) {
      return {
        x: found.ally.x,
        y: found.ally.y,
        stopAt: member.radius + found.ally.radius + 30,
      };
    }
    return undefined;
  }

  if (member.coreRole === SQUAD_ROLE.SCOUT && command === SQUAD_COMMAND.RETREAT) {
    // 敌群质心（只数玩家周围的威胁）：没有敌人就退回常规队形
    let cx = 0;
    let cy = 0;
    let n = 0;
    const rangeSq = SQUAD_COMMAND_CONFIG.GUARD_CHASE_RANGE ** 2;
    for (const e of state.entities) {
      if (e.health <= 0) continue;
      if (!canHarm(p, e)) continue;
      if (dist2(p, e) > rangeSq) continue;
      cx += e.x;
      cy += e.y;
      n += 1;
    }
    if (n === 0) return undefined;

    const away = Math.atan2(p.y - cy / n, p.x - cx / n);
    const desired = p.radius + member.radius + SQUAD_COMMAND_CONFIG.RETREAT_RALLY_GAP;
    return {
      x: p.x + Math.cos(away) * (desired + SQUAD_ROLE_CONFIG.SCOUT_BREAKOUT_OFFSET),
      y: p.y + Math.sin(away) * (desired + SQUAD_ROLE_CONFIG.SCOUT_BREAKOUT_OFFSET),
      stopAt: SQUAD_COMMAND_CONFIG.RETREAT_DEADZONE,
    };
  }

  return undefined;
};

/* ══════════════ 跟随 ══════════════ */

/**
 * 护卫脱队打猎的门槛：找**玩家附近**可感知、能打的敌人（离队员最近的那个）。
 *
 * 「不为远处猎物脱队」这条就落在 `GUARD_CHASE_RANGE` 一个数上 ——
 * 判据必须是**离玩家**的距离而不是离队员自己的，否则一个跑远的队员会为了
 * 脚边的猎物一路越追越远，最后整队被拽走。
 */
const findGuardPrey = (state: GameState, member: Entity): Entity | undefined => {
  const player = state.player;
  const rangeSq = SQUAD_COMMAND_CONFIG.GUARD_CHASE_RANGE ** 2;

  let best: Entity | undefined;
  let bestDist = Infinity;

  for (const e of state.entities) {
    if (e.health <= 0) continue;
    if (!canHarm(member, e)) continue;
    const d2p = dist2(player, e);
    if (d2p > rangeSq) continue;
    if (!canPerceive(member, e, d2p)) continue;
    const d = dist(member, e);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
};

/**
 * 算出一个成员这一帧该去哪、以及「离目标点多近就停」。
 *
 * 三种指令的差别全部收在这一个函数里：
 *   · GUARD   —— 默认围绕玩家排环形队列；玩家近处有敌人就脱队扑上去（有限距离）。
 *   · FOCUS   —— 直奔集火目标，压进它的碰撞圈（否则贴不到、咬不着）。
 *   · RETREAT —— 队形收紧 + 死区更小 + **完全无视敌人**：这就是「停止主动追击」。
 *
 * 环形队形那段数学与 FQ-05 之前逐字一致（`FORMATION_ANGLE_STEP` / `FOLLOW_GAP` /
 * `FOLLOW_DEADZONE`），因为 GUARD 就是缺省指令 —— 新默认值必须等于旧硬编码。
 */
const pickMoveTarget = (
  state: GameState,
  member: Entity,
  index: number,
  command: SquadCommandId
): { x: number; y: number; stopAt: number } => {
  const p = state.player;

  if (command === SQUAD_COMMAND.FOCUS) {
    const target = getFocusTarget(state);
    if (target) {
      return {
        x: target.x,
        y: target.y,
        stopAt: (member.radius + target.radius) * SQUAD_COMMAND_CONFIG.FOCUS_CONTACT_MULT,
      };
    }
    // 目标刚失效、还没走到校验那一帧：按护卫站，别往原点飞
  }

  if (command === SQUAD_COMMAND.GUARD) {
    const prey = findGuardPrey(state, member);
    if (prey) {
      return {
        x: prey.x,
        y: prey.y,
        stopAt: (member.radius + prey.radius) * SQUAD_COMMAND_CONFIG.FOCUS_CONTACT_MULT,
      };
    }
  }

  // 队形角：按序号均匀铺开，整体缓慢自转，看起来像护卫阵
  const formation =
    (index * SQUAD_CONFIG.FORMATION_ANGLE_STEP * Math.PI) / 180 + state.time * 0.01;
  const retreat = command === SQUAD_COMMAND.RETREAT;
  const gap = retreat ? SQUAD_COMMAND_CONFIG.RETREAT_RALLY_GAP : SQUAD_CONFIG.FOLLOW_GAP;
  const desired = p.radius + member.radius + gap;

  return {
    x: p.x + Math.cos(formation) * desired,
    y: p.y + Math.sin(formation) * desired,
    stopAt: retreat ? SQUAD_COMMAND_CONFIG.RETREAT_DEADZONE : SQUAD_CONFIG.FOLLOW_DEADZONE,
  };
};

/**
 * 推进成员位置。落后超过死区才追（否则每帧微调会抖），到位后速度衰减停下来。
 */
const updateMovement = (state: GameState): void => {
  const members = getSquadMembers(state);
  if (members.length === 0) return;

  const command = getSquadCommand(state);

  for (let i = 0; i < members.length; i += 1) {
    const m = members[i];
    rememberTerrainPosition(m, state.time);
    m.accelerationMult = 1;
    // 角色优先于指令队形（FQ-06）：河豚贴人、机动鱼撤退时绕到背敌侧
    const goal = pickRoleMoveTarget(state, m, command) ?? pickMoveTarget(state, m, i, command);

    const dx = goal.x - m.x;
    const dy = goal.y - m.y;
    const d = Math.hypot(dx, dy);

    if (d > goal.stopAt) {
      const aim = state.obstacles.some(o => o.reef) ? reefNavigationPoint(m, goal, state) : goal;
      const heading = Math.atan2(aim.y - m.y, aim.x - m.x);
      m.angle = turnToward(m.angle, heading, 0.15);
      // 比常规速度快一点，否则追不上开了加速的玩家
      const role = getSquadRoleConfig(m.coreRole);
      const rush =
        m.coreRole === SQUAD_ROLE.SCOUT && command === SQUAD_COMMAND.FOCUS
          ? SQUAD_ROLE_CONFIG.SCOUT_FOCUS_SPEED_MULT
          : 1;
      // 角色速度倍率每帧从配置读：河豚 0.85（不擅长追击）、机动鱼 1.1（快速接近）
      const sp = m.speed * 1.25 * (role?.speedMult ?? 1) * rush;
      m.accelerationMult = 1.25 * rush;
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

  // 顺序有讲究：
  //   ① 先消费指令 —— 玩家这一帧按下的键当帧就生效（不然会有 1 帧的「没反应」）
  //   ② 再落地新成员（指令数队员时看到的才和后面移动的是同一批人）
  //   ③ 校验集火目标（判定死亡 / 丢失 / 追不上 → 降级回护卫）
  //   ④ 核心角色能力（FQ-06：只有挂了 coreRole 的队员才进这个循环）
  //   ⑤ 最后才按指令 + 角色推位置
  consumeSquadActions(state);
  flushRecruits(state);
  validateFocusTarget(state);
  runCoreAbilities(state);
  updateMovement(state);

  // 指令提示倒计时（HUD 直接渲染这个快照，不在渲染期算）
  const notice = state.squad.notice;
  if (notice && notice.timer > 0) {
    notice.timer -= 1;
    if (notice.timer <= 0) state.squad.notice = null;
  }
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
