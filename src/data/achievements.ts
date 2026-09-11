/**
 * 成就定义（待办③）。
 *
 * 设计原则：
 *  - 只统计**真实存在的事件/状态**（GameEvents 里有的、GameState 里有的），不画饼。
 *  - 跨局累计：进度存 localStorage，换鱼、重开不清零。
 *  - 文案按玩家视角写，包括那个「被小鱼反杀」的搞笑成就 —— 逆转是玩家的高光时刻，
 *    反过来被逆杀就是耻辱柱，值得一枚成就。
 */

/** 成就统计键。biomes 是集合，取值时用 size，其余全是数字 */
export type AchievementStatKey =
  | 'eaten'
  | 'backstabs'
  | 'maxLevel'
  | 'evolutions'
  | 'reversals'
  | 'treasures'
  | 'biomes'
  | 'recruits'
  | 'possessions';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  /** emoji 图标，避免 UI 层和数据层互相耦合 */
  icon: string;
  goal: number;
  stat: AchievementStatKey;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-blood',
    name: '初次开饭',
    desc: '吃掉第一条鱼',
    icon: '🍽️',
    goal: 1,
    stat: 'eaten',
  },
  {
    id: 'glutton',
    name: '老饕',
    desc: '累计吞噬 25 条鱼',
    icon: '🍢',
    goal: 25,
    stat: 'eaten',
  },
  {
    id: 'apex',
    name: '饕餮巨兽',
    desc: '累计吞噬 100 条鱼',
    icon: '👑',
    goal: 100,
    stat: 'eaten',
  },
  {
    id: 'backstab',
    name: '背刺大师',
    desc: '绕到大鱼身后背刺吞噬 10 次',
    icon: '🗡️',
    goal: 10,
    stat: 'backstabs',
  },
  {
    id: 'lv10',
    name: '步步高升',
    desc: '达到 Lv.10',
    icon: '📈',
    goal: 10,
    stat: 'maxLevel',
  },
  {
    id: 'evolve1',
    name: '蜕变',
    desc: '完成第一次进化',
    icon: '✨',
    goal: 1,
    stat: 'evolutions',
  },
  {
    id: 'evolve3',
    name: '完全体',
    desc: '累计进化 3 次',
    icon: '🧬',
    goal: 3,
    stat: 'evolutions',
  },
  {
    id: 'reversal',
    name: '阴沟里翻船',
    desc: '被比自己小一半的鱼反杀 1 次',
    icon: '💀',
    goal: 1,
    stat: 'reversals',
  },
  {
    id: 'treasure5',
    name: '拾荒者',
    desc: '捡到 5 个宝藏',
    icon: '🎁',
    goal: 5,
    stat: 'treasures',
  },
  {
    id: 'biomes4',
    name: '环游海洋',
    desc: '到访全部 4 种生态区',
    icon: '🗺️',
    goal: 4,
    stat: 'biomes',
  },
  {
    id: 'recruit10',
    name: '招兵买马',
    desc: '累计收编 10 名战队队员',
    icon: '🐟',
    goal: 10,
    stat: 'recruits',
  },
  {
    id: 'possess3',
    name: '灵魂大师',
    desc: '阵亡后夺舍小弟续命 3 次',
    icon: '👻',
    goal: 3,
    stat: 'possessions',
  },
];
