import { LILY_OBSERVATION } from '../data/pondOpportunities';
import { scoreGain } from '../data/ponds';
import type { FrameContext, GameState } from '../types';
import { isFeedingEventMajorPhase } from './feedingEvents';

const enabled = (state: GameState): boolean =>
  state.run?.mode === 'RIVALS'
  && state.pondLayoutMode === 'PROCEDURAL'
  && !!state.pondLayout;

export const pondOpportunitySystem = (state: GameState, ctx: FrameContext): void => {
  const opportunity = state.pondOpportunity;
  if (!opportunity) return;
  const risingInteract = ctx.input.interact && !opportunity.interactHeld;
  opportunity.interactHeld = ctx.input.interact;
  opportunity.prompt = null;
  if (opportunity.lastResult) {
    opportunity.lastResult.timer -= 1;
    if (opportunity.lastResult.timer <= 0) opportunity.lastResult = null;
  }

  if (!enabled(state) || state.pondId !== 'CLEAR') {
    opportunity.targetLandmarkId = null;
    opportunity.phase = 'AVAILABLE';
    opportunity.timer = 0;
    return;
  }

  const lily = state.pondLayout!.landmarks.find(landmark => landmark.kind === 'LILY');
  if (!lily) return;
  opportunity.targetLandmarkId = lily.id;
  if (opportunity.claimedByPond.CLEAR) {
    opportunity.phase = 'COMPLETED';
    return;
  }

  const distance = Math.hypot(state.player.x - lily.x, state.player.y - lily.y);
  const inRange = distance <= lily.radius + LILY_OBSERVATION.INTERACT_PADDING;
  if (opportunity.phase === 'OBSERVING') {
    if (!inRange || isFeedingEventMajorPhase(state)) {
      opportunity.phase = 'AVAILABLE';
      opportunity.timer = 0;
      opportunity.lastResult = { text: !inRange ? '离开睡莲群，观察中断' : '主要争夺开始，观察延后', timer: 90 };
      return;
    }
    opportunity.prompt = `观察睡莲 ${Math.ceil(opportunity.timer / 60)}s`;
    opportunity.timer -= 1;
    if (opportunity.timer > 0) return;

    const heal = state.player.maxHealth * LILY_OBSERVATION.HEAL_RATIO;
    state.player.health = Math.min(state.player.maxHealth, state.player.health + heal);
    const gained = scoreGain(state.pondId, LILY_OBSERVATION.BASE_SCORE);
    state.score += gained;
    opportunity.claimedByPond.CLEAR = true;
    opportunity.phase = 'COMPLETED';
    opportunity.prompt = null;
    opportunity.lastResult = { text: `睡莲观察完成 · 恢复生命 · +${gained} 分`, timer: 150 };
    ctx.events.emit('treasure', { x: lily.x, y: lily.y, label: `睡莲观察 +${gained}`, color: '#86efac' });
    return;
  }

  opportunity.phase = 'AVAILABLE';
  if (!inRange) return;
  if (isFeedingEventMajorPhase(state)) {
    opportunity.prompt = '主要争夺进行中，稍后观察睡莲';
    return;
  }
  opportunity.prompt = '按 E 观察睡莲（2秒）';
  if (!risingInteract) return;
  opportunity.phase = 'OBSERVING';
  opportunity.timer = opportunity.duration;
  opportunity.lastResult = null;
};
