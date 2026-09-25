/**
 * 道具系统 —— 漂流瓶、贝壳、加速、护盾。
 *
 * 武器道具（机甲变身 / 鱼雷 / 军火库）已按需求移除：这是大鱼吃小鱼，
 * 不是海战游戏，打架靠嘴和技能。
 *
 * 加新道具只要：
 *   1. 在 types.ts 的 PowerUp['type'] 加一个类型
 *   2. 在下面的 PICKUP_HANDLERS 加一条处理
 */

import { MAX_POWERUPS, WORLD_SIZE, GAME_MECHANICS } from '../data/world';
import { scoreGain } from '../data/ponds';
import type { GameState, FrameContext, PowerUp } from '../types';
import { dist, uuid } from '../core/math';
import { isPositionValid } from './terrain';
import { createCookieParticle } from './combat';

type PickupHandler = (state: GameState, ctx: FrameContext, item: PowerUp) => void;

const PICKUP_HANDLERS: Record<PowerUp['type'], PickupHandler> = {
  /** 漂流瓶：技能等级 +1，跨局保存在 localStorage */
  BOTTLE: (state, ctx, item) => {
    state.player.skillLevel += 1;
    state.player.speechBubble = { text: '技能等级 +1!', timer: 60, color: '#60a5fa' };
    try {
      localStorage.setItem('skillLevel', String(state.player.skillLevel));
    } catch {
      // 隐私模式下 localStorage 可能不可用，忽略即可，不影响游戏
    }
    ctx.events.emit('pickup', { x: item.x, y: item.y, label: '技能 +1', color: '#60a5fa' });
  },

  /** 贝壳：50% 等级+2 / 50% 护盾（原机甲变身分支已随武器系统移除） */
  SHELL: (state, ctx, item) => {
    if (Math.random() < 0.5) {
      state.player.level += 2;
      state.player.weight += 20;
      state.player.radius += 5;
      state.player.speechBubble = { text: '等级 +2！', timer: 90, color: '#10b981' };
      ctx.events.emit('pickup', { x: item.x, y: item.y, label: '等级 +2', color: '#10b981' });
    } else {
      state.player.shieldTimer = GAME_MECHANICS.SHIELD_DURATION;
      state.player.speechBubble = { text: '获得护盾！', timer: 90, color: '#38bdf8' };
      ctx.events.emit('pickup', { x: item.x, y: item.y, label: '护盾', color: '#38bdf8' });
    }
  },

  /** 加速道具 */
  SPEED: (state, ctx, item) => {
    state.player.speedBoostTimer = GAME_MECHANICS.SPEED_ITEM_DURATION;
    ctx.events.emit('pickup', { x: item.x, y: item.y, label: '加速', color: '#38bdf8' });
  },

  /** 护盾道具 */
  SHIELD: (state, ctx, item) => {
    state.player.shieldTimer = GAME_MECHANICS.SHIELD_DURATION;
    ctx.events.emit('pickup', { x: item.x, y: item.y, label: '护盾', color: '#38bdf8' });
  },

  /**
   * 金币：收集系统（待办④）。纯加分不走负重，是「到处逛逛」的奖励。
   * 成簇投放（见下方 spawn），捡起来有连环进账的爽感；成就「守财奴」挂在 coin 事件上。
   */
  COIN: (state, ctx, item) => {
    const value = 15;
    // 得分过塘倍率（危险塘的硬币更值钱）
    const gained = scoreGain(state.pondId, value);
    state.score += gained;
    state.player.speechBubble = { text: `+${gained} 金币！`, timer: 45, color: '#fbbf24' };
    ctx.events.emit('coin', { x: item.x, y: item.y, value });
  },
};

export const itemsSystem = (state: GameState, ctx: FrameContext): void => {
  const player = state.player;
  const randomWorldPoint = (minDistance = 480, maxDistance = 2200): { x: number; y: number } => {
    if (state.worldMode !== 'ENDLESS') {
      return { x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE };
    }
    const angle = Math.random() * Math.PI * 2;
    const distance = minDistance + Math.random() * Math.max(0, maxDistance - minDistance);
    return { x: player.x + Math.cos(angle) * distance, y: player.y + Math.sin(angle) * distance };
  };

  /* ── 1. 随机投放漂流瓶 / 贝壳 ── */
  if (Math.random() < 0.007 && state.powerUps.length < MAX_POWERUPS) {
    const isShell = Math.random() < 0.3;
    const { x, y } = randomWorldPoint();
    if (isPositionValid(x, y, 100, state.pondId, state.worldMode)) {
      state.powerUps.push({
        id: uuid(),
        x,
        y,
        type: isShell ? 'SHELL' : 'BOTTLE',
        radius: isShell ? 30 : 20,
      });
    }
  }

  /* ── 1.5 金币成簇投放：一滩 3~5 枚，散落在小半径里，捡起来像刮清一波 ── */
  if (state.time % 480 === 0 && state.powerUps.length < MAX_POWERUPS - 5) {
    const { x: cx, y: cy } = randomWorldPoint(620, 1900);
    if (isPositionValid(cx, cy, 120, state.pondId, state.worldMode)) {
      const count = 3 + Math.floor(Math.random() * 3); // 3~5 枚
      for (let i = 0; i < count; i += 1) {
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.6;
        const d = Math.random() * 90;
        state.powerUps.push({
          id: uuid(),
          x: cx + Math.cos(ang) * d,
          y: cy + Math.sin(ang) * d,
          type: 'COIN',
          radius: 14,
        });
      }
    }
  }

  /* ── 2. 拾取判定 ── */
  for (const p of state.powerUps) {
    if (p.radius <= 0) continue;
    if (dist(player, p) > player.radius + p.radius) continue;
    const handler = PICKUP_HANDLERS[p.type];
    if (!handler) continue;
    handler(state, ctx, p);
    p.radius = 0;
    for (let i = 0; i < 12; i += 1) {
      state.particles.push({ ...createCookieParticle(p.x, p.y), color: '#fcd34d' });
    }
  }
  state.powerUps = state.powerUps.filter((p) => p.radius > 0);
};
