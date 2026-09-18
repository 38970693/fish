/**
 * G1 放行条件 · **固定队伍对战场景**（《鱼群争霸开发计划》§G1）
 *
 * ⚠️ 先说清楚为什么还要再写一个台架 —— 《开发任务清单.md》把放行条件简写成
 * 「约 3 分钟切片中，操作与队伍选择能改变结果」，但**计划原文的放行条件是三条**：
 *
 *   > **交付**：一段约 3 分钟的**固定**战斗体验，可对比不同指令、阵容和附身操作。
 *   > **放行条件**：**能主动撤离**，**至少两种队伍决策能改变同场战斗结果**；
 *   >             没有技能友伤、无限控制或换身刷新冷却。
 *
 * `g1-playtest-slice.test.ts` 跑的是**随机世界 × 8 个种子**，它回答的是那句简写，
 * 而且实测暴露了两个它自己回答不了的问题：
 *   ① **「同场战斗」它不是同一场** —— 8 个种子是 8 个不同的世界，只能比聚合值；
 *   ② **存活帧数不是「结果」** —— 胜利条件是「击杀 BOSS 即通关」，赢得越快帧数越短，
 *      于是「赢得快」和「死得早」在数字上无法区分（实测 72 局里 35 局是提前通关）。
 *
 * 所以这里补一个**固定场景**：同一个世界、同一支队伍、同一批敌人，
 * **一次只改一个队伍决策**，看这场战斗的结果变不变。它跑得动、可回归、且逐帧确定。
 *
 * ── 四条纪律（沿用前两个台架踩出来的）──
 *   1. 整段模拟都在 `withSeededRandom` 里跑（`createInitialState` 之外系统还在吃 `Math.random`）。
 *   2. 每帧**清掉新刷出来的实体** —— 否则「固定的一场战斗」会不断被随机刷怪改写，
 *      两个决策组跑着跑着就不再是同一场战斗了（这条就是「同场」二字的落点）。
 *   3. 玩家在每组里**行为完全一致**（原地不动、不开加速），只有队伍决策不同 ——
 *      否则比的是玩家操作，不是队伍决策。
 *   4. 队伍走**真实收编路径**预置（俘虏先置死再 `recruitToSquad`），让 `assignCoreRole` 真的触发。
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { withSeededRandom } from '../test/scenario';
import { updateGame } from '../gameEngine';
import { applyEvolutionChoice } from '../systems/progression';
import {
  issueCommand,
  getSquadMembers,
  recruitToSquad,
  requestPossess,
  __resetSwitchCursor,
} from '../systems/squad';
import { __resetTeleportLock, __resetObstacleIndex } from '../systems/world';
import { createEntity } from '../systems/spawn';
import { CreatureType } from '../data/creatures';
import { MAP_SHAPE_CONFIG } from '../data/world';
import { GameStatus } from '../types';
import type { GameState, Entity } from '../types';

/**
 * 一场遭遇战的长度：**15 秒**。
 *
 * ⚠️ 别贪长：30 秒版实测四组**全都是 5/6 击杀** —— 战斗打满之后，怎么下令都一样，
 *    「决策改变结果」就无从体现（固定场景最大的风险就是一边倒）。
 *    15 秒是打不完的，于是「集火」的击杀效率、「撤离」的止损差别才露得出来。
 */
const ENCOUNTER_FRAMES = 900;
/** 下令间隔（与切片台架同口径） */
const COMMAND_INTERVAL = 60;
/** 集火射程：超出就不追（与切片台架同值，见 runEncounter 里的说明） */
const FOCUS_MAX_RANGE = 500;
const SCREEN_W = 1280;
const SCREEN_H = 720;

/**
 * 固定的一支队伍：三个核心位 + 两个普通成员（与切片台架一致，方便对照）。
 */
const SQUAD_TYPES: CreatureType[] = [
  CreatureType.PUFFER_FISH,
  CreatureType.ELECTRIC_EEL,
  CreatureType.SWORD_FISH,
  CreatureType.CLOWN_FISH,
  CreatureType.SQUID,
];

/**
 * 固定的一批敌人。
 *
 * ⚠️ 光「放几条鱼在旁边」是打不起来的：第一版就踩了这个坑 ——
 *    野鱼（CLOWN_FISH / SQUID / JELLYFISH）见到比自己大的就跑，
 *    30 秒里玩家**一滴血没掉**、敌人散到 735px 外，四组决策跑出**完全相同**的结果。
 *    「同一场战斗」首先得**真的是一场战斗**，所以敌人要满足两件事：
 *      ① `ownerId = 'rival'` —— 进敌对阵营（`canHarm` 双向成立），
 *         否则野鱼互吃会把「一场战斗」变成一场混战；
 *      ② `moodId = 'FRENZY'` —— 心境接管行为，**无视体型见谁咬谁**，
 *         不再因为「对面更大」就掉头逃跑。
 */
const ENEMY_TYPES: CreatureType[] = [
  CreatureType.KOI,
  CreatureType.KOI,
  CreatureType.KOI,
  CreatureType.KOI,
  CreatureType.KOI,
  CreatureType.SEAHORSE,
  CreatureType.SEAHORSE,
  CreatureType.SEAHORSE,
  CreatureType.SEAHORSE,
  CreatureType.SEAHORSE,
];
/** 敌对阵营 id（`factions.ts`：非 WILD 的不同阵营互相可伤害） */
const RIVAL_OWNER = 'rival';

/** 玩家与敌人、队员的站位半径 */
const ENEMY_RING = 260;
const MEMBER_RING = 70;

/**
 * 「接敌趋势」的取样帧 —— **对齐 RETREAT 的下令帧（300）**，这样
 * 「下令前 → 下令后」的差值在两组之间是可配对的。
 */
const PROBE_FRAME = 300;

interface EncounterConfig {
  name: string;
  /** 集火：每 COMMAND_INTERVAL 帧对最近的敌人下令 */
  focus?: boolean;
  /** 撤离：第 `retreatAtFrame` 帧起下令撤退 */
  retreatAtFrame?: number;
  /** 抹掉核心角色（对照：隔离出「角色」对这场战斗的贡献） */
  stripRoles?: boolean;
  /**
   * **玩家也一起撤**（鼠标指向「背对敌群质心」的方向，并开加速）。
   *
   * 这条是「能主动撤离」的必要条件，不是可选项 —— 实测**只下撤退令、玩家原地不动**时，
   * 队员会长期停在离玩家 400~620px 处、**每帧只挪 0.075px**：
   * 因为 `RETREAT` 的语义是「队形收紧 + 无视敌人」，它**没有「远离敌人」这个方向**。
   * 玩家不动 = 没有可撤的方向，队员只是停止追击而已，谈不上「脱离接触」。
   */
  playerFlees?: boolean;
  /** 第 `possessAtFrame` 帧附身到「血最多的队员」身上（离散输入走队列，下一帧生效） */
  possessAtFrame?: number;
}

interface EncounterResult {
  /** 打死的敌人数（这场战斗最直接的结果） */
  enemiesKilled: number;
  /** 全歼敌人的帧号（-1 = 没打完） */
  wipeFrame: number;
  /** 战斗结束时队伍存活数 */
  squadAlive: number;
  /** 战斗结束时玩家剩余血量比例 */
  playerHpRatio: number;
  /**
   * 结束时队员到**玩家**的平均距离 —— 「撤离」有没有真的撤回来，看它。
   *
   * ⚠️ 不要用「离敌人质心」判撤离：实测它会**被一个跑远的幸存者带飞**
   *    （6 个敌人剩 1 个跑出 4000px，质心就飘到那儿去了，四组读数全被它主导）。
   *    而 RETREAT 的**文档行为**就是「队形收紧」：`RETREAT_RALLY_GAP 40 < FOLLOW_GAP 90`、
   *    `RETREAT_DEADZONE 110 < FOLLOW_DEADZONE 260` —— 所以队员会更贴玩家，
   *    量「队员→玩家」既稳又和实现对得上。
   */
  squadToPlayerDist: number;
  /**
   * **判撤离看这个** —— 下令之后（`f >= PROBE_FRAME`）**逐帧**算「队员到玩家的中位距离」，
   * 再对帧取平均。
   *
   * ⚠️ 为什么不量「战斗结束那一刻」的距离（这是踩了两轮才想明白的）：
   *    15 秒打完之后队伍往往只剩 **2 个人**，此时「中位」就是那两个人的较大值、
   *    「均值」也可能被一个跑到两千像素外的队员带飞（实测 645 vs 中位 190）。
   *    两个数都在量**残局**，而不是量**队形**。
   *    逐帧平均则用上了**整段时间里活着的每一个队员**，对减员和离群值都免疫。
   */
  avgRallyAfterProbe: number;
  /**
   * **队员**打死的敌人数 —— 「撤离」有没有真的**停止接敌**，看它。
   *
   * RETREAT 的文档行为是「完全无视敌人」（`pickMoveTarget` 只在 GUARD 分支里
   * 调 `findGuardPrey`），所以撤退之后队员的击杀应当显著下降。
   * 用「队形收紧」判撤离是**不够的** —— 那只说明队员站得近了，
   * 不说明他们**停止进攻**了；这两件事的对策完全不同。
   */
  memberKills: number;
  /** 第 `PROBE_FRAME` 帧时，队员到最近活敌人的距离（中位）—— 和下面那个配对看「接敌趋势」 */
  nearestEnemyDistAtProbe: number;
  /** 下令之后逐帧的「队员到最近活敌人的中位距离」，对帧取平均（口径同上） */
  avgNearestEnemyAfterProbe: number;
  /** 实际跑了多少帧（没跑满 = 中途停了，这种数据不能用来下结论） */
  frames: number;
  /** 结束时的游戏状态（EVOLVING / GAME_OVER 都会让世界停摆，必须看得见） */
  endStatus: GameStatus;
}

const statusOf = (s: GameState): GameStatus => s.status;

const resetModuleState = (): void => {
  __resetTeleportLock();
  __resetObstacleIndex();
  __resetSwitchCursor();
};

/** 最近的可攻击目标（用于下令落点，避开「不带落点会选到更大的鱼」那个坑） */
const nearestHostile = (state: GameState, from: Entity): Entity | undefined => {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of state.entities) {
    if (e.health <= 0) continue;
    if (e.ownerId === 'player') continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
};

const centroid = (es: Entity[]): { x: number; y: number } => {
  if (es.length === 0) return { x: 0, y: 0 };
  return {
    x: es.reduce((a, e) => a + e.x, 0) / es.length,
    y: es.reduce((a, e) => a + e.y, 0) / es.length,
  };
};

/**
 * 队员到**最近的活敌人**的距离，取**中位**。
 *
 * ⚠️ 为什么是中位而不是「敌人质心」（文件头那条纪律的补完）：
 *    质心会被**一个跑远的幸存者带飞** —— 6 个敌人剩 1 个跑出 4000px，
 *    质心就飘到那儿去了，读数全被它主导。**中位对离群值免疫**，
 *    所以「脱离接触」这件事终于可以量了，不必退回「队形收紧」这个替代指标。
 */
const medianNearestEnemyDist = (state: GameState, enemyIds: string[]): number => {
  const enemies = state.entities.filter((e) => enemyIds.includes(e.id) && e.health > 0);
  const members = getSquadMembers(state).filter((m) => m.health > 0);
  if (enemies.length === 0 || members.length === 0) return NaN;
  const ds = members.map((m) => Math.min(...enemies.map((e) => Math.hypot(e.x - m.x, e.y - m.y))));
  ds.sort((a, b) => a - b);
  return Math.round(ds[Math.floor(ds.length / 2)]);
};

/**
 * 跑一场固定遭遇战。
 *
 * 同一个 seed + 同一份 config ⇒ 逐帧相同的结果（有用例钉住）。
 */
const runEncounter = (cfg: EncounterConfig, seed = 20260920): EncounterResult =>
  withSeededRandom(seed, () => {
    resetModuleState();
    const state = createInitialState({ skipWorldGen: true });
    state.status = GameStatus.PLAYING;

    const p = state.player;
    // ⚠️ 必须站在塘中心：第一版把遭遇战摆在 (0,0)，那是**塘外**，
    //    全员被世界边界往中心推 —— 测出来的「位移」全是边界推的，不是决策造成的。
    p.x = MAP_SHAPE_CONFIG.CENTER_X;
    p.y = MAP_SHAPE_CONFIG.CENTER_Y;

    // ⚠️ 玩家必须先「长大」：开局那条鱼是 tier 0/1 的小鱼，而这里的队伍是
    //    「三个核心位 + 两个普通成员」的中局配置 —— 拿开局小鱼配中局队伍，
    //    实测 86 帧就被秒（GAME_OVER），四组全是 0 击杀，什么都比不出来。
    //    用生产的 `applyEvolutionChoice` 进化到同级，别自己手改数值（会和 UI 走两条路）。
    applyEvolutionChoice(state, CreatureType.ELECTRIC_EEL);

    // 只留玩家：这场战斗里出现什么，由下面的固定布置说了算
    state.entities = [];

    // ⚠️ **在造的时候就记 id**，不能等跑完一帧再去「筛 ownerId !== player」。
    //    第一版就是这么写的，把 `updateGame` 那一帧**新刷出来的野鱼**也算成了敌人
    //    （敌人 8 个、分母却是 8，却数出 9 个存活 → 击杀数算出 **−1**）。
    const enemyIds: string[] = [];
    const knownIds = new Set<string>([p.id]);

    // ① 预置队伍（真实收编路径：俘虏先死，再 recruitToSquad，与 combat.ts 顺序一致）
    SQUAD_TYPES.forEach((type, i) => {
      const a = (i / SQUAD_TYPES.length) * Math.PI * 2;
      const victim = createEntity(type, p.x + Math.cos(a) * MEMBER_RING, p.y + Math.sin(a) * MEMBER_RING);
      victim.semiGhostTimer = 0;
      state.entities.push(victim);
      recruitToSquad(state, victim);
      victim.health = 0;
      knownIds.add(victim.id);
    });

    // ② 预置敌人（敌对阵营 + FRENZY 心境，保证「这真的是一场战斗」）
    ENEMY_TYPES.forEach((type, i) => {
      const a = (i / ENEMY_TYPES.length) * Math.PI * 2 + 0.3;
      const e = createEntity(type, p.x + Math.cos(a) * ENEMY_RING, p.y + Math.sin(a) * ENEMY_RING);
      e.semiGhostTimer = 0;
      e.ownerId = RIVAL_OWNER;
      e.moodId = 'FRENZY';
      // 心境会被计时器重掷，钉长一点，保证整场战斗都保持「见谁咬谁」
      e.moodTimer = 1_000_000;
      state.entities.push(e);
      enemyIds.push(e.id);
      knownIds.add(e.id);
    });

    // 落地：跑一帧让收编生效（assignCoreRole 在 squadSystem 里）
    updateGame(state, { x: SCREEN_W / 2, y: SCREEN_H / 2 }, false, false, false, SCREEN_W, SCREEN_H);

    // ⚠️ **收编会换 id**：`recruitToSquad` 只是登记，真正的队员实体是 `squadSystem`
    //    的 `flushRecruits` 在这一帧里**新建**的（所以 FQ-06 的夹具才要「按 id 不在旧集合里」
    //    去找新队员）。于是刚才记下的 `victim.id` 全是**俘虏的** id，队员一个都不在里面 ——
    //    第一版照着它过滤，等于**第一帧就把整支队伍删光**（`squadAlive: 0`，全场 0 击杀）。
    //    正确做法：这一帧之后**重新按身份**认人（队员 or 我造的敌人），顺带把野生的刷怪剔掉。
    knownIds.clear();
    knownIds.add(p.id);
    for (const e of state.entities) {
      if (e.ownerId === 'player' || enemyIds.includes(e.id)) knownIds.add(e.id);
    }
    state.entities = state.entities.filter((e) => knownIds.has(e.id));
    if (cfg.stripRoles) for (const m of getSquadMembers(state)) m.coreRole = undefined;

    let wipeFrame = -1;
    let frames = 0;
    let memberKills = 0;
    let nearestEnemyDistAtProbe = NaN;
    // 下令之后的逐帧累积（用**整段时间里活着的每一个队员**，对减员与离群值都免疫）
    let rallySum = 0;
    let rallyFrames = 0;
    let nearestSum = 0;
    let probeFrames = 0;

    for (let f = 0; f < ENCOUNTER_FRAMES; f += 1) {
      if (statusOf(state) === GameStatus.GAME_OVER || statusOf(state) === GameStatus.VICTORY) break;

      // ⚠️ 进化面板会让世界**停摆**（EVOLVING 下 updateGame 不推进）。
      //    第一版没处理它，于是「中途撤离」那组在 f≈600 之后的指令**全部石沉大海** ——
      //    四组跑出来的数一模一样，看起来像「指令无效」，其实是模拟早就冻住了。
      //    「固定遭遇战」里进化会改体型和属性、破坏可比性，所以这里直接挡掉：
      //    清掉候选并把状态按回 PLAYING（和切片台架处理商场/菜单是同一招）。
      if (statusOf(state) === GameStatus.EVOLVING) {
        state.evolveOptions = [];
        state.status = GameStatus.PLAYING;
      }

      // ⚠️ 每帧清掉新刷出来的实体 —— 否则这就不是「同一场战斗」了
      state.entities = state.entities.filter((e) => knownIds.has(e.id));

      if (cfg.stripRoles) for (const m of getSquadMembers(state)) m.coreRole = undefined;

      const aliveEnemies = state.entities.filter((e) => enemyIds.includes(e.id) && e.health > 0);

      // 附身：离散输入，走队列（`consumeSquadActions` 下一帧消费一次）
      if (cfg.possessAtFrame !== undefined && f === cfg.possessAtFrame) {
        const ms = getSquadMembers(state).filter((m) => m.health > 0);
        const best = ms.reduce<Entity | undefined>(
          (a, m) => (!a || m.health > a.health ? m : a),
          undefined
        );
        if (best) requestPossess(state, best.id);
      }

      if (f % COMMAND_INTERVAL === 0) {
        if (cfg.retreatAtFrame !== undefined && f >= cfg.retreatAtFrame) {
          issueCommand(state, 'RETREAT');
        } else if (cfg.focus && aliveEnemies.length > 0) {
          // 两条纪律，都是切片台架里踩出来的：
          //   ① **必须带落点** —— 不带落点时 pickFocusTarget 选「离玩家最近的敌人」，可能选到更大的鱼；
          //   ② **落点必须在射程内** —— 不限射程时全队会追到一千多像素外，
          //      实测「集火」反而从 9杀/2活 掉到 8杀/1活（队伍脱队减员）。
          //      那是**台架不会下令**，不是指令有问题；真人不追到天边。
          const t = nearestHostile(state, p);
          if (t && Math.hypot(t.x - p.x, t.y - p.y) <= FOCUS_MAX_RANGE) {
            issueCommand(state, 'FOCUS', { worldMouse: { x: t.x, y: t.y } });
          } else {
            issueCommand(state, 'GUARD');
          }
        } else {
          issueCommand(state, 'GUARD');
        }
      }

      if (wipeFrame < 0 && aliveEnemies.length === 0 && f > 0) wipeFrame = f;

      // 这一帧还活着的敌人（实体是**原地改**的，跑完一帧后 `health` 就是新值）
      const enemiesBefore = state.entities.filter((e) => enemyIds.includes(e.id) && e.health > 0);

      // 玩家在每组里行为完全一致：默认鼠标居中 = 原地不动、不开加速。
      // 只有队伍决策不同，这样比的才是队伍决策。
      // 需要验「一起撤」时才让玩家背对敌群游（两组同样这么做，仍然只差一个队伍决策）。
      let mouse = { x: SCREEN_W / 2, y: SCREEN_H / 2 };
      let boost = false;
      if (cfg.playerFlees && aliveEnemies.length > 0) {
        const c = centroid(aliveEnemies);
        const away = Math.atan2(p.y - c.y, p.x - c.x);
        mouse = {
          x: SCREEN_W / 2 + Math.cos(away) * 500,
          y: SCREEN_H / 2 + Math.sin(away) * 500,
        };
        boost = true;
      }
      updateGame(state, mouse, boost, false, false, SCREEN_W, SCREEN_H);
      frames = f + 1;

      // 这一帧被打死的敌人，凶手是不是**队员**？
      // ⚠️ 玩家**不在** `state.entities` 里（`createInitialState` 把 player 单列），
      //    所以 `killer.ownerId === 'player'` 只可能是队员，不会把玩家算进来。
      for (const e of enemiesBefore) {
        if (e.health > 0) continue;
        const killer = state.entities.find((x) => x.id === e.lastHitById);
        if (killer && killer.ownerId === 'player') memberKills += 1;
      }

      if (f === PROBE_FRAME) nearestEnemyDistAtProbe = medianNearestEnemyDist(state, enemyIds);

      // 下令之后开始累积「队形」与「接敌距离」
      if (f >= PROBE_FRAME) {
        const ms = getSquadMembers(state).filter((m) => m.health > 0);
        if (ms.length > 0) {
          const ds = ms.map((m) => Math.hypot(m.x - p.x, m.y - p.y)).sort((a, b) => a - b);
          rallySum += ds[Math.floor(ds.length / 2)];
          rallyFrames += 1;
          const ne = medianNearestEnemyDist(state, enemyIds);
          if (!Number.isNaN(ne)) {
            nearestSum += ne;
            probeFrames += 1;
          }
        }
      }
    }

    state.entities = state.entities.filter((e) => knownIds.has(e.id));
    const remaining = state.entities.filter((e) => enemyIds.includes(e.id) && e.health > 0);
    const members = getSquadMembers(state).filter((m) => m.health > 0);
    const rally =
      members.length === 0
        ? NaN
        : members.reduce((a, m) => a + Math.hypot(m.x - p.x, m.y - p.y), 0) / members.length;

    return {
      enemiesKilled: ENEMY_TYPES.length - remaining.length,
      wipeFrame,
      squadAlive: members.length,
      playerHpRatio: p.maxHealth > 0 ? p.health / p.maxHealth : 0,
      squadToPlayerDist: Math.round(rally),
      avgRallyAfterProbe: rallyFrames > 0 ? Math.round(rallySum / rallyFrames) : NaN,
      memberKills,
      nearestEnemyDistAtProbe,
      avgNearestEnemyAfterProbe: probeFrames > 0 ? Math.round(nearestSum / probeFrames) : NaN,
      frames,
      endStatus: statusOf(state),
    };
  });

const ARMS: Record<string, EncounterConfig> = {
  /** 基线：带着队伍但只守着，不下集火也不撤 */
  GUARD: { name: '只守着（GUARD）' },
  /** 决策一：集火 */
  FOCUS: { name: '下令集火（FOCUS）', focus: true },
  /** 决策二：中途撤离 */
  RETREAT: { name: '中途撤离（RETREAT @5s）', retreatAtFrame: 300 },
  /**
   * 决策二·对照：**同样下撤退令，但队伍没有核心角色**。
   *
   * 用来隔离一件事：`pickRoleMoveTarget` 会在 `pickMoveTarget` **之前**被调用，
   * 于是河豚（GUARD 角色）会继续贴队友、剑鱼（SCOUT 角色）会跑去背敌侧 ——
   * **两条路都不走撤退队形**。抹掉角色之后若队形明显收得更紧，
   * 就证明「撤退令被角色移动部分盖掉」是真的，而不是噪声。
   */
  RETREAT_NOROLE: { name: '中途撤离，但队伍没有核心角色', retreatAtFrame: 300, stripRoles: true },
  /**
   * 决策二·正解：**玩家和队伍一起撤** —— 这才是「能主动撤离」的真实形态。
   *
   * 只下撤退令、玩家原地不动的话，队员只是「停止追击」，谈不上脱离接触
   * （实测队形 597 → 597 px，一点没动）。要和下面那个「玩家撤、队伍只守着」配对看。
   */
  FLEE_RETREAT: { name: '玩家撤 + 队伍撤退令', retreatAtFrame: 300, playerFlees: true },
  /** 决策二·对照：**玩家撤，但队伍只守着** —— 队员会去扑身边的猎物，被落下 */
  FLEE_GUARD: { name: '玩家撤 + 队伍只守着', playerFlees: true },
  /** 决策三：带不带核心角色 */
  NOROLE: { name: '集火，但队伍没有核心角色', focus: true, stripRoles: true },
  /**
   * 决策四：**中途附身**（计划 §G1 交付里列的第三种可对比操作）。
   *
   * 附身是**拿体型换命**：把玩家的身体换成某个队员的身体，
   * 属性 / 体型 / 技能全跟着换。它改的是玩家自己的战斗能力，
   * 所以应当能从击杀 / 存活上读出来 —— 若读不出来，「三种可对比操作」就只剩两种。
   */
  POSSESS: { name: '中途附身（换身体）', possessAtFrame: 300 },
};

describe('G1 放行条件 · 固定队伍对战场景', () => {
  /**
   * **同一场战斗跑两遍必须逐帧一致** —— 上面所有「只改一个决策」的比较都建立在这条之上。
   * 不先钉住它，后面每一条差距都可以只是随机流漂移。
   */
  it('同一场战斗跑两遍必须逐字段一致（否则下面的对比全是噪声）', () => {
    const a = runEncounter(ARMS.FOCUS);
    const b = runEncounter(ARMS.FOCUS);
    expect(b).toEqual(a);
  });

  /**
   * 场地自检：**这场战斗必须真的打起来**。
   * 不先证明「基线组既没全歼也没团灭」，后面的「决策改变了结果」就没有意义 ——
   * 一边倒的战斗里，怎么下令都一样（这正是 N=1 固定场景最大的风险）。
   */
  it('基线那场战斗必须真的打起来（不能一边倒，否则决策无从体现）', () => {
    const base = runEncounter(ARMS.GUARD);
    console.log('基线（只守着）：', base);
    expect(base.enemiesKilled, '基线应当能打死一些敌人').toBeGreaterThan(0);
    expect(base.enemiesKilled, '基线不该把敌人全歼光（否则没得比）').toBeLessThan(ENEMY_TYPES.length);
  });

  /**
   * 放行条件之一：**能主动撤离** —— 但实测下来，这条的**机器证据原来站不住**。
   *
   * ⚠️ 原判据是「队形收得更紧」：`squadToPlayerDist` **401 → 387 px**，据此打了 ✅。
   *    换成稳健口径（下令后**逐帧**算「队员→玩家」中位、再对帧平均）之后，
   *    差距**变成 0（597 → 597）**。原因：原来的 401/387 是**战斗结束那一刻**的
   *    均值，而 15 秒打完只剩 **2 个人** —— 那一刻的距离量的是**残局**，不是队形。
   *
   * ⚠️ 中间还有一版解释是**错的**，留在注释里免得后人重踩：
   *    曾以为是「核心角色的移动逻辑盖掉了撤退队形」（`pickRoleMoveTarget` 确实排在
   *    `pickMoveTarget` 前面，河豚会去贴队友、剑鱼会跑背敌侧）。**实测否掉了**：
   *    抹掉核心角色后队形是 **660px（更松）**，不是更紧 —— 方向反了，假设不成立。
   *
   * 真正的原因在下一段注释里（没有可撤的方向），结论在「能主动撤离靠什么」那条用例里。
   */
  it('⚠️ 只下撤退令、玩家不动 = 撤不掉：队形几乎一点没变', () => {
    const hold = runEncounter(ARMS.GUARD);
    const retreat = runEncounter(ARMS.RETREAT);
    console.log(
      `「只下撤退令、玩家原地不动」的实测（同一世界 · 同一下令帧 ${PROBE_FRAME}）：\n` +
        `  队形（下令后逐帧中位再平均）：${hold.avgRallyAfterProbe} → ${retreat.avgRallyAfterProbe} px\n` +
        `  接敌（同口径）：${hold.avgNearestEnemyAfterProbe} → ${retreat.avgNearestEnemyAfterProbe} px\n` +
        `  ⚠️ 差值为 0 —— RETREAT 的语义是「队形收紧 + 无视敌人」，它**没有「远离敌人」的方向**；\n` +
        `     玩家不动就没有可撤的方向，队员只是**停止追击**而已。\n` +
        `     ⚠️ 但**别据此说「撤退令没用」**：fq05-commands.test.ts 在无敌人场景下量到\n` +
        `     集结距离从 ~390px 收到 ~190px（差值正好 = (FOLLOW_GAP+FOLLOW_DEADZONE)−(RALLY_GAP+RETREAT_DEADZONE)）。\n` +
        `     指令本身是生效的，**生效的前提是有可撤的方向**。`
    );
    // 钉住现状：只下撤退令、玩家不动时，队形**没有**可测量的变化。
    // 这条变红意味着 RETREAT 加了「主动远离敌人」的语义 —— 那是好事，
    // 但要把上面这段说明和《开发路线图》一起改掉，别让文档继续说过期的话。
    expect(
      Math.abs(retreat.avgRallyAfterProbe - hold.avgRallyAfterProbe),
      '只下撤退令、玩家不动时队形不该有变化（有变化说明 RETREAT 加了主动远离的语义）'
    ).toBeLessThanOrEqual(2);
  });

  /**
   * 放行条件之一·**到底靠什么撤** —— 把「玩家撤」和「队伍撤退令」拆开量。
   *
   * 结论（实测）：**撤离靠的是玩家自己的移动 + 加速，队伍指令对此没有可测量的贡献。**
   *   · 玩家不动 + 下撤退令 → 队形 597 → 597 px，撤不掉（见上一条）；
   *   · 玩家撤 + 只守着     → 接敌 200px、玩家 **100% 血**；
   *   · 玩家撤 + 撤退令     → 接敌 **200px**、玩家 **100% 血** —— 与上一条逐项相同。
   * 原因很清楚：玩家一旦游出射程，`findGuardPrey` 的 `GUARD_CHASE_RANGE` 里就没有猎物了，
   * 于是 GUARD 自己就退化成「跟随」，**两条指令在此时等价**。
   *
   * 所以放行条件里的「**能主动撤离**」成立，但**成立在玩家这一侧**，不是队伍指令的功劳。
   * 这是一条**对玩家可见**的结论，必须写清楚，否则后人会拿它去证明「撤退令有用」。
   */
  it('能主动撤离：撤得掉靠的是玩家自己（队伍指令此时与「只守着」等价）', () => {
    const hold = runEncounter(ARMS.GUARD);
    const fleeGuard = runEncounter(ARMS.FLEE_GUARD);
    const fleeRetreat = runEncounter(ARMS.FLEE_RETREAT);
    console.log(
      `「能主动撤离」到底靠什么（同一世界 · 同一下令帧 ${PROBE_FRAME}）：\n` +
        `  玩家不动（只守着）      ：玩家剩血 ${Math.round(hold.playerHpRatio * 100)}%` +
        ` · 接敌 ${hold.avgNearestEnemyAfterProbe} px · 残局队伍存活 ${hold.squadAlive}\n` +
        `  玩家撤 + 队伍只守着     ：玩家剩血 ${Math.round(fleeGuard.playerHpRatio * 100)}%` +
        ` · 接敌 ${fleeGuard.avgNearestEnemyAfterProbe} px · 残局队伍存活 ${fleeGuard.squadAlive}\n` +
        `  玩家撤 + 队伍撤退令     ：玩家剩血 ${Math.round(fleeRetreat.playerHpRatio * 100)}%` +
        ` · 接敌 ${fleeRetreat.avgNearestEnemyAfterProbe} px · 残局队伍存活 ${fleeRetreat.squadAlive}\n` +
        `  ⚠️ 后两行**逐项相同** —— 玩家游出射程后 GUARD 里没有猎物可追，\n` +
        `     自己就退化成「跟随」，两条指令此时等价。撤得掉是**玩家移动**的功劳。`
    );

    // ⚠️ **本场景证明不了「玩家撤得掉」** —— 玩家在**每一组**里都是 100% 血，
    //    包括「原地不动」那组。也就是说这场战斗对玩家**根本不构成威胁**
    //    （玩家是进化过的电鳗，敌人是 t2 的锦鲤 / 海马），
    //    「掉不掉血」这个判据在这里**没有区分度**，不能拿它当撤离的证据。
    expect(
      hold.playerHpRatio,
      '本场景玩家无伤是前提（否则下面「等价」的结论会被玩家掉血干扰）'
    ).toBe(1);
    expect(
      fleeGuard.playerHpRatio,
      '本场景玩家无伤是前提 —— 若这里不再是 100%，说明这场遭遇战变凶了，本条要重写'
    ).toBe(1);

    // 钉住「此时队伍指令与只守着等价」—— 变红说明指令获得了新的撤离开销/收益，
    // 那是好事，但必须回来改掉上面这段说明，别让文档继续说「撤离靠玩家」。
    expect(
      fleeRetreat.avgNearestEnemyAfterProbe,
      '本场景下撤退令与只守着的接敌距离应当相同（等价）'
    ).toBe(fleeGuard.avgNearestEnemyAfterProbe);
    // 队形给一点容差：玩家在高速撤离时，两条指令下队员的落点会有几像素差别
    // （实测 1679 vs 1683），但**不是数量级的差别** —— 那才叫「有贡献」。
    expect(
      Math.abs(fleeRetreat.avgRallyAfterProbe - fleeGuard.avgRallyAfterProbe),
      '本场景下撤退令与只守着的队形应当基本相同（几像素级，不是数量级）'
    ).toBeLessThanOrEqual(20);

    console.log(
      '⚠️ 因此放行条件「能主动撤离」在本场景**只有部分证据**：\n' +
        '   · 能证明的：RETREAT 指令本身会收紧队形（fq05-commands.test.ts 无敌人场景，\n' +
        '     集结距离 ~390 → ~190px，差值 = (FOLLOW_GAP+FOLLOW_DEADZONE)−(RALLY_GAP+RETREAT_DEADZONE)）；\n' +
        '   · 证不了的：在「被敌群围住 + 玩家不动」时它**不产生任何可测量的变化**，\n' +
        '     因为 RETREAT 没有「远离敌人」这个方向 —— 玩家得自己往反方向游。'
    );
  });

  /**
   * 放行条件之二：**至少两种队伍决策能改变同场战斗结果**。
   *
   * 这里验两种：① 集火（同一支队伍，下不下令）；② 带不带核心角色。
   * 判据用**击杀数**而不是存活帧数 —— 见本文件顶部：存活帧数会把「赢得快」读成「死得早」。
   */
  it('至少两种队伍决策能改变同场战斗结果（集火 / 阵容 / 附身 / 撤离 逐个量）', () => {
    const guard = runEncounter(ARMS.GUARD);
    const focus = runEncounter(ARMS.FOCUS);
    const retreat = runEncounter(ARMS.RETREAT);
    const noRole = runEncounter(ARMS.NOROLE);
    const possess = runEncounter(ARMS.POSSESS);

    console.log('\n── 固定遭遇战（同一世界 · 同一支队伍 · 同一批敌人 · 只改一个决策）──');
    console.table(
      [ARMS.GUARD, ARMS.FOCUS, ARMS.RETREAT, ARMS.NOROLE, ARMS.POSSESS].map((cfg, i) => {
        const r = [guard, focus, retreat, noRole, possess][i];
        return {
          决策: cfg.name,
          击杀: r.enemiesKilled,
          全歼帧: r.wipeFrame,
          队伍存活: r.squadAlive,
          '玩家剩血%': Math.round(r.playerHpRatio * 100),
        };
      })
    );

    // 「结果」= 打掉多少 / 队伍剩几个。
    // ⚠️ **只按结果判，不把「队形差几十像素」算进来** —— 位置本来就会漂，
    //    把形态度量算进「改变结果」等于自欺。上一版就是靠 `队形401→387` 把「撤离」
    //    记成 ✅ 的，而那个差值已被证伪（那是残局只剩 2 人的快照，稳健口径下差值为 0）。
    const outcome = (r: EncounterResult): string =>
      `击杀${r.enemiesKilled}/队活${r.squadAlive}/全歼@${r.wipeFrame}`;

    const focusChanged = outcome(guard) !== outcome(focus);
    const possessChanged = outcome(guard) !== outcome(possess);
    const roleChanged = outcome(focus) !== outcome(noRole);
    const retreatChanged = outcome(guard) !== outcome(retreat);

    console.log(
      `决策一 集火（GUARD → FOCUS）：${outcome(guard)} → ${outcome(focus)}` +
        `　${focusChanged ? '✅ 改变了结果' : '❌ 没变'}\n` +
        `决策二 附身（GUARD → POSSESS）：${outcome(guard)} → ${outcome(possess)}` +
        `　${possessChanged ? '✅ 改变了结果' : '❌ 没变'}\n` +
        `决策三 阵容（FOCUS → 无核心角色）：${outcome(focus)} → ${outcome(noRole)}` +
        `　${roleChanged ? '✅ 改变了结果' : '⚠️ 结果未变'}\n` +
        `决策四 撤离（GUARD → RETREAT）：${outcome(guard)} → ${outcome(retreat)}` +
        `　${retreatChanged ? '✅ 改变了结果' : '⚠️ 结果未变'}` +
        `（它**不计入本条** —— 撤离的判据在「能主动撤离」那条，本条只量「能不能改变战斗结果」）\n` +
        `  ⚠️ 集火在本场景是**小负**（${outcome(guard)} → ${outcome(focus)}）：` +
        `限了射程之后队伍不再被拖走，但击杀与存活仍略降。\n` +
        `     这是台架的「下令策略」问题（每秒重下一次、不看血线），不是指令本身的问题 ——\n` +
        `     真人切片要专门看一眼：集火到底该在什么时候下。`
    );

    // 放行条件要的是「**至少两种**队伍决策能改变同场战斗结果」。
    // 本场景成立的是**集火**与**附身**；「阵容」没体现（与切片台架
    // 「队伍选择的存活维度判不了」是同一个结论，不硬凑）；「撤离」不计入本条。
    //
    // ⚠️ 附身这一条是**新补的**：上一版把「撤离」当第二种，靠的是已被证伪的队形差值，
    //    所以那时其实**只有一种**决策真的成立。补附身后才重新满足「至少两种」。
    expect(focusChanged, '「集火」这个决策必须改变这场战斗的结果').toBe(true);
    expect(possessChanged, '「附身」这个决策必须改变这场战斗的结果').toBe(true);
  });
});
