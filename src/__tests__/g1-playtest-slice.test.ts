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
import { classifyByRadius, isThreatByRadius, isPreyByRadius, THREAT_RADIUS_MULT } from '../test/brainVision';
import type { BrainTuning } from '../test/brainVision';
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
/**
 * 「BOSS 已经贴到队员身边了」的判定余量 —— 加在双方半径之上。
 *
 * 取 250px：比 `DANGER_RANGE`(190) 宽一点，意思是「已经进了危险区、但还没到接触」。
 * 从这一刻起计时，到队员真的死掉为止，就是**预警窗口**。
 */
const BOSS_WARN_DIST = 250;
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
  /**
   * **换一版「视野参数」跑同一组**（默认 = 台架一直用的 ±5% 盲带）。
   *
   * 存在的理由就是 §22.2 那条规矩：扛着放行结论的大脑必须能**换参数重跑**，
   * 结论还在才算数。§22.13 又量出这条规则在制造假现象（49% 的玩家死亡，
   * 凶手是大脑**主动扑上去**的猎物），所以「更谨慎的猎物选择」这一版必须跑。
   */
  brain?: BrainTuning;
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
  /**
   * ── 「**大脑当时看得见凶手吗**」用的（见 `test/brainVision.ts`）──
   *
   * 台架大脑只看**半径差**：> 1.05× 算威胁（躲），< 0.95× 算猎物（追），
   * **中间 ±5% 那条带子既不躲也不追**。所以「被同级鱼磨死」这个说法
   * 有一半可能是**规则写死的**，而不是游戏难。
   * 死时双方半径记下来，才能把「台架看不见」和「数值太凶」分开。
   */
  playerRadius?: number;
  killerRadius?: number;
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
  /**
   * ── 下面这组是回答「**跑得掉吗**」用的（决定「队员该不该自保」的前提）──
   *
   * 「给队员加自保」是个设计取舍，但**前提是自保真的有用**。
   * 如果死时凶手本来就比队员快，那「逃跑」这个选项物理上不存在，
   * 加多少逃跑逻辑都是白加 —— 该往队形 / 预警 / 数值上使劲。
   */
  /** 队员的**基础**速度。注意 `updateMovement` 追击时会 ×1.25，比较时要还原 */
  memberSpeed: number;
  memberMaxHealth: number;
  /** **这一帧开始时**的血量 —— 死时血量必然是 0，只有这个数能说明「是不是残血被补掉」 */
  hpBefore: number;
  /** 凶手的基础速度（野鱼可能另有 FRENZY / 生物群系倍率，这里只是代理指标） */
  killerSpeed?: number;
  /** 凶手行为：BOSS 意味着「基本跑不掉」 */
  killerBehavior?: string;
  killerDamage?: number;
  /**
   * 死时双方的**半径** —— 判「大脑看不看得见凶手」用它（见 `test/brainVision.ts`）。
   *
   * 队员的行为全在 `squad.ts` 里，而 `squad.ts` **完全不看半径也不看血量**，
   * 所以这一组数对队员只是「现场记录」；它的主战场是**玩家**那一侧。
   */
  memberRadius?: number;
  killerRadius?: number;
  /**
   * ── 下面这组回答「**是谁把队员带进 BOSS 圈的**」──
   *
   * §22.11 记下「强玩家阶段 49% 的队员死于 t4 BOSS」，但那一句说不出**对策**：
   * 是 BOSS 太密（→ 调刷新）、预警不够（→ 做提示，FQ-09），
   * 还是**队员跟着玩家一起走进了 BOSS 圈**（→ 队形 / 自保，与 §22.11 同源）？
   * 三者的改法完全不同，所以要把「死时玩家在哪儿」和「有没有提前量」记下来。
   */
  /** 死时**玩家**离凶手多远 —— 玩家也在圈内 = 是跟着玩家进去的 */
  playerDistToKiller?: number;
  /** 死时玩家的半径（判「玩家在不在 BOSS 圈内」要用它） */
  playerRadius?: number;
  /**
   * 死之前，BOSS 已经在队员身边**连续**待了多少帧。
   * `undefined` = 死时附近本来就没有 BOSS（不是 BOSS 杀的，或凶手是别的东西）。
   * 这是「预警来不来得及」的唯一机械证据：几帧 = 根本来不及，几百帧 = 有时间反应。
   */
  bossLeadFrames?: number;
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
  /**
   * **BOSS 密度**：有 BOSS 存活的帧数，以及同时存活的峰值。
   *
   * 「队员 49% 死于 BOSS」有两种完全不同的读法，光看比例分不出来：
   *   · 场上一共就没几个 BOSS，队员却总能撞上 → **队形 / 跟随**把队员送过去的
   *   · BOSS 本来就有好几条同时在场 → 那是**刷新密度**问题
   * 所以把分母记下来。
   */
  bossFrames: number;
  maxLiveBosses: number;
  /**
   * 每帧存活 BOSS 数的**总和** —— 除以 `framesSurvived` 就是「平均场上有几条 BOSS」。
   *
   * 光有峰值会骗人（峰值 68 可能只是一瞬间），光有「有 BOSS 的帧占比」也不够
   * （1 条和 60 条算同一个数）。两个都要，才能说清「密」到什么程度。
   */
  bossEntityFrames: number;
  /** 整局里 t4 生物**离场**的次数 —— 「只进不出」的直接证据（见 `tier4Removed`） */
  tier4Removed: number;
  eaten: number;
  evolutions: number;
  /**
   * **亡语夺舍**次数（`tryPossessOnDeath`，玩家死亡时自动接管队里半径最大的成员）。
   *
   * ⚠️ 这个字段原来叫 `possessions`，被当成「台架主动附身的次数」在用 —— **是错的**。
   *    `state.squad.possessCount` 只在 `possessMember(..., { revive: true })` 里自增，
   *    而 `revive: true` 的**唯一调用方**就是亡语；台架自己用的 `requestPossess`
   *    走的是 `revive: false`（交换身体），**一次都不会动这个计数器**。
   *    实测证据：`possess: false` 的 A 组照样有 3/8 局读到非零值。
   *    两个机制共用一个计数器名，就会得出「附身没起作用」这种**测错对象**的结论。
   */
  deathEchoCount: number;
  /** 台架**主动附身**（`requestPossess`）成功的次数 —— 这才是 `arm.possess` 真正生效的证据 */
  voluntaryPossessCount: number;
  /* ── 「附身窗口」漏斗：逐层回答「为什么主动附身几乎不触发」 ── */
  /** 玩家**活着**且血量低于 `POSSESS_HP_RATIO` 的帧数 */
  lowHpFrames: number;
  /** 上一层的帧里，**队里还有人**的帧数（没有 → 是游戏设计问题：队员先死光） */
  lowHpWithSquadFrames: number;
  /** 再叠上台架自己的 `f % 30 === 0` 采样门之后的帧数（掉到 0 → 是台架毛病） */
  gateFrames: number;
  /** 门开了、且找到了合格目标（半径 ≥ 0.8× 且血更多）的帧数 */
  candidateFrames: number;
  /** 门开了、且**单看半径**有合格成员的帧数（把 ④ 的两个条件拆开） */
  radiusOkFrames: number;
  /** 门开了、且**单看血量**有合格成员的帧数（把 ④ 的两个条件拆开） */
  healthOkFrames: number;
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
  state: GameState,
  tuning?: BrainTuning
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
    // 半径那一半的判据在 brainVision.ts —— 中间 ±5% 那条带子既不躲也不追，
    // 是「被同级鱼磨死」这类读数的真正来源，所以它现在有独立用例钉着（不再是裸字面量）。
    if (d < threatD && canHarm(e, p) && isThreatByRadius(p.radius, e.radius, tuning)) {
      threat = e;
      threatD = d;
    }
    if (d < preyD && canHarm(p, e) && isPreyByRadius(p.radius, e.radius, tuning)) {
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
  prefer?: Entity,
  tuning?: BrainTuning
): { mouse: { x: number; y: number }; boost: boolean } => {
  const p = state.player;
  const { threat, threatD, prey } = scan(state, tuning);

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
    // 台架**自己**成功附身的次数。`state.squad.possessCount` 只数亡语，数不到这个（见接口注释）
    let voluntaryPossessCount = 0;
    /* 附身窗口漏斗（见循环里的注释）：逐层回答「为什么几乎不触发」 */
    let lowHpFrames = 0;
    let lowHpWithSquadFrames = 0;
    let gateFrames = 0;
    let candidateFrames = 0;
    /* ④ 层内部再拆：两个条件各自单独数（见循环里的注释） */
    let radiusOkFrames = 0;
    let healthOkFrames = 0;
    let framesSurvived = 0;
    let endReason: EndReason = 'SURVIVED';
    let squadSizePeak = getSquadMembers(state).length;
    const deaths: DeathInfo[] = [];
    const memberDeaths: MemberDeathInfo[] = [];
    let bossFrames = 0;
    let maxLiveBosses = 0;
    let bossEntityFrames = 0;
    /**
     * 整局里「t4 生物从场上消失」的次数。
     *
     * 「BOSS 会堆到 68 条」这个读数最容易被质疑的一点是「也许它们在不断被吃掉，
     * 只是刷得更快」。这个计数器直接回答它：**离场的到底有几条**。
     */
    let tier4Removed = 0;
    let prevT4Ids = new Set<string>();
    /**
     * 每个队员「BOSS 从哪一帧开始贴在身边」。
     *
     * 用**连续窗口**而不是「第一次靠近」：队员可能路过一条 BOSS 又跑开，
     * 记「第一次」会把那段无关的时长算进提前量里，把预警窗口读大。
     */
    const bossCloseSince = new Map<string, number>();

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

      // ── BOSS 密度 + 「BOSS 已经贴到队员身边多久了」 ──
      // 全实体只扫**一次**（不是每个队员各扫一次），顺便把 t4 的存活集合建出来 ——
      // 「只进不出」这个说法必须靠「整局有几条 t4 真的离场了」来证，不能靠推理。
      const liveBossList: Entity[] = [];
      const liveT4Ids = new Set<string>();
      for (const e of state.entities) {
        if (e.health <= 0 || e.config.tier !== 4) continue;
        liveT4Ids.add(e.id);
        if (e.config.behavior === 'BOSS') liveBossList.push(e);
      }
      if (liveBossList.length > 0) bossFrames += 1;
      if (liveBossList.length > maxLiveBosses) maxLiveBosses = liveBossList.length;
      bossEntityFrames += liveBossList.length;
      for (const id of prevT4Ids) if (!liveT4Ids.has(id)) tier4Removed += 1;
      prevT4Ids = liveT4Ids;
      for (const m of members) {
        const near = liveBossList.some(
          (b) => Math.hypot(b.x - m.x, b.y - m.y) < b.radius + m.radius + BOSS_WARN_DIST
        );
        if (near) {
          if (!bossCloseSince.has(m.id)) bossCloseSince.set(m.id, f);
        } else {
          // 连续窗口：跑开了就重新计时，否则会把无关的时长算进提前量
          bossCloseSince.delete(m.id);
        }
      }

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

      /**
       * **「附身窗口」的逐层漏斗** —— 回答「为什么主动附身几乎不触发」。
       *
       * 动机：实测 C 组只有 2/8 局触发过主动附身，`B ≡ C` 在 6/8 个种子上是**同一条时间线**。
       * 于是 `B → C` 的 ×1.00 **不是**「附身无效」，而是「附身基本没发生」。
       * 但「没发生」有三种完全不同的原因，对策也完全不同，必须逐层分开数：
       *   ① `lowHpFrames == 0`          → 玩家**从没**在活着的时候掉到 35% 以下（被一击带走）
       *   ② `lowHpWithSquadFrames == 0` → 掉到 35% 时**队里已经没人了**（游戏设计：队员先死光）
       *   ③ `gateFrames == 0` 而 ② > 0  → 窗口开着，但被 `f % 30 === 0` 的采样错过（**台架**毛病）
       *   ④ `gateFrames > 0` 却没成功     → 卡在目标筛选（半径 ≥ 0.8× / 血更多）或 `requestPossess` 拒绝
       * 这四层数字决定这条发现该记在**游戏**头上还是**台架**头上。
       */
      if (hpRatio < POSSESS_HP_RATIO) {
        lowHpFrames += 1;
        if (members.length > 0) {
          lowHpWithSquadFrames += 1;
          if (f % 30 === 0) gateFrames += 1;
        }
      }

      if (arm.possess && hpRatio < POSSESS_HP_RATIO && members.length > 0 && f % 30 === 0) {
        /**
         * ④ 层内部要拆成两个条件分别数 —— 它们指向两条完全不同的改法：
         *   · 卡在**半径** → 「玩家长大后，队里没有一条鱼的身体大到值得换」→ 要么放开缩水、要么让队员也长
         *   · 卡在**血量** → 「队员和你一样残」→ 那是队员自保 / 治疗的问题
         *
         * ⚠️⚠️ **必须先数、后附身。** `requestPossess` 是**当场换身体**的，
         *    它一执行 `p.radius` / `p.health` 立刻就变成**新身体**的值。
         *    这两个计数器原来写在附身之后，于是量到的是「换完之后的玩家」，
         *    出现 `candidateFrames(7) > radiusOkFrames(6)` 这种**逻辑上不可能**的数。
         *    抓到它的是下面那条 `cand <= radiusOk` 不变量断言 —— 不是靠肉眼看数字。
         */
        if (members.some((m) => m.radius >= p.radius * 0.8)) radiusOkFrames += 1;
        if (members.some((m) => m.health > p.health)) healthOkFrames += 1;

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
        /**
         * `candidateFrames` = **两个条件同时满足**的帧（真正可执行的窗口）。
         * ⚠️ 原来这里写的是 `if (best)` —— 那只是「半径过关」，和 `radiusOkFrames`
         *    是同一个数，等于没拆。必须带上血量条件，它才是 ④ 的交集。
         */
        if (best && best.health > p.health) {
          candidateFrames += 1;
          if (requestPossess(state, best.id)) voluntaryPossessCount += 1;
        }
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
      // 半径要**帧初**取：夺舍之后 `p` 已经换了身体，半径是新那条鱼的，
      // 而「大脑当时看得见凶手吗」问的是**死掉的那个身体**（见 test/brainVision.ts）
      const radiusBefore = p.radius;
      const possessBefore = state.squad.possessCount;

      // 记下这一帧的队员（对象引用 + 帧初血量），下一帧比对谁不见了
      const trackedMembers = members.map((m) => ({ id: m.id, ref: m, hp: m.health }));

      const { mouse, boost } = think(state, controlled, arm.brain);
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
            memberSpeed: t.ref.speed,
            memberMaxHealth: t.ref.maxHealth,
            hpBefore: t.hp,
            killerSpeed: killer?.speed,
            killerBehavior: killer?.config.behavior,
            killerDamage: killer?.config.damage,
            memberRadius: t.ref.radius,
            killerRadius: killer?.radius,
            // 「是谁把队员带进 BOSS 圈的」：玩家也在圈内 = 跟着玩家进去的
            playerDistToKiller: killer
              ? Math.round(Math.hypot(killer.x - p.x, killer.y - p.y))
              : undefined,
            playerRadius: p.radius,
            bossLeadFrames: bossCloseSince.has(t.id)
              ? f - (bossCloseSince.get(t.id) as number)
              : undefined,
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
          playerRadius: radiusBefore,
          killerRadius: killer?.radius,
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
      bossFrames,
      maxLiveBosses,
      bossEntityFrames,
      tier4Removed,
      eaten,
      evolutions,
      deathEchoCount: state.squad.possessCount,
      voluntaryPossessCount,
      lowHpFrames,
      lowHpWithSquadFrames,
      gateFrames,
      candidateFrames,
      radiusOkFrames,
      healthOkFrames,
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

/**
 * **变体大脑 v4：更谨慎的猎物选择。**
 *
 * 动机来自 §22.13 的实测：玩家死亡里 **49%** 的凶手，是大脑自己判定为「猎物」
 * 并**主动朝它游过去**的那一类。也就是说台架的死亡统计里混着它自己的进攻策略，
 * 不是游戏难度 —— 而 §22.2 的规矩正是「换个合理的大脑参数重跑，结论还在不在」。
 *
 * 真人会挑软的打，所以这一版把「猎物」门槛从 `0.95×` 收紧到 `0.75×`：
 * **只打明显比自己小的，和自己差不多的不碰**（顺带把那条 ±5% 盲带变成「一律不追」）。
 * 威胁那一侧**一点没动**（仍然是 `1.05×`）—— 一次只改一个轴，否则分不清是哪个在起作用。
 *
 * ⚠️ 只改**参数**，不改规则：规则仍然只有 `brainVision.ts` 那一份。
 */
const CAUTIOUS_BRAIN: BrainTuning = { threatMult: THREAT_RADIUS_MULT, preyMult: 0.75 };

/**
 * **变体臂**：换一版大脑参数重跑，但**刻意不进 `ARMS`**。
 *
 * ⚠️ 为什么不放进 `ARMS`：`ARMS` 是「全 9 组」这个**分母本身** ——
 * 死因分析、队员损失诊断、§22.13 的凶手分类、§22.14 的 BOSS 密度全都对它求和。
 * 往里面塞一组，上面所有**已经写进文档**的比例会静默改变，而文档里写死的是旧分母。
 * 变体只服务于它自己那条用例。
 */
const BRAIN_VARIANT_ARMS: Record<string, ArmConfig> = {
  A4: {
    name: '变体大脑 · 只顾自己（更谨慎的猎物选择）',
    commands: false,
    possess: false,
    stripRoles: false,
    roleAware: false,
    brain: CAUTIOUS_BRAIN,
  },
  /**
   * `B4` 是**为了把「操作」拆开**才存在的：默认大脑那边本来就有 A → B → C 三档
   * （A 什么都不做 / B 只下令 / C 下令+附身），所以「操作」的收益能定位到**哪一步**。
   * v4 只跑了 A4 / C4，于是 §22.15 只能报「整体翻负」，说不出是**指令**还是**附身**翻的。
   * 补上这一档，两版大脑就能逐段对照。
   */
  B4: {
    name: '变体大脑 · 只下令（更谨慎的猎物选择）',
    commands: true,
    possess: false,
    stripRoles: false,
    roleAware: false,
    brain: CAUTIOUS_BRAIN,
  },
  C4: {
    name: '变体大脑 · 完整操作（更谨慎的猎物选择）',
    commands: true,
    possess: true,
    stripRoles: false,
    roleAware: false,
    brain: CAUTIOUS_BRAIN,
  },
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

/** 同上，但跑的是**变体臂**（不进 `ARMS`，见 `BRAIN_VARIANT_ARMS` 的说明） */
const ensureVariantArm = async (k: string): Promise<SliceResult[]> =>
  (cache[k] ??= await runArm(BRAIN_VARIANT_ARMS[k]));

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

/** 任意指标的均值 */
const meanOf = (k: string, pick: (r: SliceResult) => number): number =>
  mean(runsOf(k).map(pick));

/**
 * **有多少局真的用上了这个能力。**
 *
 * ⚠️ 均值分不出两件完全不同的事：「从没触发过」和「触发了但没影响结果」。
 *    `B → C` 的 ×1.00 就是这两种情况的共同表象 —— 一个是**台架没跑起来**，
 *    一个是**游戏设计上附身确实无效**，对策完全相反，必须拆开看。
 */
const runsUsing = (k: string, pick: (r: SliceResult) => number): number =>
  runsOf(k).filter((r) => pick(r) > 0).length;

/**
 * **有多少个种子上，两组的整局结果一模一样。**
 *
 * 这是「比值 = ×1.00」的**第三种**可能性的直接证据：不是「无效」，也不是「没发生」，
 * 而是**两组跑出来根本是同一条时间线**（开关没接线 / 能力从未触发）。
 * 与 `pairedWins` 配合看：若 `identical == 8`，则 `pairedWins` 必然为 0，
 * 那个比值就是在拿一组和它自己比。
 */
const identicalRuns = (k1: string, k2: string): number => {
  const a = runsOf(k1);
  const b = runsOf(k2);
  let n = 0;
  for (let i = 0; i < SEEDS.length; i += 1) {
    if (
      a[i].framesSurvived === b[i].framesSurvived &&
      a[i].weight === b[i].weight &&
      a[i].eaten === b[i].eaten &&
      a[i].deathEchoCount === b[i].deathEchoCount
    ) {
      n += 1;
    }
  }
  return n;
};

/**
 * 「这一组里，能力到底有没有被执行」——一行报清均值 + 触发局数。
 *
 * ⚠️ **主动附身与亡语必须分开报**，它们同名不同物（见 `SliceResult.deathEchoCount`）：
 *    主动附身是台架**选择**做的（`arm.possess`），亡语是玩家死亡时游戏**自动**做的，
 *    每一组都有。混在一起报，就会把「附身没生效」和「附身根本没发生」读成同一件事。
 */
const firingLine = (k: string): string =>
  `下令 ${meanOf(k, (r) => r.commandsIssued).toFixed(1)}/局` +
  `（${runsUsing(k, (r) => r.commandsIssued)}/${SEEDS.length} 局触发）` +
  ` · 主动附身 ${meanOf(k, (r) => r.voluntaryPossessCount).toFixed(2)}/局` +
  `（${runsUsing(k, (r) => r.voluntaryPossessCount)}/${SEEDS.length} 局触发）` +
  ` · 亡语 ${meanOf(k, (r) => r.deathEchoCount).toFixed(2)}/局` +
  `（${runsUsing(k, (r) => r.deathEchoCount)}/${SEEDS.length} 局触发）`;

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
   * 放行条件之一：**操作能改变结果**（默认大脑下）。
   *
   * ⚠️ **这条已经不能当放行判据了（2026-09-19）** —— 见下面那条鲁棒性用例：
   *    换成「更谨慎的猎物选择」的大脑（v4，而且是一版**更强**的大脑：
   *    中位存活 4104 > 2513、体重 649 > 515），同一对比从 ×1.30 / 配对 5/8
   *    **翻转成 ×0.86 / 配对 2/8**。按 §22.2 的规矩（「结论不在，就别拿它判放行」），
   *    这条断言降级为**默认大脑的回归守卫** —— 它仍然要绿，但**不许再写进放行结论**。
   *
   * 阈值卡 **1.15** 而不是实测的 1.30，是刻意留余量：8 个种子的中位数本身会漂，
   * 卡到实测值上等于埋一颗「下次动任何数值就红」的雷（而且红了分不清是回归还是噪声）。
   */
  it('操作能改变结果（默认大脑）：完整操作组的中位存活高于「只顾自己」', async () => {
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
   * **放行结论的鲁棒性：换成「更谨慎的猎物选择」的大脑，×1.30 还成立吗？**
   *
   * §22.2 定下的规矩是「**换个合理的大脑参数重跑，结论还在不在**；不在，就别拿它判放行」。
   * 上面那条「操作能改变结果」是**唯一活下来的放行断言**，此前只用过两版大脑
   * （v1 固定逃跑距离 / v2 按体型缩放）。而 §22.13 刚给出一个**新的、更硬的理由**去怀疑它：
   * 玩家死亡里 **49%** 的凶手是大脑**主动朝它游过去**的猎物 ——
   * 台架的进攻策略本身在制造死亡，而「下不下令」恰好会改变这个策略。
   *
   * 所以只改**一个轴**：猎物门槛 `0.95× → 0.75×`（只打明显比自己小的），
   * 威胁侧一点没动 —— 一次改一个轴，否则分不清是哪个在起作用。
   *
   * ⚠️ **先写死后跑分**：判定标准预先定死 ——
   *    「中位存活比 ≥ 1.15 **且** 同种子配对胜 ≥ 5/8」两条都满足，才算结论仍在。
   *    只中一条、或方向反过来，就说明这条放行结论**依赖大脑的进攻性**，不能单独拿它判放行。
   */
  it('放行结论鲁棒性：换成「更谨慎」的大脑，操作还能改变结果吗（并拆开指令 / 附身）', async () => {
    await ensureArm('A');
    await ensureArm('B');
    await ensureArm('C');
    await ensureVariantArm('A4');
    await ensureVariantArm('B4');
    await ensureVariantArm('C4');

    const baseRatio = medianSurvival('C') / medianSurvival('A');
    const baseWins = pairedWins('C', 'A');
    const v4Ratio = medianSurvival('C4') / medianSurvival('A4');
    const v4Wins = pairedWins('C4', 'A4');
    // 成长维度也要看：更谨慎会不会把「吃得到东西」一起赔进去
    const baseWeight = meanWeight('C') / meanWeight('A');
    const v4Weight = meanWeight('C4') / meanWeight('A4');

    /**
     * 把「操作」拆成两步 —— A→B 是**只加指令**，B→C 是**再加附身**。
     *
     * 为什么要拆：§22.15 只跑了 A4 / C4，于是只能报「整体翻负」，
     * **说不出是「指令」还是「附身」翻的**。而这两者的对策完全相反 ——
     * 指令问题是队形 / 目标选择，附身问题是「残血换身体是不是一次降级」。
     */
    const step = (from: string, to: string): string =>
      `${medianSurvival(from)} → ${medianSurvival(to)}` +
      `（×${(medianSurvival(to) / medianSurvival(from)).toFixed(2)}）` +
      ` 配对胜 ${pairedWins(to, from)}/${SEEDS.length}`;

    const holds = v4Ratio >= 1.15 && v4Wins >= 5;
    console.log(
      `操作收益的鲁棒性（只换大脑的猎物门槛 0.95× → 0.75×）· 并拆开「指令」与「附身」：\n` +
        `  默认大脑：只顾自己 → 只下令      ${step('A', 'B')}\n` +
        `            只下令   → 下令+附身   ${step('B', 'C')}\n` +
        `            合计（只顾自己 → 完整操作）${step('A', 'C')}` +
        ` · 体重 ${Math.round(meanWeight('A'))} → ${Math.round(meanWeight('C'))}（×${baseWeight.toFixed(2)}）\n` +
        `  谨慎大脑：A4 → B4               ${step('A4', 'B4')}\n` +
        `            B4 → C4               ${step('B4', 'C4')}\n` +
        `            合计（A4 → C4）        ${step('A4', 'C4')}` +
        ` · 体重 ${Math.round(meanWeight('A4'))} → ${Math.round(meanWeight('C4'))}（×${v4Weight.toFixed(2)}）\n` +
        // ⚠️ 上面那三个比值只有在**能力真的被执行过**时才有意义。下面这四行是它们的
        //    「前提是否成立」——没有这四行，×1.00 既可能是「附身无效」，
        //    也可能是「附身一次都没发生」，两者对策完全相反（见 firingLine 的说明）。
        `  能力实际触发情况（比值的前提）：\n` +
        `    B  ${firingLine('B')}\n` +
        `    C  ${firingLine('C')}\n` +
        `    B4 ${firingLine('B4')}\n` +
        `    C4 ${firingLine('C4')}\n` +
        // ⚠️ 只报「有没有触发」还不够：还要知道**多少个种子上两组跑出的是同一条时间线**。
        //    同一条时间线 = 那一步在那些种子上等于没做，比值是被剩下的种子拽出来的。
        `  两组跑出同一条时间线的种子数（B/C、B4/C4）：` +
        `B≡C ${identicalRuns('B', 'C')}/${SEEDS.length}` +
        ` · B4≡C4 ${identicalRuns('B4', 'C4')}/${SEEDS.length}\n` +
        `  判定标准（预先定死）：中位存活比 ≥ 1.15 且 配对胜 ≥ 5/8\n` +
        (holds
          ? '  → 结论仍在：换这版大脑，「操作能改变结果」照样成立'
          : '  → ⚠️ 结论没扛住：这条放行断言依赖大脑的进攻性，不能单独拿它判放行')
    );

    /**
     * **臂开关的接线自检**（不是放行判定，是台架正确性）。
     *
     * 为什么必须有：如果 `commands` / `possess` 这两个开关**接线断了**，
     * A / B / C 会静默变成同一组，所有比值一律读成 ×1.00，
     * 而**每一条用例都照样是绿的** —— 这正是本项目踩过的坑
     * （见 guard 37：`d.playerRadius ?? d.memberRadius` 静默换了受害者，
     * 分类 92/5/5 → 51/10/41 而总数和测试全都没变）。
     *
     * ⚠️ 这一版断言**踩过一次坑才写对**：第一版断言的是 `state.squad.possessCount`，
     *    结果 `possess: false` 的 A 组照样报 0.375 —— 因为那个计数器只数**亡语**。
     *    所以这里必须断言 `voluntaryPossessCount`（台架自己的 `requestPossess`），
     *    它才是 `arm.possess` 的直接证据。断言测错字段 = 白测。
     */
    expect(meanOf('A', (r) => r.commandsIssued), 'A 组（不下令）不该发出任何指令').toBe(0);
    expect(meanOf('B', (r) => r.commandsIssued), 'B 组（下令）必须真的下过令').toBeGreaterThan(0);
    expect(meanOf('A', (r) => r.voluntaryPossessCount), 'A 组（不附身）不该主动附身').toBe(0);
    expect(meanOf('B', (r) => r.voluntaryPossessCount), 'B 组（不附身）不该主动附身').toBe(0);
    expect(meanOf('B4', (r) => r.voluntaryPossessCount), 'B4 组（不附身）不该主动附身').toBe(0);
    /**
     * ⚠️ 这一条是**本次真正想知道的东西**，也是最可能红的一条：
     *    如果 C / C4 的主动附身**一次都没成功**，那么 `B → C` 的 ×1.00 就不是
     *    「附身无效」，而是「**附身根本没发生**」—— 上面那个比值测的是空气。
     *    真红了就照实记「这条比值不成立」，**不许把断言改成观测值**。
     */
    expect(
      meanOf('C', (r) => r.voluntaryPossessCount),
      'C 组必须真的主动附身过 —— 否则 B→C 的比值测的是空气'
    ).toBeGreaterThan(0);
    expect(
      meanOf('C4', (r) => r.voluntaryPossessCount),
      'C4 组必须真的主动附身过 —— 否则 B4→C4 的比值测的是空气'
    ).toBeGreaterThan(0);
    // 亡语是每一组都有的自动机制，不该被当成「台架的操作」来读
    expect(
      meanOf('A', (r) => r.deathEchoCount),
      'A 组（不附身）也应当有亡语 —— 它由游戏自动触发，与 arm.possess 无关'
    ).toBeGreaterThan(0);

    // 只报判定，不写死方向 —— 达不到就照实说「没扛住」，别把断言改成观测值
    expect(typeof holds).toBe('boolean');
  });

  /**
   * **主动附身为什么几乎不触发？** —— 把「附身窗口」拆成四层漏斗。
   *
   * 背景（上一轮实测）：C 组只有 **2/8** 局触发过主动附身，`B ≡ C` 在 **6/8** 个种子上
   * 是**同一条时间线**。所以 `B → C` 的 ×1.00 **不是**「附身无效」，而是
   * 「**附身基本没发生**」—— 那个比值在 6/8 的种子上是在拿一组和它自己比。
   * 于是 §22.15 留下的那句「最可疑的是附身」**当场被否掉**：一个只在 2/8 局里
   * 发生过的动作，解释不了一个中位数级别的翻转。
   *
   * 但「没发生」本身有三种原因，**责任方完全不同**，必须逐层数清：
   *   ① `lowHpFrames == 0`          → 玩家从没在活着时掉到 35% 以下 → **游戏**（被一击带走）
   *   ② `lowHpWithSquadFrames == 0` → 掉到 35% 时队里已经没人 → **游戏**（队员先死光，附身没有载体）
   *   ③ `gateFrames == 0` 而 ② > 0  → 窗口开着却被 `f % 30 === 0` 采样错过 → **台架**毛病，可修
   *   ④ `gateFrames > 0` 却没成功     → 卡在目标筛选（半径 ≥ 0.8× / 血更多）→ **设计**（换身体不划算）
   *
   * 只跑 C 一组（8 种子，约 90 秒）：要回答的是「窗口为什么不开」，
   * 而窗口是由游戏状态决定的，换大脑只改变长度、不改变机制。
   */
  it('主动附身为什么几乎不触发：窗口没开、队员先死光，还是台架自己错过了', async () => {
    await ensureArm('C');
    const rs = runsOf('C');
    const sum = (pick: (r: SliceResult) => number): number =>
      rs.reduce((a, r) => a + pick(r), 0);

    const low = sum((r) => r.lowHpFrames);
    const lowSquad = sum((r) => r.lowHpWithSquadFrames);
    const gate = sum((r) => r.gateFrames);
    const cand = sum((r) => r.candidateFrames);
    const fired = sum((r) => r.voluntaryPossessCount);
    const echo = sum((r) => r.deathEchoCount);
    const radiusOk = sum((r) => r.radiusOkFrames);
    const healthOk = sum((r) => r.healthOkFrames);
    const totalFrames = sum((r) => r.framesSurvived);
    /** 有多少局**从来没进过**这一层 —— 比总数更能说明「是普遍现象还是个别局」 */
    const runsAt = (pick: (r: SliceResult) => number): number =>
      rs.filter((r) => pick(r) > 0).length;
    const pct = (n: number): string => `${((n / (totalFrames || 1)) * 100).toFixed(1)}%`;

    console.log(
      `主动附身的窗口漏斗（C 组 · 8 局 · 合计 ${totalFrames} 帧，每局上限 10800）：\n` +
        `  ① 活着且血 < 35% 的帧          ${low} 帧（${pct(low)} 的存活时间 · ${runsAt((r) => r.lowHpFrames)}/8 局出现过）\n` +
        `  ② 其中「队里还有人」的帧        ${lowSquad} 帧（占 ① 的 ${((lowSquad / (low || 1)) * 100).toFixed(0)}% · ${runsAt((r) => r.lowHpWithSquadFrames)}/8 局）\n` +
        `  ③ 再叠上台架 f%30 采样门        ${gate} 帧（占 ② 的 ${((gate / (lowSquad || 1)) * 100).toFixed(1)}% · ${runsAt((r) => r.gateFrames)}/8 局）\n` +
        `  ④ 其中找得到合格目标            ${cand} 帧（占 ③ 的 ${((cand / (gate || 1)) * 100).toFixed(0)}% · ${runsAt((r) => r.candidateFrames)}/8 局）\n` +
        `     ④ 拆开看两个条件（各自单独数，都拿 ③ 当分母）：\n` +
        `        单看半径（有成员 ≥ 0.8× 玩家体型）${radiusOk} 帧（${((radiusOk / (gate || 1)) * 100).toFixed(0)}% 的 ③）\n` +
        `        单看血量（有成员血比玩家多）      ${healthOk} 帧（${((healthOk / (gate || 1)) * 100).toFixed(0)}% 的 ③）\n` +
        `  → 真正附身成功 ${fired} 次 · 亡语（自动）${echo} 次\n` +
        `  读法：哪一层掉得最狠，责任就在那一层 —— ① / ② 记游戏头上，③ 记台架头上，④ 记设计头上；\n` +
        `        ④ 内部再按「半径 vs 血量」分：半径是「玩家长大后没身体可换」，血量是「队员也残」`
    );

    /**
     * **漏斗必须单调**：这是纯粹的结构不变量（后一层的计数条件严格强于前一层），
     * 不是对游戏内容的判断，所以可以断言。它同时保证这四个计数器没有接错线 ——
     * 如果 `gateFrames` 忘了带 `lowHpWithSquadFrames` 的条件，这里会立刻红。
     */
    expect(cand, '④ 必须 ⊆ ③').toBeLessThanOrEqual(gate);
    expect(gate, '③ 必须 ⊆ ②').toBeLessThanOrEqual(lowSquad);
    expect(lowSquad, '② 必须 ⊆ ①').toBeLessThanOrEqual(low);
    // 两个单独条件各自都**必须 ≥ 合并后的 candidateFrames**：合并是两个条件的交集，
    // 交集不会比任何一侧大。接错线（比如把 some 写成 every）会立刻违反这条。
    expect(cand, '④（交集）不可能大于「单看半径」').toBeLessThanOrEqual(radiusOk);
    expect(cand, '④（交集）不可能大于「单看血量」').toBeLessThanOrEqual(healthOk);
    expect(radiusOk, '单看半径 ⊆ ③').toBeLessThanOrEqual(gate);
    expect(healthOk, '单看血量 ⊆ ③').toBeLessThanOrEqual(gate);

    /**
     * 附身成功次数不能超过「门开了且有目标」的帧数 —— 每个成功都必须有一次候选帧。
     * ⚠️ 反过来说：若 `cand > 0` 而 `fired === 0`，说明卡在 `best.health > p.health`
     *    或 `requestPossess` 的拒绝上，那是**另一条**要单独查的线索，不能混进上面四层。
     */
    expect(fired, '成功次数必须 ≤ 候选帧数').toBeLessThanOrEqual(cand);
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
   * **队员死的时候，「逃跑」到底是不是一个可行的选项？**
   *
   * 这条是「**该不该给队员加自保**」的**前提**，比结论本身重要：
   *   · 凶手本来就比队员慢 → 逃跑物理上可行，自保是个真杠杆，值得做
   *   · 凶手更快 / 是 BOSS   → 加多少逃跑逻辑都是白加，
   *     该往队形（FQ-05）、预警（FQ-09）、数值（FQ-04）上使劲
   *
   * 另记**死时血量占比**：中位接近 100% = 多是被一口带走（自保也来不及反应，
   * 要的是「提前预警」）；中位偏低 = 是被磨死的（自保才真能救下来）。
   *
   * 只报数不断言（唯一硬断言是「数据真的采到了」）。
   */
  it('队员死时跑得掉吗：凶手速度 vs 队员速度（决定「该不该加自保」的前提）', async () => {
    // `squad.ts` 的 updateMovement 追击时会把速度乘这个系数，比较时必须还原
    const CHASE_MULT = 1.25;
    for (const k of ['E', 'C3']) await ensureArm(k);

    const describe = (k: string): string => {
      const all = runsOf(k).flatMap((r) => r.memberDeaths);
      const known = all.filter((d) => d.killerSpeed !== undefined);
      const escapable = known.filter(
        (d) => d.killerBehavior !== 'BOSS' && d.memberSpeed * CHASE_MULT > (d.killerSpeed as number)
      ).length;
      const bosses = all.filter((d) => d.killerBehavior === 'BOSS').length;
      const hpRatios = all
        .filter((d) => d.memberMaxHealth > 0)
        .map((d) => d.hpBefore / d.memberMaxHealth)
        .sort((a, b) => a - b);
      const medianHp = hpRatios.length ? hpRatios[Math.floor(hpRatios.length / 2)] : 0;
      const lowHp = hpRatios.filter((r) => r < 0.3).length;
      return (
        `${k} 组（损失 ${all.length} 人次）：\n` +
        `    可逃（队员 1.25× 追击速度仍快过凶手，且凶手不是 BOSS）：${escapable}/${known.length}\n` +
        `    凶手是 BOSS（基本不可逃）：${bosses}/${all.length}\n` +
        `    死时已残血（< 30% 血）：${lowHp}/${all.length}` +
        ` · 死时血量占比中位 ${(medianHp * 100).toFixed(0)}%`
      );
    };

    console.log(`队员「跑得掉吗」诊断（速度是代理指标：野鱼另有 FRENZY / 生物群系倍率，未计入）\n  ${describe('E')}\n  ${describe('C3')}`);
    expect(runsOf('E').flatMap((r) => r.memberDeaths).length).toBeGreaterThan(0);
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
   * **「弱玩家阶段被同级鱼磨死（46%）· 头号凶手电鳗」这句话，说的是谁？**
   *
   * 起因：《开发任务清单》把它记成了一条**给玩家**的问题 ——
   * 「看真人开局前 60 秒：是『电鳗太凶』还是『玩家没学会躲』？」
   * 但那个 46% 与「电鳗×9」出自 **§22.11 的队员损失表**（`memberDeaths`），
   * 而 `deaths`（玩家死亡）是**另一个数组**。两个种群混在一起数，
   * 就会把一条**队员**结论当成**玩家**证据用 —— 和之前两条假证据同一类错误，
   * 而且它会让真人带着「电鳗是主要威胁」的预设进场。
   *
   * 顺带把 `test/brainVision.ts` 那条 **±5% 盲带**量出来：
   * 凶手落在盲带里 = 大脑**既不躲也不追**，这种死亡跟「数值太凶」无关，是**规则**的结果。
   * 凶手落在「猎物」桶里更糟 —— 那是大脑**主动朝凶手游过去**。
   *
   * 只报数不断言（硬断言只有「半径真的采到了」）。
   */
  it('「被同级鱼磨死」是谁的结论：玩家死亡与队员损失必须分开数（含大脑盲带）', async () => {
    for (const k of Object.keys(ARMS)) await ensureArm(k);

    const playerDeaths = Object.keys(ARMS).flatMap((k) => runsOf(k).flatMap((r) => r.deaths));
    const memberDeaths = ['E', 'C3'].flatMap((k) => runsOf(k).flatMap((r) => r.memberDeaths));

    /** 两边都有的字段 —— 用交集类型接住 `DeathInfo` / `MemberDeathInfo` 两种记录 */
    type AnyDeath = {
      killerType?: string;
      killerRadius?: number;
      playerRadius?: number;
      memberRadius?: number;
    };

    const topKillers = (types: Array<string | undefined>): string => {
      const m = new Map<string, number>();
      for (const t of types) if (t) m.set(t, (m.get(t) ?? 0) + 1);
      return (
        [...m.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([n, c]) => `${n}×${c}`)
          .join('  ') || '（无）'
      );
    };

    /**
     * ⚠️ **受审者的半径必须由调用方显式给出，不能用 `d.playerRadius ?? d.memberRadius` 兜底。**
     *
     * 这里踩过一次真坑：`DeathInfo` 与 `MemberDeathInfo` **两个类型都有 `playerRadius`**
     * （前者=玩家自己，后者=死时玩家在哪），于是给队员那条记录补上 `playerRadius` 之后，
     * `??` 的左边突然有了值 —— 分类基准**从「队员的半径」静默变成「玩家的半径」**，
     * 队员那一栏从 92/5/5 变成 51/10/41，而**总数 102 一个没变**，
     * 用例照样全绿。是拿两次运行的输出逐行对比才发现的。
     * → 所以这里把「谁是受审者」变成**签名的一部分**，让选错字段这件事写不出来。
     */
    const describeSide = (
      label: string,
      ds: AnyDeath[],
      victimRadius: (d: AnyDeath) => number | undefined
    ): string => {
      const known = ds.filter(
        (d) => victimRadius(d) !== undefined && d.killerRadius !== undefined
      );
      const verdictOf = (d: AnyDeath): string =>
        classifyByRadius(victimRadius(d) as number, d.killerRadius as number);
      const counts = { threat: 0, prey: 0, ignored: 0 };
      for (const d of known) counts[verdictOf(d) as 'threat' | 'prey' | 'ignored'] += 1;
      const pct = (n: number): string =>
        known.length ? `${Math.round((n / known.length) * 100)}%` : '—';
      const killersIn = (v: string): string =>
        topKillers(known.filter((d) => verdictOf(d) === v).map((d) => d.killerType));
      return (
        `${label}（${ds.length} 次，可判定 ${known.length}）：\n` +
        `    凶手是威胁（大脑会躲）：${counts.threat}（${pct(counts.threat)}）` +
        ` — ${killersIn('threat')}\n` +
        `    凶手在盲带（大脑看不见）：${counts.ignored}（${pct(counts.ignored)}）` +
        ` — ${killersIn('ignored')}\n` +
        `    凶手是猎物（大脑**主动扑**）：${counts.prey}（${pct(counts.prey)}）` +
        ` — ${killersIn('prey')}\n` +
        `    常见凶手（合计）：${topKillers(ds.map((d) => d.killerType))}`
      );
    };

    console.log(
      `「被同级鱼磨死」是谁的结论（凶手按 brainVision 的半径规则分类）\n` +
        `  ${describeSide('玩家死亡（全 9 组）', playerDeaths, (d) => d.playerRadius)}\n` +
        `  ${describeSide('队员损失（E + C3）', memberDeaths, (d) => d.memberRadius)}`
    );

    // 硬断言：半径必须真的采到了 —— 采不到就说明追踪逻辑坏了，别让它静默变成 0
    expect(
      playerDeaths.filter((d) => d.killerRadius !== undefined).length,
      '玩家死亡记录里应当采到凶手半径'
    ).toBeGreaterThan(0);
    expect(
      memberDeaths.filter((d) => d.killerRadius !== undefined).length,
      '队员损失记录里应当采到凶手半径'
    ).toBeGreaterThan(0);
  });

  /**
   * **强玩家阶段的队员死在 BOSS 手上（49%）—— 是谁把他们带进去的？**
   *
   * §22.11 记下了这个比例，但它说不出**对策**：三种成因的改法完全不同 ——
   *   · BOSS **太密** → 调刷新（`spawn.ts` 的等级上限 / `MAX_ENTITIES`）
   *   · **预警不够** → 做提示（FQ-09）；但如果提前量本来就只有几帧，提示也救不了
   *   · **队员跟着玩家一起走进 BOSS 圈** → 队形 / 自保（与 §22.11 同源）
   *
   * 所以记三个量：BOSS 密度（分母）、死时**玩家**离凶手多远、死前 BOSS 已贴了多久。
   * 判据：「玩家也在 BOSS 圈内」= 玩家到凶手的距离 < 凶手半径 + 玩家半径。
   *
   * 只报数不断言（硬断言只有「数据真的采到了」）。
   */
  it('队员死在 BOSS 手上：是 BOSS 太密、预警不够，还是跟着玩家走进去的', async () => {
    for (const k of ['C3', 'E']) await ensureArm(k);

    const describe = (k: string): string => {
      const rs = runsOf(k);
      const all = rs.flatMap((r) => r.memberDeaths);
      const byBoss = all.filter((d) => d.killerBehavior === 'BOSS');
      const withDist = byBoss.filter(
        (d) =>
          d.playerDistToKiller !== undefined &&
          d.playerRadius !== undefined &&
          d.killerRadius !== undefined
      );
      const playerInside = withDist.filter(
        (d) =>
          (d.playerDistToKiller as number) <
          (d.killerRadius as number) + (d.playerRadius as number)
      ).length;
      const lead = byBoss
        .map((d) => d.bossLeadFrames)
        .filter((n): n is number => n !== undefined)
        .sort((a, b) => a - b);
      const medianLead = lead.length ? lead[Math.floor(lead.length / 2)] : 0;
      const quick = lead.filter((n) => n < 60).length; // 不到 1 秒
      const dens = rs.map((r) => (r.framesSurvived > 0 ? r.bossFrames / r.framesSurvived : 0));
      const meanDens = dens.length ? dens.reduce((a, b) => a + b, 0) / dens.length : 0;
      const maxLive = rs.length ? Math.max(...rs.map((r) => r.maxLiveBosses)) : 0;
      const totalFrames = rs.reduce((n, r) => n + r.framesSurvived, 0);
      const meanLive = totalFrames ? rs.reduce((n, r) => n + r.bossEntityFrames, 0) / totalFrames : 0;
      const t4Removed = rs.map((r) => r.tier4Removed).sort((a, b) => a - b);
      const medianT4Removed = t4Removed.length ? t4Removed[Math.floor(t4Removed.length / 2)] : 0;
      const totalT4Removed = t4Removed.reduce((a, b) => a + b, 0);

      // ⚠️ 「玩家在不在 BOSS 接触圈内」是个**过严**的口径：队形本来就摊开
      //    90~260px，玩家可以**擦着**一条半径 120 的深海巨怪绕过去，
      //    自己没进接触圈（160px），队形槽位却已经在它嘴里了。
      //    所以真正判「是不是玩家带进去的」要看**死时还在不在队形里**（≤ DETACHED_DIST）。
      const bossDists = byBoss.map((d) => d.distToPlayer).sort((a, b) => a - b);
      const medianBossDist = bossDists.length ? bossDists[Math.floor(bossDists.length / 2)] : 0;
      const inFormation = byBoss.filter((d) => d.distToPlayer <= DETACHED_DIST).length;

      return (
        `${k} 组（${rs.length} 局）：\n` +
        `    BOSS 密度：平均场上 ${meanLive.toFixed(1)} 条 · 有 BOSS 的帧占比 ` +
        `${(meanDens * 100).toFixed(0)}% · 同时存活峰值 ${maxLive}\n` +
        `    t4 **离场**：整局中位 ${medianT4Removed} 条 · ${rs.length} 局合计 ${totalT4Removed} 条\n` +
        `    死于 BOSS：${byBoss.length}/${all.length}` +
        `${all.length ? `（${Math.round((byBoss.length / all.length) * 100)}%）` : ''}\n` +
        `    死时**玩家也在 BOSS 接触圈内**（过严口径）：${playerInside}/${withDist.length}\n` +
        `    死时**还在队形里**（离玩家 ≤ ${DETACHED_DIST}px）：${inFormation}/${byBoss.length}` +
        ` · 离玩家中位 ${medianBossDist}px\n` +
        `    死前 BOSS 已贴身：中位 ${medianLead} 帧（${(medianLead / 60).toFixed(1)} 秒）` +
        ` · 不到 1 秒的 ${quick}/${lead.length}`
      );
    };

    console.log(`队员死于 BOSS 的成因分叉\n  ${describe('C3')}\n  ${describe('E')}`);
    expect(
      runsOf('C3').flatMap((r) => r.memberDeaths).filter((d) => d.killerBehavior === 'BOSS')
        .length,
      'C3 组应当有「死于 BOSS」的记录，否则追踪逻辑没生效'
    ).toBeGreaterThan(0);
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
