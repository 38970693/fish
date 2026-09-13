/**
 * 成就系统（待办③）。
 *
 * 架构（照抄 audio 的模式）：
 *  - `subscribeAchievements()`：订阅 gameEvents 做**统计**（吃鱼/背刺/升级/进化…），
 *    整个项目只调用一次（App.tsx 模块级，和 subscribeAudio 并排）。
 *  - `achievementsSystem`：注册进系统表，每帧做两件事 ——
 *      1) 从 GameState 差分出没有事件覆盖的统计（收编数 / 夺舍数 / 当前所在塘，
 *         重开后归零要能兜住）
 *      2) 脏检查 → 解锁 → 发 'achievement' 事件（UI 弹 toast）+ 玩家头顶气泡
 *  - 进度与解锁存 localStorage，跨局累计。
 *
 * 测试：`__resetAchievementsForTest()` 重置内存态并允许订阅自己的 EventBus，
 *      不碰真实 localStorage。
 */

import { gameEvents } from '../gameEngine';
import { EventBus } from '../core/EventBus';
import { ACHIEVEMENTS, type AchievementDef, type AchievementStatKey } from '../data/achievements';
import { POND_BUILDING_TYPES } from '../data/buildings';
import type { GameEvents, GameState, FrameContext } from '../types';

/* ══════════════ 统计 ══════════════ */

interface AchievementStats {
  eaten: number;
  backstabs: number;
  maxLevel: number;
  evolutions: number;
  reversals: number;
  treasures: number;
  /** 到访过的生态区（集合，取 size 参与比较） */
  biomes: Record<string, true>;
  recruits: number;
  possessions: number;
  coins: number;
  /** 到访过的鱼塘（集合，取 size 参与比较） */
  ponds: Record<string, true>;
  /** 各塘图鉴：已吃到过的特产鱼**种**数（同一种吃十次也只算一种） */
  dexClear: number;
  dexCoral: number;
  dexAbyss: number;
  /** 触发过的塘特产建筑种数（许愿池 / 珍珠场 / 沉船） */
  pondBuildings: number;
  /** 许愿池累计触发次数（不复位的计数，所以单独一个键） */
  wishingWell: number;
  /** 内部去重集合：吃过的特产鱼 / 触发过的建筑，不直接参与比较 */
  dexSeen: Record<string, true>;
  buildingsSeen: Record<string, true>;
}

const emptyStats = (): AchievementStats => ({
  eaten: 0,
  backstabs: 0,
  maxLevel: 1,
  evolutions: 0,
  reversals: 0,
  treasures: 0,
  biomes: {},
  recruits: 0,
  possessions: 0,
  coins: 0,
  ponds: {},
  dexClear: 0,
  dexCoral: 0,
  dexAbyss: 0,
  pondBuildings: 0,
  wishingWell: 0,
  dexSeen: {},
  buildingsSeen: {},
});

/* ══════════════ 持久化 ══════════════ */

const STORAGE_KEY = 'fish.achievements.v1';

interface PersistedShape {
  stats: AchievementStats;
  unlocked: Record<string, number>;
}

const loadPersisted = (): PersistedShape => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { stats: emptyStats(), unlocked: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    return {
      stats: { ...emptyStats(), ...(parsed.stats ?? {}) },
      unlocked: parsed.unlocked ?? {},
    };
  } catch {
    return { stats: emptyStats(), unlocked: {} };
  }
};

const persist = (shape: PersistedShape): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // 隐身模式 / 配额满：成就退化为仅本次会话，不影响游戏
  }
};

let stats: AchievementStats = emptyStats();
let unlocked: Record<string, number> = {};
try {
  ({ stats, unlocked } = loadPersisted());
} catch {
  // localStorage 不可用（非浏览器环境）：跳过持久化
}
let statsDirty = false;
let frameSinceSave = 0;

/* ══════════════ 事件订阅（统计） ══════════════ */

let subscribed = false;

/**
 * 把游戏事件接进成就统计。整个项目只调用一次（App.tsx，和 subscribeAudio 并排）。
 * @param bus 默认挂全局 gameEvents；测试传自己的总线
 */
export const subscribeAchievements = (bus: EventBus<GameEvents> = gameEvents): void => {
  if (subscribed) return;
  subscribed = true;

  const on = <K extends keyof GameEvents>(evt: K, fn: (p: GameEvents[K]) => void): void => {
    bus.on(evt, fn);
  };

  on('eat', ({ attacker, victim, isBackAttack }) => {
    if (attacker.id !== 'player') return;
    stats.eaten += 1;
    // 浮游生物这类一口一个的也算吃，但背刺必须是对真鱼绕后
    if (isBackAttack && victim.config.tier >= 1) stats.backstabs += 1;

    // 塘图鉴：只有带 ponds 的才是特产鱼，且**首次**吃到才计数 ——
    // 否则蹲在深渊刷十只水母就能凑满七格，图鉴就成了刷子成就
    const ponds = victim.config.ponds;
    if (ponds && !stats.dexSeen[victim.type]) {
      stats.dexSeen[victim.type] = true;
      if (ponds.includes('CLEAR')) stats.dexClear += 1;
      if (ponds.includes('CORAL')) stats.dexCoral += 1;
      if (ponds.includes('ABYSS')) stats.dexAbyss += 1;
    }
    statsDirty = true;
  });
  on('levelup', ({ entity, level }) => {
    if (entity.id !== 'player') return;
    if (level > stats.maxLevel) {
      stats.maxLevel = level;
      statsDirty = true;
    }
  });
  on('evolve', ({ entity }) => {
    if (entity.id !== 'player') return;
    stats.evolutions += 1;
    statsDirty = true;
  });
  on('reversal', () => {
    // 逆转 = 玩家被小自己一半的鱼反杀（combat 专属判定），耻辱柱 +1
    stats.reversals += 1;
    statsDirty = true;
  });
  on('pickup', () => {
    stats.treasures += 1;
    statsDirty = true;
  });
  on('biome', ({ to }) => {
    if (!stats.biomes[to]) {
      stats.biomes[to] = true;
      statsDirty = true;
    }
  });
  on('coin', () => {
    stats.coins += 1;
    statsDirty = true;
  });
  on('buildingUse', ({ type }) => {
    // 许愿池是「累计次数」，不去重
    if (type === 'WISHING_WELL') {
      stats.wishingWell += 1;
      statsDirty = true;
    }
    // 特产建筑打卡：同一座刷冷却再触发不重复计数
    if (POND_BUILDING_TYPES.includes(type as (typeof POND_BUILDING_TYPES)[number]) &&
        !stats.buildingsSeen[type]) {
      stats.buildingsSeen[type] = true;
      stats.pondBuildings += 1;
      statsDirty = true;
    }
  });
  on('death', ({ victim }) => {
    // 预留：死亡类成就目前由夺舍/结算体现，先记着不占成就
    if (victim.id !== 'player') return;
    statsDirty = true;
  });
};

/* ══════════════ 每帧系统 ══════════════ */

/** 上一帧见到的 run 级计数（重开会归零，差分要能兜住负数） */
let lastSeen = { recruits: 0, possessions: 0, pond: '' };

/** 某个统计键的当前值（biomes / ponds 取集合大小） */
const statValue = (key: AchievementStatKey): number => {
  if (key === 'biomes') return Object.keys(stats.biomes).length;
  if (key === 'ponds') return Object.keys(stats.ponds).length;
  return stats[key] as number;
};

export const achievementsSystem = (state: GameState, ctx: FrameContext): void => {
  // ── 差分统计：收编 / 夺舍 / 当前塘没有专属事件，用 state 差分
  //    （重开归零 clamp 到 0）──
  const dRecruits = state.squad.recruitedTotal - lastSeen.recruits;
  const dPossess = state.squad.possessCount - lastSeen.possessions;
  lastSeen = {
    recruits: state.squad.recruitedTotal,
    possessions: state.squad.possessCount,
    pond: state.pondId,
  };
  if (dRecruits > 0) {
    stats.recruits += dRecruits;
    statsDirty = true;
  }
  if (dPossess > 0) {
    stats.possessions += dPossess;
    statsDirty = true;
  }
  // 「到访」没有事件可用（换塘走的是 pondTravel，它不是事件驱动），
  // 只能每帧看 state.pondId —— 开局所在的塘也会算进去，这本来就该算
  if (!stats.ponds[state.pondId]) {
    stats.ponds[state.pondId] = true;
    statsDirty = true;
  }

  // ── 解锁检查（只在统计有变化时跑，平时零开销）──
  if (statsDirty) {
    for (const def of ACHIEVEMENTS) {
      if (unlocked[def.id]) continue;
      if (statValue(def.stat) >= def.goal) {
        unlocked[def.id] = Date.now();
        ctx.events.emit('achievement', {
          id: def.id,
          name: def.name,
          desc: def.desc,
          icon: def.icon,
        });
        state.player.speechBubble = {
          text: `成就解锁：${def.name}！`,
          timer: 120,
          color: '#fcd34d',
        };
      }
    }
    statsDirty = false;
    persist({ stats, unlocked });
    frameSinceSave = 0;
    return;
  }

  // 没解锁也在攒进度（吃了一半的 25 条之类）—— 每 2 秒落一次盘
  frameSinceSave += 1;
  if (frameSinceSave >= 120) {
    frameSinceSave = 0;
    persist({ stats, unlocked });
  }
};

/* ══════════════ UI 查询 ══════════════ */

export interface AchievementView extends AchievementDef {
  unlockedAt: number | null;
  /** 当前进度（已封顶到 goal） */
  progress: number;
  unlocked: boolean;
}

export const getAchievementView = (): AchievementView[] =>
  ACHIEVEMENTS.map((def) => {
    const value = statValue(def.stat);
    return {
      ...def,
      unlockedAt: unlocked[def.id] ?? null,
      progress: Math.min(value, def.goal),
      unlocked: !!unlocked[def.id],
    };
  });

/** 已解锁数量（主菜单按钮上的角标） */
export const getUnlockedCount = (): number => Object.keys(unlocked).length;

/* ══════════════ 测试辅助 ══════════════ */

/** 重置内存态 + 订阅标记 + 清 localStorage（vitest 的 jsdom 存储是隔离的，不碰真实数据） */
export const __resetAchievementsForTest = (): void => {
  stats = emptyStats();
  unlocked = {};
  statsDirty = false;
  frameSinceSave = 0;
  lastSeen = { recruits: 0, possessions: 0, pond: '' };
  subscribed = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 非 localStorage 环境
  }
};
