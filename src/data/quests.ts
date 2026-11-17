export type QuestMetric = 'eaten' | 'distance' | 'dashFrames' | 'pickups' | 'recruits' | 'skills' | 'biomes' | 'levels';
export interface QuestReward { growth?: number; score?: number; heal?: number; shieldSeconds?: number }
export interface QuestDefinition {
  id: string; title: string; icon: string; description: string; hint: string;
  metric: QuestMetric; goal: number; reward: QuestReward;
}
export interface QuestProgress { definition: QuestDefinition; baseline: number; completed: boolean }
export interface QuestRun {
  chapter: number;
  round: number;
  completedTotal: number;
  stats: { eaten: number; distance: number; dashFrames: number; pickups: number; recruits: number; skills: number; biomes: string[]; startingLevel: number; highestLevel: number };
  quests: QuestProgress[];
  notice: { title: string; reward: string; timer: number; chapterComplete: boolean } | null;
}

export const QUEST_CHAPTERS: readonly { name: string; description: string; reward: QuestReward; quests: readonly QuestDefinition[] }[] = [
  {
    name: '小鱼出发', description: '先填饱肚子，再学会在海里灵活穿梭。', reward: { growth: 4, score: 40 },
    quests: [
      { id: 'first-meal', title: '开饭啦', icon: '🍪', description: '吃掉 3 只小生物', hint: '先找浮游生物和小虾，避开比自己大的鱼。', metric: 'eaten', goal: 3, reward: { growth: 4, score: 20 } },
      { id: 'first-swim', title: '逛逛新家', icon: '🫧', description: '累计游动 600 米', hint: '跟随鼠标游动，沿着空旷的水路探索。', metric: 'distance', goal: 600, reward: { score: 30, heal: 0.15 } },
      { id: 'first-dash', title: '小尾巴冲冲', icon: '💨', description: '游动时累计加速 2 秒', hint: '按住空格加速，松开后恢复能量；分几次也算。', metric: 'dashFrames', goal: 120, reward: { growth: 3, shieldSeconds: 5 } },
    ],
  },
  {
    name: '寻宝小队', description: '发现小宝贝，结交伙伴，让技能派上用场。', reward: { growth: 6, score: 60 },
    quests: [
      { id: 'little-treasures', title: '口袋里的宝贝', icon: '🐚', description: '拾取 3 次道具、金币或宝藏', hint: '寻找金色光点、贝壳和漂流瓶；宝藏会提前预告。', metric: 'pickups', goal: 3, reward: { growth: 5, score: 40 } },
      { id: 'little-team', title: '一起去冒险', icon: '🐟', description: '累计收编 3 位伙伴', hint: '吃掉小鱼会把它们收编到战队；浮游生物不入队。', metric: 'recruits', goal: 3, reward: { heal: 0.25, shieldSeconds: 6 } },
      { id: 'little-magic', title: '露一小手', icon: '✨', description: '成功释放技能 2 次', hint: '达到 Lv.3 后，右键使用鱼的技能，Q 使用流派技能。', metric: 'skills', goal: 2, reward: { growth: 5, score: 40 } },
    ],
  },
  {
    name: '海洋探险家', description: '带着小队探索新海域，成长为独当一面的小鱼。', reward: { growth: 8, score: 100, shieldSeconds: 8 },
    quests: [
      { id: 'ocean-tour', title: '海底散步地图', icon: '🪸', description: '到访 2 种生态区', hint: '初始生态区也算；向不同颜色的水域游，换塘也保留进度。', metric: 'biomes', goal: 2, reward: { score: 80, shieldSeconds: 6 } },
      { id: 'ocean-feast', title: '今天胃口真好', icon: '🍓', description: '本局累计吃掉 20 只小生物', hint: '多吃安全的小目标，伙伴的击杀不代替你的进食。', metric: 'eaten', goal: 20, reward: { growth: 8, score: 60 } },
      { id: 'ocean-growth', title: '长大一点点', icon: '🌟', description: '比开局提升 3 级', hint: '进食、宝藏和任务奖励都帮助成长，达到门槛后可选择进化。', metric: 'levels', goal: 3, reward: { growth: 6, score: 60 } },
    ],
  },
];

export const questValue = (run: QuestRun, metric: QuestMetric): number => {
  if (metric === 'biomes') return run.stats.biomes.length;
  if (metric === 'levels') return Math.max(0, run.stats.highestLevel - run.stats.startingLevel);
  return run.stats[metric];
};
export const questProgress = (run: QuestRun, quest: QuestProgress): number =>
  quest.completed ? quest.definition.goal : Math.min(quest.definition.goal, Math.max(0, questValue(run, quest.definition.metric) - quest.baseline));

export const describeQuestReward = (reward: QuestReward): string => [
  reward.growth ? `成长 +${reward.growth}` : '', reward.score ? `积分 +${reward.score}` : '',
  reward.heal ? `恢复 ${Math.round(reward.heal * 100)}% 生命` : '', reward.shieldSeconds ? `${reward.shieldSeconds} 秒护盾` : '',
].filter(Boolean).join(' · ');

export const createQuestRun = (level: number): QuestRun => ({
  chapter: 0, round: 0, completedTotal: 0,
  stats: { eaten: 0, distance: 0, dashFrames: 0, pickups: 0, recruits: 0, skills: 0, biomes: [], startingLevel: level, highestLevel: level },
  quests: QUEST_CHAPTERS[0].quests.map(definition => ({ definition, baseline: 0, completed: false })), notice: null,
});

/** Repeat contracts use fresh baselines and bounded goals; old completed entries are discarded. */
export const createVoyageQuests = (run: QuestRun): QuestProgress[] => {
  const round = run.round;
  const definitions: QuestDefinition[] = [
    { id: `voyage-meal-${round}`, title: '旅途加餐', icon: '🍪', description: '再吃掉 8 只小生物', hint: '找安全的小目标，沿途慢慢积累。', metric: 'eaten', goal: 8, reward: { growth: 5, score: 60 } },
    { id: `voyage-swim-${round}`, title: '追着海风走', icon: '🧭', description: '再游动 1200 米', hint: '沿开阔水路继续前进，不需要离开当前地图。', metric: 'distance', goal: 1200, reward: { score: 70, heal: 0.2 } },
    round % 2 ?
      { id: `voyage-loot-${round}`, title: '寻宝小能手', icon: '🎁', description: '再拾取 3 次宝贝', hint: '道具、金币和宝藏都算，留意小地图上的金色光点。', metric: 'pickups', goal: 3, reward: { growth: 5, shieldSeconds: 6 } } :
      { id: `voyage-skill-${round}`, title: '冒险小魔法', icon: '✨', description: '再成功释放 3 次技能', hint: '右键和 Q 都算，等技能冷却完成后再使用。', metric: 'skills', goal: 3, reward: { growth: 5, shieldSeconds: 6 } },
  ];
  return definitions.map(definition => ({ definition, baseline: questValue(run, definition.metric), completed: false }));
};
export const VOYAGE_BONUS: QuestReward = { score: 100, heal: 0.2 };
