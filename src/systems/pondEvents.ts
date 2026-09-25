/**
 * 塘专属事件系统 —— 「多鱼塘」阶段 3a。
 *
 * 每塘独有的大世界节奏：珊瑚塘定期「珊瑚产卵夜」（金币洒落），
 * 深渊塘定期「星光鱼群潮」（星光鱼成群过境）。清水塘没有事件 —— 稳就是它的性格。
 *
 * 实现只有一个通用执行器：触发节奏与内容全部来自 data/pondEvents.ts 的配置表，
 * 加新事件 = 表里加一行 + 这里补一个 kind 分支（或者复用现有 kind）。
 *
 * 设计约定：
 *   - 事件以玩家为中心落点 —— 刷在旁边玩家才看得见，刷在地图角落等于没刷；
 *   - 逐个落点做合法性检查，越界或无效位置的个体直接跳过，绝不硬塞。
 */

import { POND_EVENT_DATA, type PondEventConfig } from '../data/pondEvents';
import { MAX_ENTITIES } from '../data/world';
import type { GameState, FrameContext } from '../types';
import { uuid } from '../core/math';
import { isPositionValid } from './terrain';
import { createEntity } from './spawn';
import { createLayoutRandom } from '../data/pondLayout';
import { isFeedingEventMajorPhase } from './feedingEvents';
import { isExplorationMajorPhase } from './explorationEvents';

const announce = (
  state: GameState,
  ctx: FrameContext,
  conf: PondEventConfig,
  suffix: string,
  anchor: { x: number; y: number } = state.player,
): void => {
  ctx.events.emit('treasure', {
    x: anchor.x,
    y: anchor.y - 120,
    label: `${conf.name}！${suffix}`,
    color: conf.color,
  });
};

export const pondEventSystem = (state: GameState, ctx: FrameContext): void => {
  // 未知塘 id 一律查不到配置 → 不触发（POND_EVENT_DATA 键即合法塘）
  const conf = POND_EVENT_DATA[(state.pondId ?? '') as keyof typeof POND_EVENT_DATA] ?? null;
  if (!conf) return;
  if (state.lastPondEventFrame === state.time) return;

  const procedural = state.run?.mode === 'RIVALS'
    && state.pondLayoutMode === 'PROCEDURAL'
    && !!state.pondLayout;
  const due = state.time > 0 && state.time % conf.interval === 0;
  if (!procedural && !due) return;
  if (procedural) {
    if (due && !state.pendingPondEvent) {
      state.pendingPondEvent = { pondId: state.pondId, scheduledAt: state.time };
    }
    const pending = state.pendingPondEvent;
    if (!pending || pending.pondId !== state.pondId) return;
    const majorConflict = isFeedingEventMajorPhase(state)
      || isExplorationMajorPhase(state)
      || Boolean(state.run?.bossId);
    if (majorConflict) return;
  }

  const player = state.player;
  const scheduledAt = state.pendingPondEvent?.scheduledAt ?? state.time;
  const eventRandom = procedural
    ? createLayoutRandom(state.pondLayout!.seed, state.pondId, `pond-event-${conf.kind}-${scheduledAt}`, state.pondLayout!.version)
    : Math.random;

  /* ── 珊瑚产卵夜：金币洒落在玩家周围 ── */
  if (conf.kind === 'COIN_RAIN') {
    const nursery = procedural
      ? state.pondLayout!.landmarks.find(landmark => landmark.kind === 'NURSERY')
      : undefined;
    const center = nursery ?? player;
    let spawned = 0;
    for (let i = 0; i < conf.count; i += 1) {
      let x = center.x;
      let y = center.y;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const ang = eventRandom() * Math.PI * 2;
        const d = eventRandom() * conf.radius;
        const candidateX = center.x + Math.cos(ang) * d;
        const candidateY = center.y + Math.sin(ang) * d;
        if (!isPositionValid(candidateX, candidateY, 20, state.pondId, state.worldMode)) continue;
        x = candidateX;
        y = candidateY;
        break;
      }
      if (!isPositionValid(x, y, 20, state.pondId, state.worldMode)) continue;
      state.powerUps.push({
        id: procedural ? `layout-coin-${state.pondId}-${scheduledAt}-${i + 1}` : uuid(),
        x, y, type: 'COIN', radius: 14,
      });
      spawned += 1;
    }
    if (spawned > 0) announce(state, ctx, conf, '金币洒落', center);
    state.lastPondEventFrame = state.time;
    if (procedural) state.pendingPondEvent = null;
    return;
  }

  /* ── 星光鱼群潮：特产鱼成群过境（一群出现在同侧，像一条发光的河） ── */
  if (conf.kind === 'SCHOOL' && conf.creature) {
    const route = procedural ? state.pondLayout!.routes.find(candidate => candidate.id === 'abyss-starlight') : undefined;
    const start = route?.points[0];
    const baseAng = eventRandom() * Math.PI * 2;
    const baseDist = conf.radius * 0.7;
    let spawned = 0;
    for (let i = 0; i < conf.count && state.entities.length < MAX_ENTITIES; i += 1) {
      let x = start?.x ?? player.x;
      let y = start?.y ?? player.y;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const ang = baseAng + (eventRandom() - 0.5) * 0.9;
        const d = baseDist * (0.6 + eventRandom() * 0.5);
        const candidateX = start ? start.x + Math.cos(ang) * (25 + eventRandom() * 90) : player.x + Math.cos(ang) * d;
        const candidateY = start ? start.y + Math.sin(ang) * (25 + eventRandom() * 90) : player.y + Math.sin(ang) * d;
        if (!isPositionValid(candidateX, candidateY, 50, state.pondId, state.worldMode)) continue;
        x = candidateX;
        y = candidateY;
        break;
      }
      if (!isPositionValid(x, y, 50, state.pondId, state.worldMode)) continue;
      const entity = createEntity(conf.creature, x, y);
      if (route) entity.eventRoute = { routeId: route.id, waypointIndex: 1 };
      state.entities.push(entity);
      spawned += 1;
    }
    if (spawned > 0) announce(state, ctx, conf, '别眨眼', route?.points[1] ?? player);
    state.lastPondEventFrame = state.time;
    if (procedural) state.pendingPondEvent = null;
  }
};
