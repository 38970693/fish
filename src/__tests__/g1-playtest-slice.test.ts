/**
 * G1 放行条件台架：约 3 分钟切片里，**操作与队伍选择能改变结果**。
 *
 * 为什么是台架而不是「手动玩三分钟」：放行条件是条**可回归的判据**，不是一次性的印象。
 * 写死成脚本后，每次动战斗 / 队伍数值都能重跑同一段切片，看这条结论还成立不成立。
 *
 * 它做什么：同一个种子、同一份世界、同一支队伍，用**同一套操作大脑**跑 3 分钟（10800 帧 @60fps），
 * 只切换「用不用队伍功能」这一个变量：
 *
 *   A 只顾自己  —— 会吃会逃，但从不下令、从不附身（基线）
 *   B + 指令    —— 每 1 秒下一次集火 / 残血撤退
 *   C + 指令 + 附身（完整操作）
 *   D 完整操作，但队伍**一个核心角色都没有**（对照：隔离出「队伍选择」的贡献）
 *
 * ⚠️ 四条纪律（前两条是 FQ-06 刚踩过的坑）
 *   1. **整段模拟都要在 `withSeededRandom` 里跑**。`createSeededScenario` 只管造世界，
 *      跑起来之后刷怪还在吃 `Math.random`，不包住的话两次运行的数字不可比 —— 阈值就在赌运气。
 *   2. 用 `makeSeededRandom` 的**序列**（每帧都变），不是 `mockReturnValue(0)` 那种常数 ——
 *      常数会让 `uuid()` 给全场同一个 id（守护项 14）。
 *   3. 队伍用**真实收编路径**预置（`recruitToSquad`，俘虏先置死），不走 `ownerId` 硬塞 ——
 *      否则 `assignCoreRole` 不会触发，C 组就变成「有队员但没人有角色」，实验直接失效。
 *   4. 对照组 D 每帧抹掉 `coreRole`，但**弱点已经随收编落到身体上了**（血 / 伤害）。
 *      所以 C − D **恰好等于「角色能力包」的净贡献**（弱点两边一样，自动抵消）—— 刻意设计，不是疏漏。
 *
 * 运行：`npm run test:slice`（单独配置，不进默认套件，8 组 × 8 种子约 14 分钟）
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { withSeededRandom } from '../test/scenario';
import { updateGame } from '../gameEngine';
import { applyEvolutionChoice } from '../systems/progression';
import {
  issueCommand,
  requestPossess,
  getSquadMembers,
  recruitToSquad,
  __resetSwitchCursor,
} from '../systems/squad';
import { __resetTeleportLock, __resetObstacleIndex } from '../systems/world';
import { SQUAD_ROLE, SQUAD_ROLES, SQUAD_ROLE_LIST } from '../data/squadRoles';
import { canHarm } from '../systems/factions';
import { createEntity } from '../systems/spawn';
import { MAP_SHAPE_CONFIG } from '../data/world';
import { CreatureType } from '../data/creatures';
import { GameStatus } from '../types';
import type { GameState, Entity } from '../types';

/** 3 分钟 @60fps —— 与放行条件同口径，别悄悄缩短 */
const SLICE_FRAMES = 10800;

/**
 * 多个种子，取**聚合值**下结论。
 *
 * ⚠️ 单个种子不能用来判放行：单局里「第 40 秒撞上一条大鱼」这种事完全由随机流决定，
 *    实测同一份代码换种子，存活帧能在 2693 ~ 9551 之间跳 —— 拿其中一个数当结论，
 *    就是在赌运气（正是 FQ-06 反复强调的假绿）。所以这里跑 SEEDS.length 局，
 *    断言只打在**均值 / 中位数**上。
 */
const SEEDS = [
  20260916, 20260917, 20260918, 20260919, 20260920, 20260921, 20260922, 20260923,
];

/** 屏幕尺寸：鼠标是相对屏幕中心解算方向的（playerControl），与真实窗口一致 */
const SCREEN_W = 1280;
const SCREEN_H = 720;

/** 逃跑触发距离 / 下令间隔 / 附身与撤退的血线 */
/**
 * 逃跑触发距离 —— 注意它是**加在双方半径之上**的余量，不是绝对距离
 * （见 think() 里的说明：深海巨怪 radius 120，固定值会把反应余量压到 50px）
 */
const DANGER_RANGE = 190;
const COMMAND_INTERVAL = 60;
/** 集火射程：猎物比这更远就别让队伍追过去（见 runSlice 里的说明） */
const FOCUS_MAX_RANGE = 500;
const POSSESS_HP_RATIO = 0.35;
const RETREAT_HP_RATIO = 0.5;
/**
 * 「脱队」判定距离：队员死时离玩家超过它，就算脱队后被吃。
 * 取 400（`FOLLOW_DEADZONE` 是 260）—— 死区之外再翻一倍，已经不是队形抖动而是真的掉队了。
 */
const DETACHED_DIST = 400;

/**
 * 预置队伍：三个角色位 + 两个普通成员。
 * 「队伍选择能改变结果」这句话只有在**有队伍**时才问得出来 —— 让四组从同一支队伍出发。
 */
const SEED_SQUAD: CreatureType[] = [
  CreatureType.PUFFER_FISH,
  CreatureType.ELECTRIC_EEL,
  CreatureType.SWORD_FISH,
  CreatureType.CLOWN_FISH,
  CreatureType.SQUID,
];

interface ArmConfig {
  name: string;
  commands: boolean;
  possess: boolean;
  stripRoles: boolean;
  /**
   * **会不会「用」角色**（而不是仅仅「带着」角色）。
   *
   * 台架大脑 v2 判不了队伍选择，根子在这里：它只会集火/撤退，
   * 不会配合角色打 —— 而核心角色的价值恰恰要靠配合才兑现。
   * v3 补上两件真人会做的事（**先写死后跑分**，不看着结果调）：
   *   ① **打控制链**：电鳗麻痹住的敌人（`speedBoostTimer < 0`）是活靶子，
   *      转火它、玩家也扑上去 —— 这是「控制」这个能力唯一的兑现方式。
   *   ② **残血优先附身护卫**：河豚有盾且最耐揍，逃生时换它的身体比随便换一条划算。
   */
  roleAware: boolean;
  /**
   * **弱点缓和系数**（0~1，1 = 把弱点完全抹平）。
   *
   * 用途：测「如果把 FQ-06 的弱点数值放松一点，队伍选择的存活维度会不会转正」。
   * 这是**调优实验**，不是改数值 —— 默认值 0，跑完不留下任何改动。
   */
  weaknessRelief?: number;
  /**
   * **不预置队伍**（真·开局：光杆一条鱼）。
   *
   * 其余八组都开局就送一支 5 人队伍（为了让 C / D 的对比有东西可比），
   * 但这也让台架**比真人强得多** —— 实测有整整一半的局是「50 秒内击杀 BOSS 通关」，
   * 而真人开局是一条鱼、得先自己收编。所以这里补一组从零开始的，
   * 目的不是对比角色，而是回答一个真人切片必须先知道的问题：
   * **3 分钟够不够「从光杆打到有队伍」？**
   */
  noSeedSquad?: boolean;
}

/**
 * 一次死亡的记录。
 *
 * 台架只能说「活不过三分钟」，说不出**为什么** —— 而这个「为什么」才是
 * 真人切片最该带着去看的东西（不然三分钟玩完只得到一句「好像挺难的」）。
 */
interface DeathInfo {
  frame: number;
  killerType?: string;
  killerTier?: number;
  playerTier: number;
  playerLevel: number;
  squadAlive: number;
  /** 死的时候新手保护还在不在（PROTECTION）—— 在还被打死说明保护没生效 */
  protectedNow: boolean;
}

/**
 * **这一局是怎么结束的** —— 没有它，「活满三分钟 0/8」是个会误导人的数字。
 *
 * ⚠️ `combat.ts checkVictory`：**玩家阵营击杀 BOSS 即通关**（虎鲸 / 美人鱼 / 深海巨怪）。
 *    也就是说「没跑满 10800 帧」有两种完全不同的含义 —— **被打死了** 和 **提前通关了**。
 *    把它们合并成一个「活满三分钟 0/8」报出去，会让真人切片带着「这游戏太难」的预设进场，
 *    而真相可能恰恰相反。所以逐局记下结束原因再统计。
 */
type EndReason =
  | 'SURVIVED' // 真跑满 10800 帧
  | 'GAME_OVER' // 队伍拼光，无人可夺舍
  | 'VICTORY' // 击杀 BOSS，提前通关
  | 'EVOLVE_STUCK'; // 进了进化面板却没有候选（台架卡死，属于 bug 不是难度）

/**
 * **一个队员是怎么没的** —— 「队伍留不住」是本轮最该下手的现象，
 * 但「少了个人」本身说不出原因，得逐次记下来才能分叉。
 *
 * 三种成因的**对策完全不同**，混在一起就白测了：
 *   · **阵亡（被同级/更小）** → 数值 / 战斗手感问题（FQ-04）
 *   · **阵亡（被大鱼顺手吃掉）** → 信息层级问题（看不看得见危险，FQ-09）
 *   · **脱队后被吃**（死时离玩家很远）→ 队形 / 跟随问题（FQ-05）
 */
interface MemberDeathInfo {
  frame: number;
  type: string;
  tier: number;
  killerType?: string;
  killerTier?: number;
  /** 死时离玩家多远 —— 判「脱队」用它 */
  distToPlayer: number;
  /** 死时队伍还剩几个人 */
  squadAlive: number;
}

interface SliceResult {
  endReason: EndReason;
  framesSurvived: number;
  weight: number;
  level: number;
  squadSize: number;
  coreSize: number;
  /** 开局那一帧的队伍规模 —— 「预置成功了吗」要在这里看，跑完三分钟队员早换过几轮了 */
  squadSizeAtStart: number;
  coreSizeAtStart: number;
  /**
   * **这一局一共收编过多少人**（`state.squad.recruitedTotal`）。
   *
   * 「终局队伍规模 0」有两种完全相反的成因，光看终局数分不出来：
   *   ① **从来就没收到人**（开局吃的是浮游生物，`RECRUIT_MIN_TIER=1` 不收编 → 节奏问题）
   *   ② 收到过、但后来全打光了（→ 生存问题）
   * 这是给真人切片带路的关键分叉，必须记。
   */
  recruitedTotal: number;
  /** 队伍规模的**峰值** —— 同上，「曾经有过几个人」比「最后剩几个」更能说明收编顺不顺 */
  squadSizePeak: number;
  /** 每一个队员的消失记录（含凶手与死时位置） */
  memberDeaths: MemberDeathInfo[];
  eaten: number;
  evolutions: number;
  possessions: number;
  commandsIssued: number;
  deaths: DeathInfo[];
}

/**
 * 找**被麻痹**的敌人（`speedBoostTimer < 0` = 减速，FQ-06 电鳗控制的写法）。
 * 这是「控制」兑现成收益的唯一入口：控住不上去打，控制就只是个特效。
 */
const findControlled = (state: GameState): Entity | undefined => {
  const p = state.player;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of state.entities) {
    if (e.health <= 0) continue;
    if ((e.speedBoostTimer ?? 0) >= 0) continue;
    if (!canHarm(p, e)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
};

/** 找最近的威胁与猎物。威胁 = 能打到玩家且更大；猎物 = 玩家能打且更小 */
const scan = (
  state: GameState
): { threat?: Entity; threatD: number; prey?: Entity; preyD: number } => {
  const p = state.player;
  let threat: Entity | undefined;
  let prey: Entity | undefined;
  let threatD = Infinity;
  let preyD = Infinity;

  for (const e of state.entities) {
    if (e.health <= 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    // 阵营收口用 canHarm：自己人永远不算威胁（FQ-03）
    if (d < threatD && canHarm(e, p) && e.radius > p.radius * 1.05) {
      threat = e;
      threatD = d;
    }
    if (d < preyD && canHarm(p, e) && e.radius < p.radius * 0.95) {
      prey = e;
      preyD = d;
    }
  }
  return { threat, threatD, prey, preyD };
};

/**
 * 一个「会玩」的操作大脑：躲大的、追小的。各组共用，保证只差队伍功能。
 *
 * `prefer` = 优先扑上去的目标（被麻痹住的敌人）：控住了不去打，控制就白给了。
 */
const think = (
  state: GameState,
  prefer?: Entity
): { mouse: { x: number; y: number }; boost: boolean } => {
  const p = state.player;
  const { threat, threatD, prey } = scan(state);

  let dx: number;
  let dy: number;
  let boost = false;

  // ⚠️ 逃跑距离要**按体型缩放**，不能用固定值：深海巨怪 radius 120，接触距离就有 ~140px，
  //    固定 190px 只留 50px 反应余量 —— 那是台架笨，不是游戏难。真人是看见大鱼就远远绕开。
  const fleeRange = threat ? threat.radius + p.radius + DANGER_RANGE : DANGER_RANGE;
  if (threat && threatD < fleeRange) {
    // 掉头就跑，并开加速
    dx = p.x - threat.x;
    dy = p.y - threat.y;
    boost = true;
  } else if (prefer) {
    // 被麻痹住的活靶子优先 —— 这是「控制」兑现成收益的地方
    dx = prefer.x - p.x;
    dy = prefer.y - p.y;
  } else if (prey) {
    dx = prey.x - p.x;
    dy = prey.y - p.y;
  } else {
    // 没猎物就往塘中心巡游，别贴边
    dx = MAP_SHAPE_CONFIG.CENTER_X - p.x;
    dy = MAP_SHAPE_CONFIG.CENTER_Y - p.y;
  }

  const len = Math.hypot(dx, dy) || 1;
  return {
    mouse: { x: SCREEN_W / 2 + (dx / len) * 100, y: SCREEN_H / 2 + (dy / len) * 100 },
    boost,
  };
};

/** 用**真实收编路径**预置队伍：俘虏先死，再 recruitToSquad，与 combat.ts 的顺序一致 */
const seedSquad = (state: GameState): void => {
  const p = state.player;
  for (let i = 0; i < SEED_SQUAD.length; i += 1) {
    const victim = createEntity(SEED_SQUAD[i], p.x + 40 + i * 12, p.y + 40);
    victim.semiGhostTimer = 0;
    state.entities.push(victim);
    recruitToSquad(state, victim);
    victim.health = 0;
  }
  // 落地成实体（并触发 assignCoreRole）
  updateGame(state, { x: SCREEN_W / 2, y: SCREEN_H / 2 }, false, false, false, SCREEN_W, SCREEN_H);
};

/**
 * 读状态必须走函数：`state.status = GameStatus.PLAYING` 之后 TS 会把 `state.status`
 * 收窄成字面量 `PLAYING`，循环里再和 `EVOLVING` 比就被判「永不成立」（TS2367）。
 * 而 `updateGame` 每帧都会改它 —— 收窄是错的。用函数取值即可绕开。
 */
const statusOf = (s: GameState): GameStatus => s.status;

/**
 * **每局之间必须隔离 localStorage** —— 这是「同种子两遍跑出不同结果」的真凶。
 *
 * `systems/items.ts` 会在局中把 `skillLevel` 写回本地存储，而 `createInitialState`
 * 开局又 `loadSkillLevel()` 读它。于是第一局升到几级，第二局就带着那个等级开跑 ——
 * 同一个种子、两份完全不同的结果（实测存活帧 2693 vs 4061）。
 * 这是**生产行为**（存档就该持久化），不是 bug；但台架连跑多局就必须自己清场。
 */
/**
 * 模块级可变状态也必须在每局之间复位。
 *
 * `world.ts` 的 `teleportLockUntilFrame` 会跨局泄漏：上一局把锁设到 `time + 120`，
 * 下一局 `state.time` 从 0 开始就被锁住，传送门表现完全不同 ——
 * 这正是仓库里 `__resetTeleportLock` / `__resetObstacleIndex` 存在的原因（同 `__resetSwitchCursor`）。
 */
const resetModuleState = (): void => {
  __resetTeleportLock();
  __resetObstacleIndex();
  __resetSwitchCursor();
};

const withCleanStorage = <T>(fn: () => T): T => {
  const backup: Array<[string, string]> = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k !== null) backup.push([k, localStorage.getItem(k) ?? '']);
  }
  localStorage.clear();
  try {
    return fn();
  } finally {
    localStorage.clear();
    for (const [k, v] of backup) localStorage.setItem(k, v);
  }
};

/**
 * 临时把角色弱点往 1 拉（`relief` 越大越接近「没有弱点」），跑完**必定还原**。
 *
 * 只动 `SQUAD_ROLES` 里那几个倍率（`SQUAD_ROLE_LIST` 引用的就是同一批对象），
 * 不改任何文件 —— 这是调优探针，结论出来后由人决定要不要真的改数值。
 */
const withWeaknessRelief = <T>(relief: number, fn: () => T): T => {
  if (relief <= 0) return fn();
  const backup = SQUAD_ROLE_LIST.map((r) => ({
    r,
    speed: r.speedMult,
    health: r.healthMult,
    damage: r.damageMult,
  }));
  const ease = (m: number): number => 1 - (1 - m) * (1 - relief);
  for (const r of SQUAD_ROLE_LIST) {
    r.speedMult = ease(r.speedMult);
    r.healthMult = ease(r.healthMult);
    r.damageMult = ease(r.damageMult);
  }
  try {
    return fn();
  } finally {
    for (const b of backup) {
      b.r.speedMult = b.speed;
      b.r.healthMult = b.health;
      b.r.damageMult = b.damage;
    }
  }
};

const runSlice = (arm: ArmConfig, seed: number): SliceResult =>
  withWeaknessRelief(arm.weaknessRelief ?? 0, () =>
  withCleanStorage(() =>
    withSeededRandom(seed, () => {
    resetModuleState();
    const state = createInitialState({});
    state.status = GameStatus.PLAYING;
    if (!arm.noSeedSquad) seedSquad(state);
    const seededMembers = getSquadMembers(state);
    const squadSizeAtStart = seededMembers.length;
    // 对照组的「抹角色」必须在**取快照之前**做一次：预置是走真实收编路径的，
    // 角色已经分配好了，等进循环再抹的话开局快照里还带着 3 个核心位
    if (arm.stripRoles) for (const m of seededMembers) m.coreRole = undefined;
    const coreSizeAtStart = getSquadMembers(state).filter((m) => !!m.coreRole).length;

    let evolutions = 0;
    let commandsIssued = 0;
    let framesSurvived = 0;
    let endReason: EndReason = 'SURVIVED';
    let squadSizePeak = getSquadMembers(state).length;
    const deaths: DeathInfo[] = [];
    const memberDeaths: MemberDeathInfo[] = [];

    for (let f = 0; f < SLICE_FRAMES; f += 1) {
      // 进化面板：替玩家选第一个候选（走生产同一条 applyEvolutionChoice，不复制数值）
      if (statusOf(state) === GameStatus.EVOLVING) {
        const opt = state.evolveOptions?.[0];
        if (!opt) {
          endReason = 'EVOLVE_STUCK';
          break;
        }
        applyEvolutionChoice(state, opt);
        evolutions += 1;
        continue;
      }
      if (statusOf(state) === GameStatus.GAME_OVER) {
        endReason = 'GAME_OVER';
        break;
      }
      // ⚠️ 通关**不是**「没活满」：击杀 BOSS 就结束，是本局的胜利条件，
      //    混进「活不过三分钟」里统计会把难度结论带反
      if (statusOf(state) === GameStatus.VICTORY) {
        endReason = 'VICTORY';
        break;
      }
      // 商场 / 菜单这类遮罩态世界是暂停的，别让台架卡死
      if (statusOf(state) !== GameStatus.PLAYING) state.status = GameStatus.PLAYING;

      const p = state.player;
      const members = getSquadMembers(state);
      const hpRatio = p.maxHealth > 0 ? p.health / p.maxHealth : 1;

      // ① 打控制链：有人被麻痹住就是活靶子，转火它（「控制」兑现成收益的唯一方式）
      const controlled = arm.roleAware ? findControlled(state) : undefined;

      if (arm.commands && members.length > 0 && f % COMMAND_INTERVAL === 0) {
        if (controlled) {
          if (issueCommand(state, 'FOCUS', { worldMouse: { x: controlled.x, y: controlled.y } })) {
            commandsIssued += 1;
          }
        } else {
        const { threat, threatD, prey, preyD } = scan(state);
        // 身边有大家伙就先撤 —— 只看血量太迟钝，真人看见大鱼就收队了
        if (hpRatio < RETREAT_HP_RATIO || (threat && threatD < FOCUS_MAX_RANGE * 0.5)) {
          if (issueCommand(state, 'RETREAT')) commandsIssued += 1;
        } else if (prey && preyD < FOCUS_MAX_RANGE) {
          // ⚠️ 两条纪律，都是踩出来的：
          //   ① 必须**带落点**下令。不带落点时 `pickFocusTarget` 选「离玩家最近的敌人」，
          //      那往往是一条**更大**的鱼 —— 照着下令 = 让全队排队送死。
          //   ② 落点必须在**射程内**。`scan` 找的猎物可能远在天边，
          //      让全队追到两千像素外 = 队伍解散 + 路上团灭。真人不会这么点。
          if (issueCommand(state, 'FOCUS', { worldMouse: { x: prey.x, y: prey.y } })) {
            commandsIssued += 1;
          }
        } else if (issueCommand(state, 'GUARD')) {
          commandsIssued += 1;
        }
        }
      }

      if (arm.possess && hpRatio < POSSESS_HP_RATIO && members.length > 0 && f % 30 === 0) {
        // 换身体是**拿体型换命**：只接受「不会缩水太多」的成员，
        // 否则为了活命换成一条小鱼，结果是谁都吃不了，反而更早出局。
        let best: Entity | undefined;
        for (const m of members) {
          if (m.radius < p.radius * 0.8) continue;
          // ② 残血优先换**护卫**：河豚有盾、最耐揍，逃生时它的身体最值钱
          if (arm.roleAware && m.coreRole === SQUAD_ROLE.GUARD) {
            best = m;
            break;
          }
          if (!best || m.health > best.health) best = m;
        }
        if (best && best.health > p.health) requestPossess(state, best.id);
      }

      if (arm.stripRoles) {
        // 对照组：能力 / 角色移动 / 速度倍率全抹掉，但弱点（血 / 伤害）留在身上
        for (const m of members) m.coreRole = undefined;
      }

      squadSizePeak = Math.max(squadSizePeak, members.length);

      const hpBefore = p.health;
      const protectedNow = (p.invulnerableTimer ?? 0) > 0;
      const squadAliveBefore = members.length;
      const tierBefore = p.config.tier;
      const levelBefore = p.level;
      const possessBefore = state.squad.possessCount;

      // 记下这一帧的队员（对象引用），下一帧比对谁不见了
      const trackedMembers = members.map((m) => ({ id: m.id, ref: m }));

      const { mouse, boost } = think(state, controlled);
      updateGame(state, mouse, boost, false, false, SCREEN_W, SCREEN_H);
      framesSurvived = f + 1;

      // 队员少了谁？—— 夺舍（亡语接管）不算损失，它是玩家换了个身体继续活
      const possessNow = state.squad.possessCount > possessBefore;
      if (!possessNow) {
        const aliveIds = new Set(
          getSquadMembers(state).filter((m) => m.health > 0).map((m) => m.id)
        );
        for (const t of trackedMembers) {
          if (aliveIds.has(t.id)) continue;
          const killer = state.entities.find((e) => e.id === t.ref.lastHitById);
          memberDeaths.push({
            frame: f,
            type: t.ref.config.name,
            tier: t.ref.config.tier,
            killerType: killer?.config.name,
            killerTier: killer?.config.tier,
            distToPlayer: Math.round(Math.hypot(t.ref.x - p.x, t.ref.y - p.y)),
            squadAlive: aliveIds.size,
          });
        }
      }

      // 死亡判定：血见底，或亡语夺舍把人换走了（后者的血已经是新身体的，看不出死过）
      const died =
        (hpBefore > 0 && state.player.health <= 0) ||
        state.squad.possessCount > possessBefore;
      if (died) {
        // `lastHitById` 由 dealDamage 写在**玩家这个实体**上；夺舍只换 type/config/血量，
        // 不会动它，所以夺舍之后仍然读得到凶手
        const killer = state.entities.find((e) => e.id === state.player.lastHitById);
        deaths.push({
          frame: f,
          killerType: killer?.config.name,
          killerTier: killer?.config.tier,
          playerTier: tierBefore,
          playerLevel: levelBefore,
          squadAlive: squadAliveBefore,
          protectedNow,
        });
      }
    }

    const p = state.player;
    const members = getSquadMembers(state);
    const eaten = Object.values(p.eatenHistory).reduce((a, b) => a + b, 0);

    return {
      endReason,
      framesSurvived,
      weight: Math.round(p.weight),
      level: p.level,
      squadSize: members.length,
      coreSize: members.filter((m) => !!m.coreRole).length,
      squadSizeAtStart,
      coreSizeAtStart,
      recruitedTotal: state.squad.recruitedTotal,
      squadSizePeak,
      memberDeaths,
      eaten,
      evolutions,
      possessions: state.squad.possessCount,
      commandsIssued,
      deaths,
    };
    })
  )
  );

const ARMS: Record<string, ArmConfig> = {
  A: { name: '只顾自己（不下令 / 不附身）', commands: false, possess: false, stripRoles: false, roleAware: false },
  B: { name: '+ 指令', commands: true, possess: false, stripRoles: false, roleAware: false },
  C: { name: '+ 指令 + 附身（完整操作）', commands: true, possess: true, stripRoles: false, roleAware: false },
  D: { name: '完整操作，但队伍没有核心角色', commands: true, possess: true, stripRoles: true, roleAware: false },
  // v3：会用角色的一对 —— 只有这两个能回答「队伍选择到底有没有用」
  C3: { name: '完整操作 + 会用角色（打控制链 / 换护卫）', commands: true, possess: true, stripRoles: false, roleAware: true },
  D3: { name: '同样会玩，但队伍没有核心角色', commands: true, possess: true, stripRoles: true, roleAware: true },
  // 调优探针：弱点放松一半（电鳗血 0.7→0.85、剑鱼伤害 0.6→0.8、河豚速度 0.85→0.925）
  C3r: { name: '会用角色 + 弱点放松一半', commands: true, possess: true, stripRoles: false, roleAware: true, weaknessRelief: 0.5 },
  D3r: { name: '弱点放松一半，但无核心角色', commands: true, possess: true, stripRoles: true, roleAware: true, weaknessRelief: 0.5 },
  // 真·开局：不预置队伍，看 3 分钟够不够从光杆打到有队伍
  E: { name: '真·开局（不预置队伍，完整操作 + 会用角色）', commands: true, possess: true, stripRoles: false, roleAware: true, noSeedSquad: true },
};

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

interface Aggregate {
  组: string;
  策略: string;
  存活均值: number;
  存活中位: number;
  /** 真跑满 10800 帧的局数 */
  活满三分钟: number;
  /** 击杀 BOSS 提前通关的局数 —— **不是失败**，别混进「活不过」里 */
  通关: number;
  被打死: number;
  体重均值: number;
  吃掉均值: number;
}

/** 每个组只跑一次，结果共享给所有用例 —— 一组 8 个种子 × 10800 帧，别每个 it 各跑一遍 */
const cache: Record<string, SliceResult[]> = {};

/**
 * **每跑完一个种子让出一次事件循环** —— 这是「全绿但退出码非 0」的根治办法。
 *
 * 症状：`Tests 18 passed (18)` 却又报 `Error: [vitest-worker]: Timeout calling "onTaskUpdate"`。
 * 成因不是超时设置太短，而是 **worker 的同步阻塞撞上了 birpc 的 60 秒应答计时**：
 *
 *   1. worker 调 `rpc().onTaskUpdate(...)`，birpc 起一个 60s 的 `setTimeout` 等主线程应答；
 *   2. 主线程其实**早就应答了**，但 worker 正在跑同步循环，消息收不进来；
 *   3. 循环结束后事件循环恢复 —— **timers 阶段排在 poll（I/O）阶段之前**，
 *      于是那个早已过期的 60s 定时器**先于**躺在队列里的 IPC 应答触发，直接判超时。
 *
 * 所以「把用例拆细」治标不治本：拆到每组 95~123 秒，仍然 > 60 秒，照样超时（实测如此）。
 * 真正的解法是**别让同步阻塞超过 RPC 应答时限** —— 每跑完一个种子（约 15 秒）喘一口气，
 * 让待处理的 IPC 应答先落地。
 *
 * ⚠️ 只在**种子之间**喘气，不在帧循环里喘：`withSeededRandom` 期间 `Math.random` 是被 mock 的，
 *    中途让出会让别的代码顶着被污染的随机源跑。
 */
const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const runArm = async (arm: ArmConfig): Promise<SliceResult[]> => {
  const out: SliceResult[] = [];
  for (const s of SEEDS) {
    out.push(runSlice(arm, s));
    await breathe();
  }
  return out;
};

/** 先把组跑起来（异步）；跑完后再用同步的 `runsOf` 取结果 */
const ensureArm = async (k: string): Promise<SliceResult[]> => (cache[k] ??= await runArm(ARMS[k]));

/** 同步取结果 —— 调用前必须 `await ensureArm(k)`，否则是「还没跑就想要数」 */
const runsOf = (k: string): SliceResult[] => {
  const rs = cache[k];
  if (!rs) throw new Error(`组 ${k} 还没跑：这个用例里要先 await ensureArm('${k}')`);
  return rs;
};

const aggOf = (k: string): Aggregate => {
  const rs = runsOf(k);
  return {
    组: k,
    策略: ARMS[k].name,
    存活均值: Math.round(mean(rs.map((r) => r.framesSurvived))),
    存活中位: Math.round(median(rs.map((r) => r.framesSurvived))),
    活满三分钟: rs.filter((r) => r.endReason === 'SURVIVED').length,
    通关: rs.filter((r) => r.endReason === 'VICTORY').length,
    被打死: rs.filter((r) => r.endReason === 'GAME_OVER').length,
    体重均值: Math.round(mean(rs.map((r) => r.weight))),
    吃掉均值: Math.round(mean(rs.map((r) => r.eaten)) * 10) / 10,
  };
};

const AGG: Record<string, Aggregate> = {};
const A = (k: string): Aggregate => (AGG[k] ??= aggOf(k));

/** 同种子配对胜场：多少个世界里 k1 比 k2 活得久（比均值抗离群值） */
const pairedWins = (k1: string, k2: string): number => {
  const a = runsOf(k1);
  const b = runsOf(k2);
  let n = 0;
  for (let i = 0; i < SEEDS.length; i += 1) if (a[i].framesSurvived > b[i].framesSurvived) n += 1;
  return n;
};
const medianSurvival = (k: string): number => median(runsOf(k).map((r) => r.framesSurvived));

/** 任意指标上的同种子配对胜场（成长类指标也要配对看，不能只比均值） */
const pairedWinsOn = (
  k1: string,
  k2: string,
  pick: (r: SliceResult) => number
): number => {
  const a = runsOf(k1);
  const b = runsOf(k2);
  let n = 0;
  for (let i = 0; i < SEEDS.length; i += 1) if (pick(a[i]) > pick(b[i])) n += 1;
  return n;
};
const meanWeight = (k: string): number => mean(runsOf(k).map((r) => r.weight));

/**
 * **通关率才是「结果」，存活帧数不是。**
 *
 * ⚠️ `framesSurvived` 是个**被污染的指标**：本作的胜利条件是「玩家阵营击杀 BOSS」
 *    （`combat.ts checkVictory`），**赢得越快，`framesSurvived` 越短** ——
 *    和「被打死」在数字上完全无法区分。实测 64 局里 **34 局是提前通关**，
 *    也就是说这个指标有一半的样本在**反向计分**。
 *
 * 后果很具体：D 组（无核心角色）中位存活 3649 帧 > C 组 3258 帧，
 * 一度被读成「有角色反而死得快」。真相是 **D 赢得更少（3/8 vs 5/8），所以局数拖得更久** ——
 * 它不是活得久，是**没赢**。
 *
 * 所以任何跨「会不会赢」的对比都必须改用通关率（配对比），存活帧数只在同一结局内部可比。
 */
const victoryCount = (k: string): number => runsOf(k).filter((r) => r.endReason === 'VICTORY').length;
const pairedVictories = (k1: string, k2: string): number =>
  pairedWinsOn(k1, k2, (r) => (r.endReason === 'VICTORY' ? 1 : 0));

describe('G1 放行条件 · 3 分钟切片', () => {
  /**
   * **一组一个用例**，不要放进同一个 it 里。
   *
   * 踩过的坑：八个组塞进一个 `it`，单用例同步阻塞 505 秒，worker 回不了
   * vitest 的 RPC（`Timeout calling "onTaskUpdate"`）—— 结果是
   * **10 个用例全绿，但进程退出码非 0**，一眼看过去像整轮失败。
   * 拆开之后单次阻塞降到 ~65 秒 —— **但还是不够**：birpc 的应答时限是 60 秒，
   * 而且拆细治不了根（见 `breathe` 处的说明）。真正的解法是每组内部按种子让出事件循环。
   */
  for (const k of Object.keys(ARMS)) {
    it(`跑完 ${k} 组（${ARMS[k].name}）`, async () => {
      const rs = await ensureArm(k);
      console.log(
        `${k} ${ARMS[k].name}：存活中位 ${median(rs.map((r) => r.framesSurvived))} 帧 · ` +
          `体重均值 ${Math.round(mean(rs.map((r) => r.weight)))} · ` +
          `吃掉均值 ${(mean(rs.map((r) => r.eaten))).toFixed(1)}`
      );
      for (const r of rs) expect(r.framesSurvived, `${k} 组的切片长度`).toBeGreaterThan(0);
    });
  }

  it('把聚合成绩打成一张表（人工看趋势用，各组已在上面跑完并缓存）', async () => {
    for (const k of Object.keys(ARMS)) await ensureArm(k);
    console.log(
      '\n── G1 放行条件 · 3 分钟切片（' +
        SEEDS.length +
        ' 个种子 · 同一套操作大脑 · 同一支预置队伍）──'
    );
    console.table(Object.keys(ARMS).map((k) => A(k)));

    // 逐种子矩阵：均值会被一两条长命局拉偏（A 组均值 3409 / 中位 1802 就是这么来的），
    // 真正能下结论的是**同种子配对** —— 同一个世界里谁活得更久
    console.log('\n── 逐种子存活帧（同一列 = 同一个世界）──');
    console.table(
      SEEDS.map((s, i) => ({
        种子: s,
        'A 只顾自己': runsOf('A')[i].framesSurvived,
        'B +指令': runsOf('B')[i].framesSurvived,
        'C 完整操作': runsOf('C')[i].framesSurvived,
        'D 无核心角色': runsOf('D')[i].framesSurvived,
      }))
    );

    // 结构性断言：切片必须真的跑起来了，不能「一开局就死」也算通过
    for (const k of Object.keys(ARMS)) {
      for (const r of runsOf(k)) {
        expect(r.framesSurvived, `${k} 组的切片长度`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * 放行条件之一：**操作能改变结果**。
   *
   * 这条**稳定**：大脑 v1（固定逃跑距离）与 v2（按体型缩放）两版都是 **×1.30 / 配对 5/8**，
   * 不随大脑翻转，所以可以断言。
   *
   * 阈值卡 **1.15** 而不是实测的 1.30，是刻意留余量：8 个种子的中位数本身会漂，
   * 卡到实测值上等于埋一颗「下次动任何数值就红」的雷（而且红了分不清是回归还是噪声）。
   * 真要判断有没有回退，看上面那张**逐种子矩阵**，别只盯这一个比值。
   */
  it('操作能改变结果：完整操作组的中位存活高于「只顾自己」', async () => {
    await ensureArm('C');
    await ensureArm('A');
    const ratio = medianSurvival('C') / medianSurvival('A');
    console.log(
      `操作收益：中位存活 ${medianSurvival('A')} → ${medianSurvival('C')} 帧（×${ratio.toFixed(2)}），` +
        `同种子配对胜 ${pairedWins('C', 'A')}/${SEEDS.length}`
    );
    expect(ratio, '完整操作 / 只顾自己 的中位存活比').toBeGreaterThan(1.15);
    expect(pairedWins('C', 'A'), '同种子配对胜场').toBeGreaterThanOrEqual(5);
  });

  /**
   * 放行条件之二：**队伍选择能改变结果**（C 有核心角色，D 同样的队伍但没有角色）。
   *
   * ⚠️⚠️ **这条目前只报数、不断言方向** —— 因为它**随台架大脑翻转过一次**：
   *    · 大脑 v1（固定 190px 逃跑）：C/D 中位存活 **×1.33**、配对 6/8
   *    · 大脑 v2（按体型缩放逃跑）：C/D 中位存活 **×0.89**、配对 3/8
   *   同一个 FQ-06、同一批种子，换个更会躲的 bot 结论就翻面 ——
   *   说明**这条信号比噪声强不了多少**，拿它判放行就是赌运气。
   *
   * 但数据里有个稳定的东西：**有角色的队伍「成长」明显更好**
   * （体重 798 vs 411，接近翻倍；吃掉 17.4 vs 14.3），代价是存活略低。
   * 即角色的收益大概率体现在**打得动**而不是**活得久**上 ——
   * 这正好是台架大脑最不会利用的部分（它只会集火/撤退，不会配合河豚给盾、电鳗打断）。
   *
   * 结论：**这条交给真人切片判**，台架只负责把两个维度的数字摆出来。
   */
  it('队伍选择：只报数，不断言方向（信号随大脑翻转，交真人切片）', async () => {
    await ensureArm('C');
    await ensureArm('D');
    const survRatio = medianSurvival('C') / medianSurvival('D');
    const weightC = mean(runsOf('C').map((r) => r.weight));
    const weightD = mean(runsOf('D').map((r) => r.weight));
    const eatenC = mean(runsOf('C').map((r) => r.eaten));
    const eatenD = mean(runsOf('D').map((r) => r.eaten));

    console.log(
      `队伍选择（C 有角色 / D 无角色）：\n` +
        `  存活：中位 ${medianSurvival('D')} → ${medianSurvival('C')} 帧（×${survRatio.toFixed(2)}），` +
        `配对胜 ${pairedWins('C', 'D')}/${SEEDS.length}\n` +
        `  成长：体重 ${Math.round(weightD)} → ${Math.round(weightC)}（×${(weightC / weightD).toFixed(2)}），` +
        `吃掉 ${eatenD.toFixed(1)} → ${eatenC.toFixed(1)}\n` +
        `  ⚠️ 存活方向随台架大脑翻转过（v1 ×1.33 / v2 ×0.89），只作参考，不判放行`
    );

    // 唯一保留的硬断言：两个维度的**量级**都说明队伍不是可有可无的摆设。
    // 不锁方向 —— 方向由真人切片定。
    expect(Math.abs(survRatio - 1) + Math.abs(weightC / weightD - 1), '队伍必须真的改变结果').toBeGreaterThan(0.1);
  });

  /**
   * ⚠️ 这条**不是**断言，是给人工切片留的醒目标记。
   *
   * **「没跑满 10800 帧」必须先拆成两种完全不同的结局**（`endReason`）：
   *   · `GAME_OVER` —— 队伍拼光、无人可夺舍，**被打死了**
   *   · `VICTORY`   —— **提前通关**（`combat.ts checkVictory`：玩家阵营击杀 BOSS 即通关）
   * 合并成一句「活满三分钟 0/8」报出去，会让真人带着「这游戏太难」的预设进场，
   * 而真相可能是「赢得太快」。所以这里两种分开数。
   */
  it('【发现】没有一组跑满 3 分钟 —— 但要分清「被打死」还是「提前通关」', async () => {
    for (const k of Object.keys(ARMS)) await ensureArm(k);

    const line = (pick: (a: Aggregate) => number, label: string): string =>
      `${label} ${Object.keys(ARMS).map((k) => `${k}:${pick(A(k))}`).join('  ')}`;
    console.log(line((a) => a.被打死, '被打死'));
    console.log(line((a) => a.通关, '提前通关'));
    console.log(line((a) => a.活满三分钟, '真跑满三分钟'));

    const totalVictory = Object.keys(ARMS).reduce((n, k) => n + A(k).通关, 0);
    const totalRuns = Object.keys(ARMS).length * SEEDS.length;
    console.log(
      `合计 ${totalRuns} 局：被打死 ${totalRuns - totalVictory - Object.keys(ARMS).reduce((n, k) => n + A(k).活满三分钟, 0)} · ` +
        `提前通关 ${totalVictory} · 跑满 ${Object.keys(ARMS).reduce((n, k) => n + A(k).活满三分钟, 0)}`
    );
    console.log('台架大脑只有两条规则，比真人笨 —— 这不等于「游戏太难」，' +
      '但真人切片必须专门看一眼生存曲线（以及：赢得太快也是个问题）。');
    expect(SEEDS.length).toBeGreaterThan(0);
  });

  /**
   * **队员是怎么没的** —— 「队伍留不住」的具体分叉。
   *
   * 三种成因的对策完全不同，混在一起看就白测了：
   *   · **脱队后被吃**（死时离玩家 > `DETACHED_DIST`）→ 队形 / 跟随问题（FQ-05）
   *   · **被更大的鱼顺手吃掉**（凶手 tier > 队员 tier）→ 信息层级问题（FQ-09）
   *   · **被同级或更小的鱼打死**（凶手 tier ≤ 队员 tier）→ 数值 / 战斗手感问题（FQ-04）
   *
   * 只报数不断言：这是**给真人切片带路**的诊断，不是判据。
   */
  it('队员是怎么没的：脱队 / 被大鱼顺手吃 / 被同级打死', async () => {
    // E 是**真·开局**（不收编就没队伍），才是清单上「8/8 收编过但打光了」的那一组；
    // C3 开局白送一支队伍，拿来做对照：如果两组的损失形态一致，
    // 说明「留不住」不是「没队伍可留」，而是留人机制本身的问题。
    for (const k of ['E', 'C3']) await ensureArm(k);

    const describe = (k: string): string => {
      const rs = runsOf(k);
      const all = rs.flatMap((r) => r.memberDeaths);
      const detached = all.filter((d) => d.distToPlayer > DETACHED_DIST).length;
      const known = all.filter((d) => d.killerTier !== undefined);
      const byBigger = known.filter((d) => (d.killerTier as number) > d.tier).length;
      const byEqualOrLess = known.filter((d) => (d.killerTier as number) <= d.tier).length;
      const noKiller = all.length - known.length;
      const killers = (() => {
        const m = new Map<string, number>();
        for (const d of all) if (d.killerType) m.set(d.killerType, (m.get(d.killerType) ?? 0) + 1);
        return (
          [...m.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([n, c]) => `${n}×${c}`)
            .join('  ') || '（无）'
        );
      })();
      // 距离分布只看前 12 个，且**按比例**读：绝对人次受局数与队伍规模影响，不可跨组直接比
      const dists = all.slice(0, 12).map((d) => d.distToPlayer);
      return (
        `${k} 组（${rs.length} 局，收编累计 ${rs.reduce((n, r) => n + r.recruitedTotal, 0)}）：共 **${all.length}** 人次\n` +
        `    脱队后被吃（死时离玩家 > ${DETACHED_DIST}px）：${detached}/${all.length}` +
        `${all.length ? `（${Math.round((detached / all.length) * 100)}%）` : ''}\n` +
        `    被更大的鱼顺手吃（凶手 tier 更高）：${byBigger}/${known.length}\n` +
        `    被同级或更小的鱼打死：${byEqualOrLess}/${known.length}\n` +
        `    没记到凶手：${noKiller}/${all.length}\n` +
        `    死时离玩家的距离分布（前 12 个）：${dists.join('/')}${all.length > 12 ? ' …' : ''}\n` +
        `    常见凶手：${killers}`
      );
    };

    console.log(`队员损失诊断\n  ${describe('E')}\n  ${describe('C3')}`);

    const eTotal = runsOf('E').flatMap((r) => r.memberDeaths).length;
    // 唯一硬断言：诊断数据必须真的采到了（采不到就说明追踪逻辑坏了，别让它静默变成 0）
    expect(eTotal, 'E 组应当有队员损失记录，否则追踪逻辑没生效').toBeGreaterThan(0);
  });

  /**
   * **同种子跑两遍必须逐字段一致** —— 上面所有配对比较都建立在这条之上。
   *
   * 反向验证时发现「C 与 D 配置相同却跑出不同结果」，说明有漏网的非确定性来源；
   * 这条用例就是把那个来源钉住：不先证明它，配对胜场只是噪声。
   */
  it('同一种子跑两遍必须逐字段一致（否则上面的配对比较全是噪声）', async () => {
    const first = runSlice(ARMS.C, SEEDS[0]);
    await breathe();
    const second = runSlice(ARMS.C, SEEDS[0]);
    expect(second, '同种子两次运行结果不一致 → 有非确定性来源').toEqual(first);
  });

  /**
   * **死因分析** —— 回答「为什么活不过三分钟」，给真人切片带路。
   *
   * 台架能报「0/8 活满三分钟」，但报不出为什么。这里把每一次死亡记下来
   * （凶手物种 / 等级差 / 当时有没有保护 / 队伍还在不在），看死法集中在哪种：
   *   · 全是**高等级差**（大鱼一口）→ 是「能不能看见、躲不躲得开」的问题（信息层级，G2 / FQ-09）
   *   · 全是**同级或低级** → 是数值问题（战斗手感，G1 / FQ-04）
   *   · 保护期内还死 → **保护根本没生效**，那是 bug 不是难度
   */
  it('死因分析：把「活不过三分钟」拆成可以下手的结论', async () => {
    for (const k of Object.keys(ARMS)) await ensureArm(k);
    const all = Object.keys(ARMS).flatMap((k) => runsOf(k).flatMap((r) => r.deaths));
    const byKiller = new Map<string, number>();
    let protectedDeaths = 0;
    const tierGaps: number[] = [];
    for (const d of all) {
      if (d.killerType) byKiller.set(d.killerType, (byKiller.get(d.killerType) ?? 0) + 1);
      if (d.protectedNow) protectedDeaths += 1;
      if (d.killerTier !== undefined) tierGaps.push(d.killerTier - d.playerTier);
    }
    const top = [...byKiller.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    console.log(`\n── 死因分析（${Object.keys(ARMS).length} 组合计）──`);
    console.log(`总死亡 ${all.length} 次 · 保护期内死亡 ${protectedDeaths} 次`);
    console.log(`凶手等级 − 玩家等级：中位 ${median(tierGaps)}（正=被更大的鱼打死）`);
    console.log('最常见的凶手：', top.map(([n, c]) => `${n}×${c}`).join('  ') || '（没抓到凶手 id）');
    const early = all.filter((d) => d.frame < 1800).length; // 30 秒内
    console.log(`开局 30 秒内死亡 ${early}/${all.length} 次`);

    // ⚠️ 这条是**唯一**的硬断言：保护期内还被打死 = 保护没生效，那是 bug
    expect(protectedDeaths, '新手保护生效时不该被打死').toBe(0);
  });

  /**
   * **会用角色的一对**（C3 / D3）—— 这是唯一能回答「队伍选择有没有用」的对比。
   *
   * **先写死后跑分**（不看着结果调结论）：判定标准预先定死为
   * 「中位存活比 ≥ 1.15 **且**同种子配对胜 ≥ 5/8」，两个都满足才算成立；
   * 只中一个、或者反过来（无角色更好），就维持「台架判不了」，继续交真人。
   *
   * 逻辑：v2 的 C/D 判不了，是因为大脑「带着角色却不会用」。
   * v3 让它打控制链 + 残血换护卫；如果角色真有价值，这一对应当体现出差距。
   */
  it('会用角色时，队伍选择是否体现出差距（C3 / D3）', async () => {
    await ensureArm('C3');
    await ensureArm('D3');
    const survRatio = medianSurvival('C3') / medianSurvival('D3');
    const wins = pairedWins('C3', 'D3');
    const weightC = mean(runsOf('C3').map((r) => r.weight));
    const weightD = mean(runsOf('D3').map((r) => r.weight));

    console.log(
      `会用角色的一对（C3 有角色 / D3 无角色）：\n` +
        `  存活：中位 ${medianSurvival('D3')} → ${medianSurvival('C3')} 帧（×${survRatio.toFixed(2)}），配对胜 ${wins}/${SEEDS.length}\n` +
        `  成长：体重 ${Math.round(weightD)} → ${Math.round(weightC)}（×${(weightC / weightD).toFixed(2)}）\n` +
        `  判定标准（预先定死）：存活比 ≥ 1.15 且配对胜 ≥ 5/8`
    );

    // 只报判定结果，不写死方向 —— 达不到标准就维持「判不了」，由下面的成长维度接手
    const established = survRatio >= 1.15 && wins >= 5;
    console.log(
      established
        ? '  → 达标：队伍选择在「存活」维度成立'
        : '  → 未达标（存活）：维持「存活维度判不了」—— 注意存活与配对胜场可能打架\n' +
          '     （C3 均值 3948 > D3 3783，但中位 3536 < 4099：赢得更频、输得更惨）'
    );
    expect(typeof established).toBe('boolean');
  });

  /**
   * **队伍选择唯一被复现的结论：成长显著更好。**
   *
   * 存活维度两版大脑给的答案相反（×1.33 → ×0.89 / ×0.86），**不能用**；
   * 但成长维度**两版都同向、且量级很大**：
   *   大脑 v2：体重 411 → 798（×1.94）
   *   大脑 v3：体重 445 → 709（×1.59）
   * 两版 × 8 种子 = 16 次配对比较都指向「有角色长得更快」——
   * 这次不是噪声：噪声不会连续两版同向。
   *
   * 结论：**核心角色买的是「打得动」**（控制链 + 集火让击杀变多），
   * 代价是存活上略吃亏（剑鱼冲得猛、河豚跑得慢、电鳗血薄）。
   */
  it('队伍选择的稳定结论：有核心角色，成长显著更好（两版大脑都复现）', async () => {
    for (const k of ['C', 'D', 'C3', 'D3']) await ensureArm(k);
    const ratio2 = meanWeight('C') / meanWeight('D');
    const ratio3 = meanWeight('C3') / meanWeight('D3');
    const wins2 = pairedWinsOn('C', 'D', (r) => r.weight);
    const wins3 = pairedWinsOn('C3', 'D3', (r) => r.weight);

    console.log(
      `成长维度（有核心角色 / 无核心角色）：\n` +
        `  大脑 v2：体重 ×${ratio2.toFixed(2)}，配对胜 ${wins2}/${SEEDS.length}\n` +
        `  大脑 v3：体重 ×${ratio3.toFixed(2)}，配对胜 ${wins3}/${SEEDS.length}`
    );

    // 两版都要同向才算数 —— 单版同向可能是运气（这正是 v1「62% 死于巨怪」教给我的）
    expect(ratio2, 'v2 体重比').toBeGreaterThan(1.25);
    expect(ratio3, 'v3 体重比').toBeGreaterThan(1.25);
    expect(Math.min(wins2, wins3), '两版大脑的成长配对胜场都要过半').toBeGreaterThanOrEqual(5);
  });

  /**
   * **【纠正】通关率才是「结果」，存活帧数不是。**
   *
   * 这一条推翻了前面两个读数，两条都是**指标污染**而不是游戏性质：
   *   ①「0/8 活满三分钟 = 游戏太难」—— 其实 **34/64 是提前通关**（击杀 BOSS 即胜利），
   *      不是被打死。
   *   ②「有核心角色反而死得快（存活 ×0.89）」—— D 组存活更久是因为它**赢得更少**，
   *      局数拖长了。它不比 C 活得久，它只是**没赢**。
   *
   * ⚠️ 仍然只报数、不断言：5/8 vs 3/8 这种差距在 8 个种子上**离噪声不远**，
   *    真正的判据是「两版大脑同向」（v2 与 v3 都是 5:3）+ 逐种子配对胜场。
   */
  it('【纠正】用通关率重读三个结论（存活帧数把「赢得快」读成了「死得早」）', async () => {
    for (const k of ['A', 'C', 'D', 'C3', 'D3']) await ensureArm(k);
    const op = [victoryCount('A'), victoryCount('C')];
    const sq2 = [victoryCount('D'), victoryCount('C')];
    const sq3 = [victoryCount('D3'), victoryCount('C3')];
    console.log(
      `通关率（分母 ${SEEDS.length}）：\n` +
        `  操作     A(只顾自己) ${op[0]} → C(完整操作) ${op[1]}，配对胜 ${pairedVictories('C', 'A')}/${SEEDS.length}\n` +
        `  队伍选择 D(无角色) ${sq2[0]} → C(有角色) ${sq2[1]}，配对胜 ${pairedVictories('C', 'D')}/${SEEDS.length}\n` +
        `  队伍选择 D3(无角色) ${sq3[0]} → C3(有角色) ${sq3[1]}，配对胜 ${pairedVictories('C3', 'D3')}/${SEEDS.length}\n` +
        `  ⚠️ 两版大脑都给出「有角色赢得更多」，但 5:3 离噪声不远 —— 只报数，交真人切片定夺`
    );
    // 唯一硬断言：通关必须真能达成（胜利条件没接上就是 bug，不是难度）
    expect(op[0] + sq2[1], '至少要有若干局能通关，否则是胜利条件没接上').toBeGreaterThan(0);
  });

  /**
   * **真·开局（E 组）**：这一组才和真人开局一样 —— 一条鱼，队伍得自己收编。
   *
   * 其余八组开局就送 5 人队伍，所以「50 秒通关」很可能是**台架比真人强**造成的，
   * 不能当成难度结论。
   *
   * ⚠️ 本组最初的题目是「**3 分钟够不够从光杆打到有队伍**」，跑出来发现**问错了**：
   *    累计收编 `16/1/2/2/5/3/2/1` —— **8 局全部都收编成功过**，没有一局收不到人。
   *    终局却是 `5/0/0/0/0/0/0/0` —— **人收得到，留不住**。
   *    所以真人切片该看的不是「收编快不快」，而是**队伍为什么留不住**。
   */
  it('真·开局（不预置队伍）：收得到人，但留得住吗', async () => {
    await ensureArm('E');
    await ensureArm('C3');
    const rs = runsOf('E');
    const neverRecruited = rs.filter((r) => r.recruitedTotal === 0).length;
    console.log(
      `真·开局 E 组（完整操作 + 会用角色，但不送队伍）：\n` +
        `  通关 ${victoryCount('E')}/${SEEDS.length} · 中位存活 ${medianSurvival('E')} 帧` +
        `（预置队伍的 C3 组是 ${medianSurvival('C3')} 帧）\n` +
        `  终局队伍规模 ${rs.map((r) => r.squadSize).join('/')} · ` +
        `峰值 ${rs.map((r) => r.squadSizePeak).join('/')} · ` +
        `累计收编 ${rs.map((r) => r.recruitedTotal).join('/')}\n` +
        `  体重均值 ${Math.round(meanWeight('E'))}（C3 是 ${Math.round(meanWeight('C3'))}）· ` +
        `吃掉均值 ${(mean(rs.map((r) => r.eaten))).toFixed(1)} · ` +
        `进化次数 ${rs.map((r) => r.evolutions).join('/')}\n` +
        `  ⚠️ 「终局 0 人」要分两种成因，对策完全相反，必须分开数：\n` +
        `     从没收编过 ${neverRecruited}/${SEEDS.length} 局（→ 开局节奏问题：先长大才收得到人）\n` +
        `     收编过但打光了 ${SEEDS.length - neverRecruited}/${SEEDS.length} 局（→ 队伍生存问题）`
    );
    expect(runsOf('E').length, 'E 组也要真的跑起来').toBe(SEEDS.length);
  });

  /**
   * **调优探针**：把 FQ-06 的弱点放松一半，看队伍选择的**存活**维度能不能转正。
   *
   * 这是给「要不要动弱点数值」这个问题配的数据，不是改数值 ——
   * 跑完 `withWeaknessRelief` 会把倍率还原，仓库里一个字都不会变。
   *
   * ⚠️ 只报数、不断言：这是**决策输入**，拍板权在人。
   */
  it('调优探针：弱点放松一半后，队伍选择的存活维度会不会转正', async () => {
    for (const k of ['C3', 'D3', 'C3r', 'D3r']) await ensureArm(k);
    const before = medianSurvival('C3') / medianSurvival('D3');
    const after = medianSurvival('C3r') / medianSurvival('D3r');
    const wBefore = meanWeight('C3') / meanWeight('D3');
    const wAfter = meanWeight('C3r') / meanWeight('D3r');

    console.log(
      `弱点放松一半（电鳗血 0.7→0.85 · 剑鱼伤害 0.6→0.8 · 河豚速度 0.85→0.925）：\n` +
        `  存活：×${before.toFixed(2)} → ×${after.toFixed(2)}` +
        `（配对胜 ${pairedWins('C3', 'D3')} → ${pairedWins('C3r', 'D3r')}/${SEEDS.length}）\n` +
        `  成长：×${wBefore.toFixed(2)} → ×${wAfter.toFixed(2)}\n` +
        `  ⚠️ 只报数，不替人拍板：改不改数值由真人切片的手感决定`
    );

    // 唯一断言：探针必须真的把数值改回去了（污染了后面的用例就全完了）
    expect(SQUAD_ROLES.CONTROL.healthMult, '探针结束后弱点必须还原').toBe(0.7);
    expect(SQUAD_ROLES.SCOUT.damageMult, '探针结束后弱点必须还原').toBe(0.6);
  });

  it('预置队伍真的落到了三个核心位上（否则 C / D 的对比是空的）', async () => {
    await ensureArm('C');
    await ensureArm('D');
    for (const r of runsOf('C')) {
      expect(r.squadSizeAtStart, 'C 组开局队伍规模').toBe(SEED_SQUAD.length);
      expect(r.coreSizeAtStart, 'C 组开局核心位数').toBe(3);
    }
    for (const r of runsOf('D')) {
      expect(r.coreSizeAtStart, 'D 组的核心位应被抹干净').toBe(0);
    }
  });
});
