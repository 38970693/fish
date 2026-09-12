/**
 * AI 鱼的心境（随机状态）—— 让鱼群不再是「同一品种复制粘贴」。
 *
 * 背景：种族行为是**写死**的（`config.behavior`），所以全场的小丑鱼永远一个德性：
 * 一起慢慢游、一起看见你就跑。心境是叠在种族行为之上的一层「个体性格」，
 * 出生时抽一次，之后每隔十几秒还会换一次 —— 于是同一个池塘里
 * 有鱼在打盹、有鱼在发疯、有鱼好奇地远远跟着你、有鱼扎堆聊天。
 *
 * 设计约束（和 data/cosmetics.ts 同一套思路）：
 *   1. **默认 = 旧行为**：`CALM` 的所有倍率都是 1，等于「没有心境」，
 *      所以旧存档 / 旧测试 / 没走随机的实体完全不受影响。
 *   2. **心境分两类**：
 *      · 数值型（ALERT / FEARFUL）—— 只改速度、灵活度、感知范围，行为仍走种族逻辑；
 *      · 接管型（SLEEPY / CURIOUS / SOCIABLE / HUNGRY / FRENZY）——
 *        在种族行为**之前**接管这一帧，做出种族本来做不出的举动。
 *   3. **按种族加权**：凶鱼更容易饿/狂躁，胆小鱼更容易胆怯/扎堆，
 *      磷虾这种食物一律悠闲（画了也看不出来，还白算）。
 *
 * 纯函数 + `as const` 注册表，方便测试与将来做「鱼苗性格遗传」。
 */

import type { CreatureConfig } from './creatures';

export const MOOD_DATA = {
  /** 悠闲：默认状态，完全按种族行为来 */
  CALM: {
    name: '悠闲',
    emoji: '～',
    badge: '',
    speedMult: 1.0,
    agilityMult: 1.0,
    perceptionMult: 1.0,
    desc: '按本能游动，不好奇也不紧张。',
  },
  /** 警觉：看得更远、转得更快，但行为不变 */
  ALERT: {
    name: '警觉',
    emoji: '👁',
    badge: '👁',
    speedMult: 1.1,
    agilityMult: 1.25,
    perceptionMult: 1.6,
    desc: '眼观六路，比你先发现对方。',
  },
  /** 胆怯：威胁还没走近就跑 */
  FEARFUL: {
    name: '胆怯',
    emoji: '😰',
    badge: '😰',
    speedMult: 1.15,
    agilityMult: 1.15,
    perceptionMult: 1.5,
    desc: '风吹草动就掉头，跑得比平时快。',
  },
  /** 饥饿：主动搜寻比自己小的目标，连温顺的鱼也会开荤 */
  HUNGRY: {
    name: '饥饿',
    emoji: '🤤',
    badge: '🤤',
    speedMult: 1.15,
    agilityMult: 1.1,
    perceptionMult: 1.35,
    desc: '饿红了眼，见着比自己小的就追。',
  },
  /** 好奇：远远跟着你，但不靠近也不攻击 */
  CURIOUS: {
    name: '好奇',
    emoji: '👀',
    badge: '👀',
    speedMult: 1.05,
    agilityMult: 1.0,
    perceptionMult: 1.2,
    desc: '对你很好奇，保持距离地跟着看。',
  },
  /** 群聚：往同类身边凑，形成鱼群 */
  SOCIABLE: {
    name: '群聚',
    emoji: '🐟',
    badge: '🐟',
    speedMult: 1.0,
    agilityMult: 1.0,
    perceptionMult: 1.1,
    desc: '爱扎堆，总往同类身边游。',
  },
  /** 瞌睡：几乎不动地上下漂，被逼近才惊醒 */
  SLEEPY: {
    name: '瞌睡',
    emoji: '💤',
    badge: '💤',
    speedMult: 0.35,
    agilityMult: 0.6,
    perceptionMult: 0.5,
    desc: '在原地打盹，被逼近才会惊醒。',
  },
  /** 狂躁：无视体型差距乱咬，稀有且危险 */
  FRENZY: {
    name: '狂躁',
    emoji: '💢',
    badge: '💢',
    speedMult: 1.35,
    agilityMult: 1.3,
    perceptionMult: 1.4,
    desc: '六亲不认，见谁咬谁。',
  },
} as const;

export type MoodId = keyof typeof MOOD_DATA;

/** 心境 ID 列表（UI 展示 / 测试遍历用） */
export const MOOD_IDS = Object.keys(MOOD_DATA) as MoodId[];

/** 默认心境 —— 所有倍率都是 1，等于「没有心境」，保证向后兼容 */
export const DEFAULT_MOOD: MoodId = 'CALM';

/** 心境持续时长（帧）：到期后重新抽一次，鱼群才会「活着」 */
export const MOOD_REROLL_FRAMES = { min: 600, max: 1800 } as const;

export interface MoodData {
  name: string;
  emoji: string;
  /** 头顶徽章；空串表示不显示（悠闲不打扰视线） */
  badge: string;
  speedMult: number;
  agilityMult: number;
  perceptionMult: number;
  desc: string;
}

/**
 * 取心境数据。**未知 id 一律回退到 CALM，绝不返回 undefined** ——
 * 旧存档、手工构造的实体、拼错的 id 都按「没心境」处理，行为不变。
 */
export const getMood = (id?: string | null): MoodData & { id: MoodId } => {
  const key = (id ?? '') as MoodId;
  const data = MOOD_DATA[key] ?? MOOD_DATA[DEFAULT_MOOD];
  return { id: MOOD_DATA[key] ? key : DEFAULT_MOOD, ...data };
};

/** 心境持续时长：随机一个，避免全场同时切换 */
export const randomMoodTimer = (): number =>
  MOOD_REROLL_FRAMES.min +
  Math.floor(Math.random() * (MOOD_REROLL_FRAMES.max - MOOD_REROLL_FRAMES.min));

/** 加权抽签：总权重里按各自权重取一段 */
const weightedPick = (weights: Record<MoodId, number>): MoodId => {
  const entries = MOOD_IDS.map((id) => [id, Math.max(0, weights[id])] as const);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return DEFAULT_MOOD;
  let roll = Math.random() * total;
  for (const [id, w] of entries) {
    roll -= w;
    if (roll < 0) return id;
  }
  return DEFAULT_MOOD;
};

/**
 * 每种心境的权重 —— 按种族性格与体型档位调整。
 * 抽出来的分布大概长这样：悠闲最多（鱼塘里大部分时间在发呆），
 * 狂躁最少（稀有且危险，全场乱咬就没法玩了）。
 *
 * 导出是为了让测试能直接钉住「设计意图」（凶猛鱼 FRENZY 权重更高），
 * 而不用去掷骰子做概率断言 —— 随机断言迟早 flake。
 */
export const moodWeights = (config: CreatureConfig): Record<MoodId, number> => {
  const tier = config.tier; // 1 小鱼 ~ 4 霸主
  const fierce = config.damage >= 12;
  const behavior = config.behavior;
  const hunter = behavior === 'AGGRESSIVE' || behavior === 'BOSS' || behavior === 'AMBUSH';
  const timid = behavior === 'FLEE' || behavior === 'PASSIVE';

  return {
    CALM: 40,
    ALERT: 12 + tier * 2,
    FEARFUL: (timid ? 18 : 5) + (tier <= 1 ? 8 : 0),
    HUNGRY: (hunter ? 22 : 6) + tier * 2,
    CURIOUS: behavior === 'BOSS' ? 2 : 10,
    SOCIABLE: tier <= 2 ? 12 : 5,
    SLEEPY: (timid ? 10 : 3) + (tier <= 1 ? 3 : 0),
    FRENZY: (fierce ? 6 : 1) + (behavior === 'BOSS' ? 4 : 0),
  };
};

/**
 * 生成一条 AI 鱼的心境。
 * 磷虾（tier 0）是食物，一律悠闲 —— 它活不过两秒，随机状态纯属浪费。
 */
export const randomizeMood = (config: CreatureConfig): MoodId => {
  if (config.tier <= 0) return DEFAULT_MOOD;
  return weightedPick(moodWeights(config));
};
