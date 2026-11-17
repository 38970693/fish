/**
 * 玩家控制系统 —— 移动、转向、加速能量条、状态计时器。
 *
 * 只负责「玩家怎么动」，不掺和战斗和技能，方便单独调手感。
 */

import { BOOST_CONFIG, GAME_MECHANICS, COMBAT_CONFIG } from '../data/world';
import { BIOME_EFFECTS, BiomeType } from '../data/biomes';
import type { GameState, FrameContext } from '../types';
import { dist, turnToward, num } from '../core/math';
import { getBiome, rememberTerrainPosition } from './terrain';
import { dealDamage } from './combat';

/** 转向灵敏度：体型越大越笨重，愤怒状态例外（大鱼反制用） */
export const getPlayerAgility = (state: GameState): number => {
  const p = state.player;
  const base = Math.max(
    0.02,
    GAME_MECHANICS.BASE_TURN_SPEED - p.radius * GAME_MECHANICS.SIZE_AGILITY_PENALTY
  );
  const biome = (p.currentBiome ?? getBiome(
    p.x, p.y, state.worldMode, state.endlessWorld?.seed,
    state.endlessWorld?.originChunkX, state.endlessWorld?.originChunkY,
  )) as BiomeType;
  const biomePenalty = BIOME_EFFECTS[biome]?.bigFishTurnPenalty ?? 0;
  return Math.max(0.02, base * (1 - biomePenalty));
};

/** 控制器和挂机轨迹共用速度公式；预测时传入未来位置和帧数。 */
export const getPlayerSpeed = (
  state: GameState, boosted = false, framesAhead = 0,
  position: { x: number; y: number } = state.player,
): number => {
  const p = state.player;
  const biome = (position === p ? p.currentBiome : undefined) ?? getBiome(
    position.x, position.y, state.worldMode, state.endlessWorld?.seed,
    state.endlessWorld?.originChunkX, state.endlessWorld?.originChunkY,
  );
  const effect = BIOME_EFFECTS[biome as BiomeType];
  let speed = p.speed * p.stats.speedMult;
  if (boosted) speed *= BOOST_CONFIG.SPEED_MULTIPLIER;
  if (effect && p.config.tier <= effect.speedBonusMaxTier) speed *= effect.speedMult;
  const timer = p.speedBoostTimer ?? 0;
  if (timer > framesAhead) speed *= GAME_MECHANICS.SPEED_ITEM_MULTIPLIER;
  if (timer < -framesAhead) speed *= 0.4;
  return speed;
};

export const playerControlSystem = (state: GameState, ctx: FrameContext): void => {
  const p = state.player;
  rememberTerrainPosition(p, state.time);
  const { mouse, input, screen } = ctx;

  /* ── 1. 转向：朝向鼠标 ── */
  const targetAngle = Math.atan2(mouse.y - screen.height / 2, mouse.x - screen.width / 2);
  p.angle = turnToward(p.angle, targetAngle, getPlayerAgility(state));

  /* ── 2. 加速与能量条 ── */
  const canBoost = input.space && p.boost.current > 0;
  if (canBoost) {
    p.boost.current -= BOOST_CONFIG.DRAIN_RATE;
  } else if (p.boost.current < p.boost.max) {
    p.boost.current += BOOST_CONFIG.REGEN_RATE;
  }
  p.boost.active = canBoost;
  p.boost.current = Math.max(0, Math.min(p.boost.max, p.boost.current));

  /* ── 3/4. 生态区、状态速度加成与位移 ── */
  const speed = getPlayerSpeed(state, canBoost);

  p.vx = Math.cos(p.angle) * speed;
  p.vy = Math.sin(p.angle) * speed;
  p.x += p.vx;
  p.y += p.vy;
  p.accelerationMult = (canBoost ? BOOST_CONFIG.SPEED_MULTIPLIER : 1)
    * ((p.speedBoostTimer ?? 0) > 0 ? GAME_MECHANICS.SPEED_ITEM_MULTIPLIER : 1);

  /* ── 5. 诱惑状态：自动躲开大鱼 ── */
  if (p.lureActive) {
    let escX = 0;
    let escY = 0;
    let escaping = false;
    for (const e of state.entities) {
      if (e.level > p.level && dist(p, e) < 400) {
        escX += p.x - e.x;
        escY += p.y - e.y;
        escaping = true;
      }
    }
    if (escaping) {
      const escapeAngle = Math.atan2(escY, escX);
      p.vx += Math.cos(escapeAngle) * 8;
      p.vy += Math.sin(escapeAngle) * 8;
    }
  }

  /* ── 6. 计时器 ── */
  if (p.semiGhostTimer && p.semiGhostTimer > 0) p.semiGhostTimer--;
  if (p.biteCooldown && p.biteCooldown > 0) p.biteCooldown--;
  if (p.speedBoostTimer && p.speedBoostTimer !== 0) {
    p.speedBoostTimer += p.speedBoostTimer > 0 ? -1 : 1;
  }
  if (p.invulnerableTimer > 0) p.invulnerableTimer--;
  if (state.arena) {
    if ((p.vulnerableTimer ?? 0) > 0) p.vulnerableTimer!--;
    if ((p.sonarTimer ?? 0) > 0) p.sonarTimer!--;
  }
  if (p.shieldTimer > 0) p.shieldTimer--;
  if (p.hitReactionTimer && p.hitReactionTimer > 0) p.hitReactionTimer--;
  if (p.ambushTimer > 0) {
    p.ambushTimer--;
    if (p.ambushTimer <= 0) {
      p.camoActive = false;
      p.lureActive = false;
    }
  }
  if (p.poisonTimer && p.poisonTimer > 0) {
    p.poisonTimer--;
    // 中毒也走统一伤害入口（G1 / FQ-03）：无敌帧 / 护盾 / 易伤一视同仁，
    // 无敌模式连毒都免疫（dealDamage 里那道 isGodMode 闸）—— 否则挂机调试也会被磨死。
    // 与 ai.ts 的中毒共用 `COMBAT_CONFIG.POISON_DPS_RATIO`，两边永远同速。
    const poisonSource = state.arena
      ? state.arena.contestants.find(c => c.body.id === p.poisonSourceId)?.body : undefined;
    dealDamage(p, p.maxHealth * COMBAT_CONFIG.POISON_DPS_RATIO, poisonSource);
  }
  if (p.renderScale > 1) p.renderScale = Math.max(1, p.renderScale - 0.01);
  if (p.speechBubble && p.speechBubble.timer > 0) {
    p.speechBubble.timer--;
    if (p.speechBubble.timer <= 0) p.speechBubble = null;
  }

  /* ── 7. 数值兜底 ── */
  p.health = num(p.health, 0);
  if (!Number.isFinite(p.radius) || p.radius <= 0) p.radius = 10;
};
