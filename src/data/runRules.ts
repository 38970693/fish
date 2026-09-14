/**
 * 「鱼群争霸」模式规则表（G0 / FQ-02）
 *
 * ┌──────────┬──────────────────────────────────────────────┐
 * │ LEGACY   │ 旧 Demo 规则（默认）：自由换塘、无阶段、不限时    │
 * │ RIVALS   │ 鱼群争霸：单塘、四阶段、指定塘主、练习局不入榜    │
 * └──────────┴──────────────────────────────────────────────┘
 *
 * 这一版只建立**规则入口**（模式开关 / 阶段表 / 规则参数 / 练习标记），
 * 不改任何玩法数值 —— 旧模式走 `state.run === undefined` 的整段空转路径，
 * 行为与加这个文件之前逐字节一致（回归测试钉住这条）。
 *
 * ⚠️ 时间一律存**帧**（字段名带 Frames），与仓库既有约定一致
 *    （SPAWN_INTERVAL / MOOD_REROLL_FRAMES / 喷泉 3600 帧）。
 *    App.tsx 的固定步长累加器按 1000/60 走，所以 `sec()` 就是唯一换算入口，
 *    别在业务代码里散写 `× 60`。
 *
 * ⚠️ 本文件**只 import type**（不 import 任何运行时值）：
 *    `types.ts` 依赖 `data/creatures.ts` 等数据模块，若这里反向 import 它的运行时值
 *    就会把「数据层 → 类型门面 → 数据层」接成运行环。类型导入会被擦除，安全。
 */

import type { RunState } from '../types';

/* ══════════════ 模式 ══════════════ */

export const RUN_MODE = {
  LEGACY: 'LEGACY',
  RIVALS: 'RIVALS',
} as const;

/** 模式 ID：从数据自动推导，加模式即加类型 */
export type RunMode = keyof typeof RUN_MODE;

/** 默认模式 —— 新模式验证通过前，默认入口仍是旧 Demo */
export const DEFAULT_RUN_MODE: RunMode = RUN_MODE.LEGACY;

/** 开发期模式开关的持久化键（URL `?mode=` 会写进来，重开一局/刷新后保持） */
export const RUN_MODE_STORAGE_KEY = 'fish.runMode';

/* ══════════════ 帧 ↔ 秒 ══════════════ */

/** 逻辑帧率：与 App.tsx 的固定步长累加器（1000/60）一致 */
export const FRAMES_PER_SECOND = 60;

/** 秒 → 帧。所有「秒」在进配置表前都要过这里 */
export const sec = (seconds: number): number => Math.round(seconds * FRAMES_PER_SECOND);

/* ══════════════ 一局四阶段 ══════════════ */

export const RUN_PHASE = {
  EARLY: 'EARLY',
  CONTEST: 'CONTEST',
  BUILDUP: 'BUILDUP',
  DECISIVE: 'DECISIVE',
} as const;

export type RunPhaseId = keyof typeof RUN_PHASE;

export interface RunPhaseConfig {
  /** 展示名 */
  name: string;
  /** 阶段起点（帧，含左不含右） */
  startFrame: number;
  /** 玩家目标（HUD 与阶段提示用） */
  goal: string;
  /** 世界行为（规格备忘，给后续阶段的 AI/事件导演读） */
  world: string;
  /** 阶段提示色 */
  color: string;
}

export const RUN_PHASE_DATA: Record<RunPhaseId, RunPhaseConfig> = {
  EARLY: {
    name: '起步',
    startFrame: 0,
    goal: '捕食成长，收到第一位伙伴',
    world: '出生附近有可捕食目标和可辨认掩体；强敌不贴脸生成',
    color: '#4ade80',
  },
  CONTEST: {
    name: '争夺',
    startFrame: sec(120),
    goal: '参与投食争夺，组出核心队伍',
    world: '对手开始争夺资源；精英战利品提供第一次重要取舍',
    color: '#38bdf8',
  },
  BUILDUP: {
    name: '成型',
    startFrame: sec(360),
    goal: '补足特性组合，保住关键队员',
    world: '两支对手均可参与争夺；风险与回报同步提高',
    color: '#a78bfa',
  },
  DECISIVE: {
    name: '决战',
    startFrame: sec(600),
    goal: '击败指定塘主',
    world: '塘主出现并标出位置；补给争夺继续存在',
    color: '#f87171',
  },
};

/** 阶段顺序 —— 唯一权威顺序（对象键序不可依赖） */
export const RUN_PHASE_ORDER: RunPhaseId[] = [
  RUN_PHASE.EARLY,
  RUN_PHASE.CONTEST,
  RUN_PHASE.BUILDUP,
  RUN_PHASE.DECISIVE,
];

/**
 * 由阶段时钟（帧）推当前阶段。边界含左不含右，负数按第一阶段兜底。
 * 纯函数：探针与单测都直接拿它算期望值，不用另抄一份阈值。
 */
export const getRunPhase = (clock: number): RunPhaseId => {
  let phase: RunPhaseId = RUN_PHASE_ORDER[0];
  for (const id of RUN_PHASE_ORDER) {
    if (clock >= RUN_PHASE_DATA[id].startFrame) phase = id;
  }
  return phase;
};

/** 阶段还剩多少帧（HUD 倒计时用；已过末阶段返回 0） */
export const framesUntilNextPhase = (clock: number): number => {
  const idx = RUN_PHASE_ORDER.indexOf(getRunPhase(clock));
  const next = RUN_PHASE_ORDER[idx + 1];
  return next ? Math.max(0, RUN_PHASE_DATA[next].startFrame - clock) : 0;
};

/* ══════════════ 规则参数 ══════════════ */

/**
 * 鱼群争霸首版参数。
 *
 * ⚠️ 全是**首轮试验值**（计划第 3/4/6/7/8 节），不代表已验证平衡；
 *    试玩前不要把它们当结论引用。改规则记得 +ruleVersion（排行榜按版本区分）。
 */
export const RIVALS_RULES = {
  ruleVersion: 1,
  /** 单塘模式：关闭塘际传送（避免换塘重置对手与决战进度） */
  allowPondTravel: false,
  /** 战队总人数上限（沿用旧值，G1 再加核心位） */
  squadCap: 10,
  /** 核心成员位（G1 起生效） */
  coreSlots: 3,
  /** 目标局长区间：仅用于进度提示，**不是**倒计时失败条件 */
  targetRunFrames: { min: sec(12 * 60), max: sec(15 * 60) },
  /** 超过该时长开始提高争夺压力 */
  pressureAfterFrame: sec(15 * 60),
} as const;

/* ══════════════ 模式解析 ══════════════ */

/** 把任意字符串归一成模式 ID，无法识别返回 null */
export const normalizeRunMode = (value?: string | null): RunMode | null => {
  const key = (value ?? '').trim().toUpperCase();
  if (key === RUN_MODE.RIVALS) return RUN_MODE.RIVALS;
  if (key === RUN_MODE.LEGACY) return RUN_MODE.LEGACY;
  return null;
};

/**
 * 解析本局模式。优先级：显式入参 > URL `?mode=` > localStorage > 默认 LEGACY。
 *
 * URL 命中时会写进 localStorage，于是「刷新 / 重开一局」都留在同一模式里
 * —— 开发期对照试玩时不用每次重挂参数。
 * 读不到 `window`/`localStorage`（非浏览器环境、隐私模式）一律当默认模式。
 */
export const resolveRunMode = (override?: string | null): RunMode => {
  const explicit = normalizeRunMode(override);
  if (explicit) return explicit;

  try {
    const fromUrl = normalizeRunMode(new URLSearchParams(window.location.search).get('mode'));
    if (fromUrl) {
      localStorage.setItem(RUN_MODE_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
  } catch {
    /* 没有 window：当默认模式 */
  }

  try {
    const stored = normalizeRunMode(localStorage.getItem(RUN_MODE_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    /* localStorage 不可用：当默认模式 */
  }

  return DEFAULT_RUN_MODE;
};

/**
 * 造对局状态。**旧模式返回 undefined**，这样 `state.run` 保持缺省，
 * 所有消费点用 `if (!state.run) return;` 就能保证旧模式零改动。
 */
export const createRunState = (mode: RunMode): RunState | undefined => {
  if (mode !== RUN_MODE.RIVALS) return undefined;
  return {
    mode,
    ruleVersion: RIVALS_RULES.ruleVersion,
    phase: RUN_PHASE_ORDER[0],
    clock: 0,
    practice: false,
    practiceReason: null,
    // 决战目标塘主由后续阶段（G4/FQ-13）指定；这里只保证字段有确定值
    bossId: null,
  };
};
