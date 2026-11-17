import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Gift, Target } from 'lucide-react';
import type { GameState } from '../types';
import { QUEST_CHAPTERS, VOYAGE_BONUS, describeQuestReward, questProgress, type QuestProgress } from '../data/quests';

const progressLabel = (value: number, quest: QuestProgress): string => {
  const goal = quest.definition.goal;
  if (quest.definition.metric === 'dashFrames') return `${(value / 60).toFixed(1)} / ${goal / 60} 秒`;
  if (quest.definition.metric === 'distance') return `${Math.floor(value)} / ${goal} 米`;
  return `${Math.floor(value)} / ${goal}`;
};

export default function QuestTracker({ gameState }: { gameState: GameState }) {
  const [expanded, setExpanded] = useState(true);
  const run = gameState.quests;
  if (!run) return null;
  const chapter = QUEST_CHAPTERS[run.chapter];
  const active = run.quests.find(q => !q.completed);
  const completed = run.quests.filter(q => q.completed).length;
  const title = chapter?.name ?? `远航委托 · ${run.round}`;
  const next = QUEST_CHAPTERS[run.chapter + 1]?.name ?? '远航委托';
  const nearestLoot = gameState.powerUps.reduce<{ distance: number; x: number; y: number } | null>((closest, item) => {
    const distance = Math.hypot(item.x - gameState.player.x, item.y - gameState.player.y);
    return !closest || distance < closest.distance ? { distance, x: item.x, y: item.y } : closest;
  }, null);
  const lootHint = nearestLoot ? `附近宝贝在${nearestLoot.y < gameState.player.y - 80 ? '上' : nearestLoot.y > gameState.player.y + 80 ? '下' : ''}${nearestLoot.x < gameState.player.x - 80 ? '左' : nearestLoot.x > gameState.player.x + 80 ? '右' : ''}方 · ${Math.round(nearestLoot.distance)} 米` : '留意宝藏预告，继续探索就会发现更多小宝贝。';

  return (
    <section aria-label="冒险任务" className="absolute top-8 right-8 z-30 w-[292px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-22rem)] flex flex-col pointer-events-auto rounded-3xl border border-emerald-200/30 bg-slate-900/95 shadow-2xl backdrop-blur-sm overflow-hidden">
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-label={expanded ? '收起冒险任务' : '展开冒险任务'} className="w-full shrink-0 flex items-center gap-2 p-3.5 text-left bg-gradient-to-r from-emerald-400/15 to-cyan-400/10">
        <span className="w-9 h-9 rounded-2xl bg-emerald-200 text-emerald-900 grid place-items-center"><Target size={20} /></span>
        <span className="flex-1 min-w-0"><span className="block text-[10px] text-emerald-200/80 tracking-wider">冒险任务 · 已完成 {run.completedTotal} 个</span><span className="block text-sm font-black text-emerald-50">{chapter ? `第 ${run.chapter + 1} 章 · ` : ''}{title}</span></span>
        {expanded ? <ChevronUp size={16} className="text-emerald-200" /> : <ChevronDown size={16} className="text-emerald-200" />}
      </button>
      {expanded ? (
        <div className="min-h-0 overflow-y-auto p-3 space-y-2">
          <p className="text-[11px] text-slate-300 leading-relaxed">{chapter?.description ?? '继续远航，三个小目标完成后开启下一轮委托。'}<span className="text-emerald-200"> 完成自动领奖。</span></p>
          {run.quests.map(quest => {
            const value = questProgress(run, quest), definition = quest.definition;
            return (
              <div key={definition.id} data-quest={definition.id} className={`rounded-2xl border p-2.5 ${quest.completed ? 'border-emerald-400/25 bg-emerald-400/10' : 'border-slate-700/80 bg-slate-800/70'}`}>
                <div className="flex items-center gap-2"><span className="text-xl">{definition.icon}</span><span className="flex-1 text-xs font-bold text-white">{definition.title}</span><span className="text-[10px] font-bold text-emerald-200">{quest.completed ? <span className="flex items-center gap-0.5"><Check size={12} /> 已领奖</span> : progressLabel(value, quest)}</span></div>
                <p className="mt-1 text-[11px] text-slate-300">{definition.description}</p>
                <div role="progressbar" aria-label={`${definition.title}进度`} aria-valuemin={0} aria-valuemax={definition.goal} aria-valuenow={Math.floor(value)} className="mt-1.5 h-1.5 rounded-full bg-slate-700 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 transition-all duration-200" style={{ width: `${value / definition.goal * 100}%` }} /></div>
                <p className="mt-1.5 text-[10px] text-amber-200"><Gift size={10} className="inline mr-1" />{describeQuestReward(definition.reward)}</p>
                {!quest.completed && <p className="mt-1 text-[10px] text-slate-400 leading-relaxed">{definition.hint}{definition.metric === 'pickups' && <span className="block text-cyan-200/80 mt-0.5">{lootHint}</span>}</p>}
              </div>
            );
          })}
          <div className="rounded-2xl bg-amber-200/10 border border-amber-200/20 p-2.5 text-[10px] leading-relaxed"><span className="block font-bold text-amber-100">🎁 阶段礼包 · {completed} / 3</span><span className="text-amber-200/90">{describeQuestReward(chapter?.reward ?? VOYAGE_BONUS)}</span><span className="block text-slate-400 mt-1">完成后开启：{next}</span></div>
        </div>
      ) : active && <p className="px-3.5 py-2.5 text-xs text-emerald-100">{active.definition.icon} {active.definition.title}<span className="float-right text-emerald-200/70">{progressLabel(questProgress(run, active), active)}</span></p>}
      {run.notice && <div role="status" className="shrink-0 max-h-28 overflow-y-auto border-t border-emerald-200/20 bg-emerald-200/10 p-3 text-[11px] leading-relaxed"><p className="text-emerald-100 font-bold">{run.notice.chapterComplete ? '🎉' : '🎁'} {run.notice.title}</p><p className="text-amber-100 mt-1">已到账：{run.notice.reward}</p></div>}
    </section>
  );
}
