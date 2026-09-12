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

const announce = (state: GameState, ctx: FrameContext, conf: PondEventConfig, suffix: string): void => {
  ctx.events.emit('treasure', {
    x: state.player.x,
    y: state.player.y - 120,
    label: `${conf.name}！${suffix}`,
    color: conf.color,
  });
};

export const pondEventSystem = (state: GameState, ctx: FrameContext): void => {
  // 未知塘 id 一律查不到配置 → 不触发（POND_EVENT_DATA 键即合法塘）
  const conf = POND_EVENT_DATA[(state.pondId ?? '') as keyof typeof POND_EVENT_DATA] ?? null;
  if (!conf) return;
  if (state.time <= 0 || state.time % conf.interval !== 0) return;

  const player = state.player;

  /* ── 珊瑚产卵夜：金币洒落在玩家周围 ── */
  if (conf.kind === 'COIN_RAIN') {
    let spawned = 0;
    for (let i = 0; i < conf.count; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.random() * conf.radius;
      const x = player.x + Math.cos(ang) * d;
      const y = player.y + Math.sin(ang) * d;
      if (!isPositionValid(x, y, 20)) continue;
      state.powerUps.push({ id: uuid(), x, y, type: 'COIN', radius: 14 });
      spawned += 1;
    }
    if (spawned > 0) announce(state, ctx, conf, '金币洒落');
    return;
  }

  /* ── 星光鱼群潮：特产鱼成群过境（一群出现在同侧，像一条发光的河） ── */
  if (conf.kind === 'SCHOOL' && conf.creature) {
    const baseAng = Math.random() * Math.PI * 2;
    const baseDist = conf.radius * 0.7;
    let spawned = 0;
    for (let i = 0; i < conf.count && state.entities.length < MAX_ENTITIES; i += 1) {
      const ang = baseAng + (Math.random() - 0.5) * 0.9;
      const d = baseDist * (0.6 + Math.random() * 0.5);
      const x = player.x + Math.cos(ang) * d;
      const y = player.y + Math.sin(ang) * d;
      if (!isPositionValid(x, y, 50)) continue;
      state.entities.push(createEntity(conf.creature, x, y));
      spawned += 1;
    }
    if (spawned > 0) announce(state, ctx, conf, '别眨眼');
  }
};
