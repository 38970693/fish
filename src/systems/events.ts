/**
 * 世界事件系统 —— 宝藏、秘境喷泉、陨石。
 *
 * ⚠️ 宝藏计时修复：原实现把「预告时长」和「存活时长」混在一个 timer 里做减法，
 *    导致预告实际 6 秒（应为 3 秒）、激活后只活 7 秒（应为 10 秒）。
 *    现在 data/world.ts 拆出 WARNING_DURATION / ACTIVE_DURATION 两个字段，语义清晰。
 *
 * ⚠️ 陨石：data/world.ts 里 METEOR_CONFIG 一直配得很完整，
 *    但 state.hazards 从来都是空数组 —— 逻辑在本次重构中补齐。
 */

import { TREASURE_CONFIG, METEOR_CONFIG, WORLD_SIZE, MAX_ENTITIES } from '../data/world';
import { TREASURE_COLORS } from '../data/world';
import { CreatureType } from '../data/creatures';
import { scoreGain } from '../data/ponds';
import type { GameState, FrameContext, Hazard, Treasure } from '../types';
import { dist, uuid, pick } from '../core/math';
import { isPositionValid } from './terrain';
import { createEntity } from './spawn';
import { createParticle, dealDamage, createCookieParticle } from './combat';
import { isFeedingEventMajorPhase } from './feedingEvents';

const TREASURE_EFFECT_BY_TYPE: Record<Treasure['type'], Treasure['effect']> = {
  FEAST: 'EXP',
  CHEST: 'GOLD',
  GEM: 'SKILL',
  FOOD: 'SHIELD',
};

const TREASURE_REWARD: Record<Treasure['type'], number> = {
  FEAST: TREASURE_CONFIG.FEAST_REWARD,
  CHEST: TREASURE_CONFIG.CHEST_GOLD,
  GEM: 2,
  FOOD: TREASURE_CONFIG.FOOD_HEAL,
};

export const spawnTreasure = (state: GameState, ctx: FrameContext): void => {
  let x = 0;
  let y = 0;
  let valid = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    x = Math.random() * WORLD_SIZE;
    y = Math.random() * WORLD_SIZE;
    if (isPositionValid(x, y, 100)) {
      valid = true;
      break;
    }
  }
  if (!valid) return;

  const type = pick(['FEAST', 'CHEST', 'GEM', 'FOOD'] as Treasure['type'][]) ?? 'FOOD';

  state.treasures.push({
    id: uuid(),
    x,
    y,
    type,
    status: 'WARNING',
    /** 预告 3 秒 + 可拾取 10 秒 */
    timer: TREASURE_CONFIG.WARNING_DURATION + TREASURE_CONFIG.ACTIVE_DURATION,
    radius: TREASURE_CONFIG.RADIUS,
    effect: TREASURE_EFFECT_BY_TYPE[type],
    rewardValue: TREASURE_REWARD[type],
  });

  ctx.events.emit('treasure', { x, y: y - 80, label: '宝贝出现！', color: '#fcd34d' });
};

export const updateTreasures = (state: GameState, ctx: FrameContext): void => {
  const player = state.player;

  for (const t of state.treasures) {
    t.timer--;

    // 预告期结束 → 转为可拾取
    if (t.status === 'WARNING' && t.timer <= TREASURE_CONFIG.ACTIVE_DURATION) {
      t.status = 'ACTIVE';
    }

    if (t.status !== 'ACTIVE') continue;
    if (dist(player, t) > player.radius + t.radius) continue;

    const value = t.rewardValue ?? 0;
    switch (t.effect) {
      case 'EXP':
        player.weight += value;
        player.evolutionPoints += value;
        player.speechBubble = { text: `+${value} 经验！`, timer: 60, color: '#fcd34d' };
        break;
      case 'GOLD': {
        const gained = scoreGain(state.pondId, value);
        state.score += gained;
        player.speechBubble = { text: `+${gained} 金币！`, timer: 60, color: '#fbbf24' };
        break;
      }
      case 'SKILL':
        player.skillLevel += 1;
        player.speechBubble = { text: '技能+1！', timer: 60, color: '#a855f7' };
        break;
      case 'SHIELD':
        player.shieldTimer = TREASURE_CONFIG.BUFF_DURATION;
        player.health = Math.min(player.maxHealth, player.health + value);
        player.speechBubble = { text: '获得护盾！', timer: 60, color: '#38bdf8' };
        break;
      default:
        break;
    }

    for (let i = 0; i < 20; i += 1) {
      state.particles.push(createParticle(t.x, t.y, TREASURE_COLORS[t.type] ?? TREASURE_COLORS.DEFAULT));
    }
    ctx.events.emit('pickup', { x: t.x, y: t.y, label: '获得宝贝', color: '#fcd34d' });

    t.timer = 0; // 标记移除
  }

  state.treasures = state.treasures.filter((t) => t.timer > 0);
};

const spawnMeteor = (state: GameState, ctx: FrameContext): void => {
  if (state.hazards.length >= 3) return;

  let x = 0;
  let y = 0;
  let valid = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    x = Math.random() * WORLD_SIZE;
    y = Math.random() * WORLD_SIZE;
    if (isPositionValid(x, y, METEOR_CONFIG.RADIUS)) {
      valid = true;
      break;
    }
  }
  if (!valid) return;

  const hazard: Hazard = {
    id: uuid(),
    x,
    y,
    radius: METEOR_CONFIG.RADIUS,
    type: 'METEOR_STRIKE',
    timer: METEOR_CONFIG.WARNING_TIME,
    duration: METEOR_CONFIG.STRIKE_TIME,
    stage: 'WARNING',
  };
  state.hazards.push(hazard);
  ctx.events.emit('treasure', { x, y: y - 100, label: '陨石来袭！', color: '#ef4444' });
};

export const updateMeteors = (state: GameState, ctx: FrameContext): void => {
  for (const h of state.hazards) {
    h.timer--;
    // 小地图会读这个字段显示倒计时
    h.countdown = Math.max(0, Math.ceil(h.timer / 60));

    if (h.stage === 'WARNING' && h.timer <= 0) {
      h.stage = 'STRIKE';
      h.timer = METEOR_CONFIG.STRIKE_TIME;

      // 冲击：范围内一切受伤并缩小
      for (let i = 0; i < METEOR_CONFIG.SPLASH_COUNT; i += 1) {
        state.particles.push(createParticle(h.x, h.y, '#fb923c'));
      }
      if (dist(state.player, h) < h.radius) {
        // 走统一伤害入口：无敌帧 / 护盾 / 无敌模式对陨石同样生效
        const dealt = dealDamage(state.player, state.player.maxHealth * 0.2);
        if (dealt > 0) {
          state.player.radius = Math.max(10, state.player.radius * METEOR_CONFIG.SPLASH_SHRINK);
          ctx.events.emit('hurt', { target: state.player, amount: dealt });
        }
      }
      for (const e of state.entities) {
        if (dist(e, h) > h.radius) continue;
        const dealt = dealDamage(e, e.maxHealth * 0.3);
        if (dealt > 0) {
          e.radius = Math.max(5, e.radius * METEOR_CONFIG.SPLASH_SHRINK);
          ctx.events.emit('hurt', { target: e, amount: dealt });
        }
      }
    } else if (h.stage === 'STRIKE' && h.timer <= 0) {
      h.stage = 'COOLDOWN';
    }
  }

  state.hazards = state.hazards.filter((h) => h.stage !== 'COOLDOWN');
};

const updateFountains = (state: GameState, ctx: FrameContext): void => {
  if (Math.random() < 0.001 && state.fountains.length < 2) {
    const x = Math.random() * WORLD_SIZE;
    const y = Math.random() * WORLD_SIZE;
    if (isPositionValid(x, y, 100)) {
      state.fountains.push({ id: uuid(), x, y, timer: 3600, radius: 100 }); // 3600 帧 = 1 分钟
      // 秘境开张，广而告之（飘字 + 拾取音效）
      ctx.events.emit('building', { x, y, label: '发现秘境！饼干喷泉开启 1 分钟', color: '#fbbf24' });
    }
  }

  for (const f of state.fountains) {
    f.timer--;
    // 喷泉口的饼干粒子，营造「正在喷饼干」的仪式感
    if (state.time % 12 === 0) {
      for (let i = 0; i < 2; i += 1) {
        state.particles.push(
          createCookieParticle(
            f.x + (Math.random() - 0.5) * f.radius * 0.4,
            f.y + (Math.random() - 0.5) * f.radius * 0.4
          )
        );
      }
    }
    // 定期掉落可吃的饼干（磷虾实体）；实体满了就先不喷，避免挤掉正常刷怪
    if (state.time % 30 === 0 && state.entities.length < MAX_ENTITIES) {
      const angle = Math.random() * Math.PI * 2;
      const d = Math.random() * f.radius;
      state.entities.push(
        createEntity(CreatureType.PLANKTON, f.x + Math.cos(angle) * d, f.y + Math.sin(angle) * d)
      );
    }
  }
  state.fountains = state.fountains.filter((f) => f.timer > 0);
};

export const eventsSystem = (state: GameState, ctx: FrameContext): void => {
  if (state.time % TREASURE_CONFIG.SPAWN_INTERVAL === 0 && !isFeedingEventMajorPhase(state)) {
    spawnTreasure(state, ctx);
  }
  updateTreasures(state, ctx);

  if (state.time % METEOR_CONFIG.INTERVAL === 0) spawnMeteor(state, ctx);
  updateMeteors(state, ctx);

  updateFountains(state, ctx);
};
