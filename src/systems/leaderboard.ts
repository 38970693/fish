/**
 * 本地排行榜（P3 排行榜的本地版）。
 *
 * 为什么是本地：远端仓库/服务器都没了，联机排行动中西线；
 * 先把「跑一把 → 留个名次」的反馈闭环做起来，数据结构将来可直接对接服务端。
 *
 * 关键设计 —— **用 state 对象身份当 run 的身份证**：
 *   - recordRun(state) 在死亡/胜利时调用；同一个 state 对象重复记录 = 同一局更新（upsert，
 *     复活后再死分数只涨不重复）。
 *   - 重开时 createInitialState 生成新对象 → 自动算新的一局。
 *   - 不用往 GameState 里塞 runId，调用方零改动成本。
 *
 * 持久化：localStorage，前 10 名。
 */

import type { GameState } from '../types';
import { getPond } from '../data/ponds';
import type { RunMode } from '../data/runRules';

const STORAGE_KEY = 'fish.leaderboard.v1';
const MAX_ENTRIES = 10;

export interface LeaderboardEntry {
  score: number;
  weight: number;
  level: number;
  /** 存活时长（秒） */
  survivedSec: number;
  /** 收编过的队员数 */
  recruits: number;
  /** 所在鱼塘名（「多鱼塘」阶段 1；旧记录可能没有该字段） */
  pond?: string;
  /**
   * 玩法模式（G0/FQ-02）。缺省 = LEGACY —— 旧存档没有这个字段，
   * 读取端一律按「旧模式」处理，不做数据迁移。
   */
  mode?: RunMode;
  /** 规则版本：同一模式不同规则版本要能分开看（旧记录缺省 0） */
  ruleVersion?: number;
  date: string;
}

let entries: LeaderboardEntry[] = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as LeaderboardEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
})();

/** 当前 run 的身份证（state 对象引用），跨帧 upsert 用 */
let currentRunState: GameState | null = null;
/** 当前 run 上一版记录的引用：分数会变，靠引用（而不是值）才能在 upsert 时把旧的撤下来 */
let lastRunEntry: LeaderboardEntry | null = null;
/** 最近一次记录在本榜的名次（1 起，0 = 未上榜），给结算界面显示 */
let lastRank = 0;

const persist = (): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 隐私模式 / 配额满：排行榜退化为本次会话
  }
};

/** 从 GameState 抽一条记录 */
const toEntry = (state: GameState): LeaderboardEntry => ({
  score: Math.floor(state.score),
  weight: Math.floor(state.player.weight),
  level: state.player.level,
  survivedSec: Math.floor(state.time / 60),
  recruits: state.squad.recruitedTotal,
  pond: getPond(state.pondId).name,
  // 旧模式没有 run：按 LEGACY / 版本 0 记，排行榜读取端不用判空
  mode: state.run?.mode ?? 'LEGACY',
  ruleVersion: state.run?.ruleVersion ?? 0,
  date: new Date().toISOString().slice(0, 10),
});

/**
 * 记录一局。死亡 / 胜利时调用（progression / combat）。
 * 同一个 state 反复进来只更新不新增（复活→再死→分数刷新）。
 * ⚠️ upsert 靠**对象引用**撤旧插新，不能用"分数相等"找旧记录 —— 分数一变就找不到了
 *   （踩过：复活后分数从 50 涨到 80，旧 50 撤不掉，同局出现两条）。
 * @returns 本局名次（1 起），未进前 10 返回 0
 */
export const recordRun = (state: GameState): number => {
  // 练习局（无敌模式 / 手动续命）不进正式榜：直接返回「未上榜」，
  // 连 currentRunState 都不动 —— 免得同一局先记为练习、后被 upsert 洗白。
  // （旧模式没有 run，此分支不生效，旧规则原样保留。）
  if (state.run?.practice) {
    lastRank = 0;
    return 0;
  }

  const entry = toEntry(state);

  if (currentRunState === state) {
    // 同一局：撤下上一版记录，插入最新值（分数只涨，名次只升不降）
    if (lastRunEntry) entries = entries.filter((e) => e !== lastRunEntry);
  } else {
    currentRunState = state;
  }
  lastRunEntry = entry;

  entries.push(entry);
  entries.sort((a, b) => b.score - a.score);
  entries = entries.slice(0, MAX_ENTRIES);

  lastRank = entries.indexOf(entry) + 1; // 0 = 被挤出前 10
  persist();
  return lastRank;
};

/** 榜单（已排序） */
export const getLeaderboard = (): LeaderboardEntry[] => [...entries];

/** 结算界面显示用的最近名次（0 = 未上榜） */
export const getLastRunRank = (): number => lastRank;

/** 清榜（菜单里给个「清空」入口 + 测试用） */
export const clearLeaderboard = (): void => {
  entries = [];
  currentRunState = null;
  lastRunEntry = null;
  lastRank = 0;
  persist();
};
