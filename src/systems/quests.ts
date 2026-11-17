import { GameStatus, type GameState, type FrameContext, type GameEvents } from '../types';
import type { EventBus } from '../core/EventBus';
import { ENDLESS_WORLD_CONFIG } from '../data/endlessWorld';
import { QUEST_CHAPTERS, VOYAGE_BONUS, createVoyageQuests, describeQuestReward, questProgress, type QuestReward } from '../data/quests';
import { awardPlayerGrowth } from './playerGrowth';

interface QuestFrame {
  state: GameState; x: number; y: number; pond: string; originX: string; originY: string; possessions: number; settling: boolean;
}
const bindings = new WeakMap<EventBus<GameEvents>, { frame: QuestFrame | null }>();

/** One set of listeners per bus, scoped to the current frame so runs cannot share progress. */
export const beginQuestFrame = (state: GameState, ctx: FrameContext): void => {
  if (!state.quests || state.status !== GameStatus.PLAYING) return;
  let binding = bindings.get(ctx.events);
  if (!binding) {
    binding = { frame: null }; bindings.set(ctx.events, binding);
    const stats = () => binding!.frame && !binding!.frame.settling ? binding!.frame.state.quests?.stats : null;
    ctx.events.on('eat', p => { const s = stats(); if (s && p.attacker.id === 'player') s.eaten++; });
    ctx.events.on('skill', p => { const s = stats(); if (s && p.entity.id === 'player') s.skills++; });
    ctx.events.on('coin', () => { const s = stats(); if (s) s.pickups++; });
    ctx.events.on('pickup', p => {
      const s = stats();
      // Breaking a brittle rock is feedback, not a collected item. Actual loot has its own pickup.
      if (s && p.label !== '岩层破碎') s.pickups++;
    });
  }
  binding.frame = { state, x: state.player.x, y: state.player.y, pond: state.pondId,
    originX: state.endlessWorld?.originChunkX ?? '0', originY: state.endlessWorld?.originChunkY ?? '0', possessions: state.squad.possessCount, settling: false };
};
export const endQuestFrame = (ctx: FrameContext): void => { const binding = bindings.get(ctx.events); if (binding) binding.frame = null; };

const awardReward = (state: GameState, ctx: FrameContext, reward: QuestReward): void => {
  const p = state.player;
  if (reward.growth) awardPlayerGrowth(state, ctx, reward.growth);
  state.score += reward.score ?? 0;
  if (reward.heal) p.health = Math.min(p.maxHealth, p.health + p.maxHealth * reward.heal);
  if (reward.shieldSeconds) p.shieldTimer = Math.max(p.shieldTimer ?? 0, reward.shieldSeconds * 60);
};

export const questsSystem = (state: GameState, ctx: FrameContext): void => {
  const run = state.quests, frame = bindings.get(ctx.events)?.frame;
  if (!run || !frame || frame.state !== state || frame.settling) return;
  frame.settling = true;
  const p = state.player;
  if (run.notice && --run.notice.timer <= 0) run.notice = null;
  run.stats.recruits = Math.max(run.stats.recruits, state.squad.recruitedTotal);
  run.stats.highestLevel = Math.max(run.stats.highestLevel, p.level);
  if (p.currentBiome && !run.stats.biomes.includes(p.currentBiome)) run.stats.biomes.push(p.currentBiome);
  if (frame.pond === state.pondId && frame.possessions === state.squad.possessCount) {
    // Apply only the origin difference; global coordinates may exceed Number.MAX_SAFE_INTEGER.
    const dx = BigInt(frame.originX) - BigInt(state.endlessWorld?.originChunkX ?? '0');
    const dy = BigInt(frame.originY) - BigInt(state.endlessWorld?.originChunkY ?? '0');
    const startX = frame.x + Number(dx) * ENDLESS_WORLD_CONFIG.CHUNK_SIZE;
    const startY = frame.y + Number(dy) * ENDLESS_WORLD_CONFIG.CHUNK_SIZE;
    const distance = Math.hypot(p.x - startX, p.y - startY);
    // Ordinary portals / possession can teleport a body: they are not swimming progress.
    if (distance > 0.1 && distance <= 100) {
      run.stats.distance += distance;
      if (p.boost.active) run.stats.dashFrames += ctx.dt;
    }
  }
  // A reward cannot rescue a lethal hit or alter an already recorded victory result.
  if (p.health <= 0 || state.status === GameStatus.GAME_OVER || state.status === GameStatus.VICTORY) return;
  const completed = run.quests.filter(q => !q.completed && questProgress(run, q) >= q.definition.goal);
  if (!completed.length) return;
  for (const quest of completed) {
    quest.completed = true; run.completedTotal++;
    awardReward(state, ctx, quest.definition.reward);
  }
  const chapterComplete = run.quests.every(q => q.completed);
  let reward = completed.map(q => describeQuestReward(q.definition.reward)).join(' / ');
  let title = completed.length === 1 ? `完成「${completed[0].definition.title}」` : `完成 ${completed.length} 个任务`;
  if (chapterComplete) {
    const chapter = QUEST_CHAPTERS[run.chapter];
    const bonus = chapter?.reward ?? VOYAGE_BONUS;
    awardReward(state, ctx, bonus);
    title = chapter ? `「${chapter.name}」完成！` : `远航委托 ${run.round} 完成！`;
    reward += ` / 阶段礼包：${describeQuestReward(bonus)}`;
    if (run.chapter < QUEST_CHAPTERS.length - 1) {
      run.chapter++;
      run.quests = QUEST_CHAPTERS[run.chapter].quests.map(definition => ({ definition, baseline: 0, completed: false }));
    } else {
      run.chapter = QUEST_CHAPTERS.length;
      run.round++;
      // Capture levels AFTER rewards; fresh contracts cannot auto-complete from old actions.
      run.stats.highestLevel = Math.max(run.stats.highestLevel, p.level);
      run.quests = createVoyageQuests(run);
    }
  }
  run.notice = { title, reward, timer: 300, chapterComplete };
  p.speechBubble = { text: title, timer: 120, color: '#a7f3d0' };
  ctx.events.emit('questReward', { title, reward, chapterComplete });
};
