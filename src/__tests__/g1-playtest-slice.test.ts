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
 * 运行：`npm run test:slice`（单独配置，不进默认套件，四组约 55s）
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

interface SliceResult {
  framesSurvived: number;
  weight: number;
  level: number;
  squadSize: number;
  coreSize: number;
  /** 开局那一帧的队伍规模 —— 「预置成功了吗」要在这里看，跑完三分钟队员早换过几轮了 */
  squadSizeAtStart: number;
  coreSizeAtStart: number;
  eaten: number;
  evolutions: number;
  possessions: number;
  commandsIssued: number;
  deaths: DeathInfo[];
}

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

/** 一个「会玩」的操作大脑：躲大的、追小的。四组共用，保证只差队伍功能 */
const think = (state: GameState): { mouse: { x: number; y: number }; boost: boolean } => {
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

const runSlice = (arm: ArmConfig, seed: number): SliceResult =>
  withCleanStorage(() =>
    withSeededRandom(seed, () => {
    resetModuleState();
    const state = createInitialState({});
    state.status = GameStatus.PLAYING;
    seedSquad(state);
    const seededMembers = getSquadMembers(state);
    const squadSizeAtStart = seededMembers.length;
    // 对照组的「抹角色」必须在**取快照之前**做一次：预置是走真实收编路径的，
    // 角色已经分配好了，等进循环再抹的话开局快照里还带着 3 个核心位
    if (arm.stripRoles) for (const m of seededMembers) m.coreRole = undefined;
    const coreSizeAtStart = getSquadMembers(state).filter((m) => !!m.coreRole).length;

    let evolutions = 0;
    let commandsIssued = 0;
    let framesSurvived = 0;
    const deaths: DeathInfo[] = [];

    for (let f = 0; f < SLICE_FRAMES; f += 1) {
      // 进化面板：替玩家选第一个候选（走生产同一条 applyEvolutionChoice，不复制数值）
      if (statusOf(state) === GameStatus.EVOLVING) {
        const opt = state.evolveOptions?.[0];
        if (!opt) break;
        applyEvolutionChoice(state, opt);
        evolutions += 1;
        continue;
      }
      if (statusOf(state) === GameStatus.GAME_OVER || statusOf(state) === GameStatus.VICTORY) break;
      // 商场 / 菜单这类遮罩态世界是暂停的，别让台架卡死
      if (statusOf(state) !== GameStatus.PLAYING) state.status = GameStatus.PLAYING;

      const p = state.player;
      const members = getSquadMembers(state);
      const hpRatio = p.maxHealth > 0 ? p.health / p.maxHealth : 1;

      if (arm.commands && members.length > 0 && f % COMMAND_INTERVAL === 0) {
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

      if (arm.possess && hpRatio < POSSESS_HP_RATIO && members.length > 0 && f % 30 === 0) {
        // 换身体是**拿体型换命**：只接受「不会缩水太多」的成员，
        // 否则为了活命换成一条小鱼，结果是谁都吃不了，反而更早出局。
        let best: Entity | undefined;
        for (const m of members) {
          if (m.radius < p.radius * 0.8) continue;
          if (!best || m.health > best.health) best = m;
        }
        if (best && best.health > p.health) requestPossess(state, best.id);
      }

      if (arm.stripRoles) {
        // 对照组：能力 / 角色移动 / 速度倍率全抹掉，但弱点（血 / 伤害）留在身上
        for (const m of members) m.coreRole = undefined;
      }

      const hpBefore = p.health;
      const protectedNow = (p.invulnerableTimer ?? 0) > 0;
      const squadAliveBefore = members.length;
      const tierBefore = p.config.tier;
      const levelBefore = p.level;
      const possessBefore = state.squad.possessCount;

      const { mouse, boost } = think(state);
      updateGame(state, mouse, boost, false, false, SCREEN_W, SCREEN_H);
      framesSurvived = f + 1;

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
      framesSurvived,
      weight: Math.round(p.weight),
      level: p.level,
      squadSize: members.length,
      coreSize: members.filter((m) => !!m.coreRole).length,
      squadSizeAtStart,
      coreSizeAtStart,
      eaten,
      evolutions,
      possessions: state.squad.possessCount,
      commandsIssued,
      deaths,
    };
    })
  );

/* 四个组跑一次共享给所有用例 —— 一组 10800 帧，别每个 it 各跑一遍 */
const ARMS: Record<string, ArmConfig> = {
  A: { name: '只顾自己（不下令 / 不附身）', commands: false, possess: false, stripRoles: false },
  B: { name: '+ 指令', commands: true, possess: false, stripRoles: false },
  C: { name: '+ 指令 + 附身（完整操作）', commands: true, possess: true, stripRoles: false },
  D: { name: '完整操作，但队伍没有核心角色', commands: true, possess: true, stripRoles: true },
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
  活满三分钟: number;
  体重均值: number;
  吃掉均值: number;
}

/** 一个组在所有种子上的聚合结果 */
const cache: Record<string, SliceResult[]> = {};
const runsOf = (k: string): SliceResult[] => (cache[k] ??= SEEDS.map((s) => runSlice(ARMS[k], s)));
const aggOf = (k: string): Aggregate => {
  const rs = runsOf(k);
  return {
    组: k,
    策略: ARMS[k].name,
    存活均值: Math.round(mean(rs.map((r) => r.framesSurvived))),
    存活中位: Math.round(median(rs.map((r) => r.framesSurvived))),
    活满三分钟: rs.filter((r) => r.framesSurvived >= SLICE_FRAMES).length,
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

describe('G1 放行条件 · 3 分钟切片', () => {
  it('四个组 × 多个种子跑完，把聚合成绩打出来（人工看趋势用）', () => {
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
  it('操作能改变结果：完整操作组的中位存活高于「只顾自己」', () => {
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
  it('队伍选择：只报数，不断言方向（信号随大脑翻转，交真人切片）', () => {
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
   * 台架里四组都没能活满 3 分钟（中位 30~50 秒就出局）。台架的「操作大脑」只有
   * 躲大的 / 追小的两条规则，比真人笨得多，所以不能直接判定「游戏太难」；
   * 但**这是一个必须由真人切片回答的问题：三分钟能不能打完一局？**
   */
  it('【发现】台架四组都活不满 3 分钟 —— 留给人工切片确认', () => {
    const full = Object.keys(ARMS).map((k) => `${k}:${A(k).活满三分钟}/${SEEDS.length}`);
    console.log(`活满三分钟 ${full.join('  ')} —— 台架大脑只有两条规则，比真人笨，` +
      `这不等于「游戏太难」，但真人切片必须专门看一眼生存曲线。`);
    expect(SEEDS.length).toBeGreaterThan(0);
  });

  /**
   * **同种子跑两遍必须逐字段一致** —— 上面所有配对比较都建立在这条之上。
   *
   * 反向验证时发现「C 与 D 配置相同却跑出不同结果」，说明有漏网的非确定性来源；
   * 这条用例就是把那个来源钉住：不先证明它，配对胜场只是噪声。
   */
  it('同一种子跑两遍必须逐字段一致（否则上面的配对比较全是噪声）', () => {
    const first = runSlice(ARMS.C, SEEDS[0]);
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
  it('死因分析：把「活不过三分钟」拆成可以下手的结论', () => {
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

    console.log('\n── 死因分析（四组合计）──');
    console.log(`总死亡 ${all.length} 次 · 保护期内死亡 ${protectedDeaths} 次`);
    console.log(`凶手等级 − 玩家等级：中位 ${median(tierGaps)}（正=被更大的鱼打死）`);
    console.log('最常见的凶手：', top.map(([n, c]) => `${n}×${c}`).join('  ') || '（没抓到凶手 id）');
    const early = all.filter((d) => d.frame < 1800).length; // 30 秒内
    console.log(`开局 30 秒内死亡 ${early}/${all.length} 次`);

    // ⚠️ 这条是**唯一**的硬断言：保护期内还被打死 = 保护没生效，那是 bug
    expect(protectedDeaths, '新手保护生效时不该被打死').toBe(0);
  });

  it('预置队伍真的落到了三个核心位上（否则 C / D 的对比是空的）', () => {
    for (const r of runsOf('C')) {
      expect(r.squadSizeAtStart, 'C 组开局队伍规模').toBe(SEED_SQUAD.length);
      expect(r.coreSizeAtStart, 'C 组开局核心位数').toBe(3);
    }
    for (const r of runsOf('D')) {
      expect(r.coreSizeAtStart, 'D 组的核心位应被抹干净').toBe(0);
    }
  });
});
