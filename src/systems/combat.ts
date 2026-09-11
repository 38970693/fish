/**
 * 战斗系统 —— 吞噬判定、背后偷袭、概率吞噬。
 *
 * 重构要点：
 *  1. 从「只检测玩家 vs 鱼」扩展为「鱼 vs 鱼也吃」，生态链真正转起来
 *  2. 表现（粒子 / 飘字 / 逆转特效）改成发事件，逻辑层不再硬编码粒子
 *  3. 保留原有数值手感，未改动任何概率与倍率
 *
 * ⚠️ 已知待办（见 开发路线图.md P1-3）：
 *    目前 canEat 命中 = 直接 health 归零，属于「概率一击必杀」。
 *    计划改为「撕咬扣血 + 概率吞噬」，让血条真正有意义。改这一个函数即可。
 */

import { CreatureType } from '../data/creatures';
import { AMBUSH_CONFIG, COMBAT_CONFIG, PHRASES, REVERSAL_PHRASE } from '../data/world';
import { scoreGain } from '../data/ponds';
import { GameStatus } from '../types';
import type { Entity, GameState, FrameContext, PlayerState, Particle } from '../types';
import { dist, uuid, pick, clamp } from '../core/math';
import { recruitToSquad } from './squad';
import { recordRun } from './leaderboard';

export const createParticle = (x: number, y: number, color: string): Particle => ({
  id: uuid(),
  x,
  y,
  vx: (Math.random() - 0.5) * 4,
  vy: (Math.random() - 0.5) * 4,
  life: 1.0,
  maxLife: 1.0,
  color,
  size: Math.random() * 3 + 2,
});

/**
 * 迷你金色小饼干粒子 —— 场景里所有「食物感」的爆开效果统一用它，
 * 渲染层（drawCookie）按 shape === 'COOKIE' 画成圆饼 + 巧克力豆。
 * 放在 combat.ts 是因为它是底层模块：items / events 都要用，放这里避免循环依赖。
 */
export const createCookieParticle = (x: number, y: number): Particle => ({
  id: uuid(),
  x,
  y,
  vx: (Math.random() - 0.5) * 5,
  vy: -Math.random() * 3 - 1,
  life: 1.0,
  maxLife: 1.0,
  color: '#fbbf24',
  size: Math.random() * 3 + 3,
  shape: 'COOKIE',
  spin: Math.random() * Math.PI * 2,
});

const isFriendly = (e: Entity): boolean =>
  e.id === 'player' || (typeof e.ownerId === 'string' && e.ownerId === 'player');

const isSemiGhost = (e: Entity): boolean => !!e.semiGhostTimer && e.semiGhostTimer > 0;

const say = (e: Entity, text: string, timer: number, color: string): void => {
  e.speechBubble = { text, timer, color };
};

/**
 * 统一伤害入口。
 * 以前伤害都是直接 `e.health -= dmg`，导致三个状态字段一直是摆设：
 *   - invulnerableTimer 只递减、不参与判定（闪避是假的）
 *   - shieldTimer 同理（缩壳只是好看）
 *   - vulnerableTimer（弱点标记）设了没人读
 * 现在所有伤害都走这里，三个状态才真正生效。
 */
export const dealDamage = (target: Entity, amount: number): number => {
  // 无敌帧：新手保护 / 闪避等技能
  if (target.invulnerableTimer && target.invulnerableTimer > 0) return 0;
  // 无敌模式（G 键，调试用）：玩家挂着 isGodMode 标记，任何伤害直接拦下
  if (target.id === 'player' && (target as PlayerState).isGodMode) return 0;

  let damage = amount;
  if (target.vulnerableTimer && target.vulnerableTimer > 0) {
    damage *= COMBAT_CONFIG.VULNERABLE_DAMAGE_MULT;
  }
  if (target.shieldTimer && target.shieldTimer > 0) {
    damage *= 1 - COMBAT_CONFIG.SHIELD_ABSORB_RATIO;
  }

  target.health -= damage;
  return damage;
};

/**
 * 吞噬成功的收益结算。
 * 玩家吃鱼会长体重 / 进化点 / 等级；AI 吃鱼只回血，避免失控膨胀。
 */
const applyDevour = (
  attacker: Entity,
  victim: Entity,
  state: GameState,
  ctx: FrameContext,
  isBackAttack: boolean
): void => {
  const attackerIsPlayer = attacker.id === 'player';

  if (attackerIsPlayer) {
    const p = attacker as PlayerState;
    const gain = victim.config.weightValue;
    p.weight += gain;
    p.evolutionPoints += gain;
    p.eatenHistory[victim.type] = (p.eatenHistory[victim.type] || 0) + 1;
    attacker.health = Math.min(attacker.maxHealth, attacker.health + gain * 2);

    const newLevel = Math.floor(p.weight / 10) + 1;
    if (newLevel > p.level) {
      p.level = newLevel;
      p.radius += 2;
      say(p, `升级至 Lv.${newLevel}!`, 60, '#fcd34d');
      ctx.events.emit('levelup', { entity: p, level: newLevel });
    } else {
      say(p, pick(PHRASES.EAT) ?? '捕获!', 45, '#bef264');
    }
  } else {
    attacker.health = Math.min(
      attacker.maxHealth,
      attacker.health + victim.config.weightValue * 2
    );
  }

  if (isBackAttack && attackerIsPlayer) {
    say(attacker, pick(PHRASES.AMBUSH) ?? '偷袭!', 45, '#ef4444');
  }

  // 吃到鱼的奖励感：爆出一撮金色小饼干碎屑
  for (let i = 0; i < 6; i += 1) {
    state.particles.push(createCookieParticle(victim.x, victim.y));
  }

  ctx.events.emit('eat', {
    attacker,
    victim,
    isBackAttack,
    x: victim.x,
    y: victim.y,
  });

  // 战队收编（提示词 #70）：玩家吃掉的鱼不消失，而是倒戈加入战队。
  // 只登记不落地 —— 实体由 squad 系统在下一帧统一创建，
  // 避免在碰撞遍历中间改 entities 把当前这轮循环搞乱。
  if (attackerIsPlayer) {
    recruitToSquad(state, victim);
  }
};

/** 一次攻击判定。attacker 试图吃 victim。 */
export const processCollision = (
  attacker: Entity,
  victim: Entity,
  state: GameState,
  ctx: FrameContext
): void => {
  if (attacker.health <= 0 || victim.health <= 0) return;

  // 吉祥物无敌且不参与战斗
  const mascot = CREATURES_MASCOT;
  if (attacker.type === mascot || victim.type === mascot) return;

  // 友军不互吃
  if (isFriendly(attacker) && isFriendly(victim)) return;
  // 同类不互吃
  if (attacker.type === victim.type) return;
  // 半虚保护：刚生成的鱼既不能吃也不能被吃
  if (isSemiGhost(attacker) || isSemiGhost(victim)) return;

  // 无敌帧：新手保护 / 闪避 / 翻滚 / 复活保护 —— 受保护者不能被吃也不能被伤害
  // （重构前 invulnerableTimer 只在递减、从未参与判定，闪避技能一直是假的）
  if (victim.invulnerableTimer && victim.invulnerableTimer > 0) return;
  // 无敌模式：G 键调试用，直接免疫一切捕食判定
  if (victim.id === 'player' && (victim as PlayerState).isGodMode) return;

  // 撕咬冷却中：刚咬完一口，短时间内不能再发起攻击，否则同一帧会被反复判定
  if (attacker.biteCooldown && attacker.biteCooldown > 0) return;

  const distance = dist(attacker, victim);

  // 超过偷袭检测范围时，必须是实打实的贴身碰撞
  if (
    distance > AMBUSH_CONFIG.DETECTION_RANGE_MAX ||
    distance < AMBUSH_CONFIG.DETECTION_RANGE_MIN * 0.5
  ) {
    if (distance > attacker.radius + victim.radius) return;
  }

  const angleToVictim = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
  let angleDiff = angleToVictim - attacker.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  const isBackAttack = Math.abs(angleDiff) > AMBUSH_CONFIG.BACK_ANGLE_THRESHOLD;
  const canEatForward = Math.abs(angleDiff) <= Math.PI / 3;
  if (!canEatForward && !isBackAttack) return;

  const sizeRatio = attacker.radius / victim.radius;
  const P = AMBUSH_CONFIG.EAT_PROBABILITY;

  let eatProbability: number;
  if (sizeRatio >= 2) eatProbability = P.DOUBLE_OR_MORE;
  else if (sizeRatio >= 1.5) eatProbability = P.ONE_HALF_OR_MORE;
  else if (sizeRatio >= 1.2) eatProbability = P.ONE_FIFTH_OR_MORE;
  else eatProbability = P.SIMILAR;

  if (isBackAttack) eatProbability += sizeRatio >= 1.5 ? 0.2 : sizeRatio >= 1.2 ? 0.15 : 0.1;

  // 同级大吃小
  if (attacker.level === victim.level && attacker.radius > victim.radius) {
    eatProbability = Math.max(eatProbability, 0.5);
  }
  // 小丑鱼同级被针对（保留原有设定）
  if (
    attacker.level === victim.level &&
    victim.type === CREATURES_CLOWN &&
    attacker.type !== CREATURES_CLOWN
  ) {
    eatProbability = 0.7;
  }
  // 等级压制
  if (attacker.level > victim.level) {
    eatProbability = Math.min(1, eatProbability + (attacker.level - victim.level) * 0.15);
  }
  // 诱惑中的猎手咬被香味骗来的鱼：几乎一口闷（灯笼鱼「来的小鱼直接吃」）
  if (attacker.lureActive) eatProbability = Math.min(1, eatProbability + 0.4);

  const canBite = Math.random() < eatProbability;

  if (canBite) {
    /* ── 第一步：咬一口，按体型差与是否背刺计算伤害 ── */
    const sizeFactor = clamp(
      sizeRatio,
      COMBAT_CONFIG.SIZE_FACTOR_MIN,
      COMBAT_CONFIG.SIZE_FACTOR_MAX
    );
    let damage = attacker.config.damage * COMBAT_CONFIG.BITE_DAMAGE_MULT * sizeFactor;
    if (isBackAttack) damage *= 1 + COMBAT_CONFIG.BACK_BITE_BONUS;

    const realDamage = dealDamage(victim, damage);
    attacker.biteCooldown = COMBAT_CONFIG.BITE_COOLDOWN;

    // 被咬后体型缓慢缩水（P1-2）
    victim.radius = Math.max(
      COMBAT_CONFIG.MIN_RADIUS,
      victim.radius * COMBAT_CONFIG.SHRINK_ON_BITE
    );
    victim.fearTimer = 60;
    victim.angerTimer = COMBAT_CONFIG.ANGER_DURATION;

    ctx.events.emit('hurt', { target: victim, amount: realDamage, source: attacker });

    /* ── 第二步：大鱼反制 —— 被小个子咬了就猛回头给一口 ── */
    if (victim.radius > attacker.radius) {
      victim.angle = Math.atan2(attacker.y - victim.y, attacker.x - victim.x);
      const counterDamage = dealDamage(
        attacker,
        victim.config.damage * COMBAT_CONFIG.COUNTER_DAMAGE_MULT
      );
      ctx.events.emit('hurt', { target: attacker, amount: counterDamage, source: victim });
      if (victim.id === 'player' || attacker.id === 'player') {
        state.labels.push({
          x: victim.x,
          y: victim.y - 40,
          text: '猛回头!',
          color: '#fbbf24',
          timer: 45,
        });
      }
    }

    /* ── 第三步：判定死亡 ──
     * 两种死法：
     *   1) 吞下去 —— 对方残血且自己够大，一口吞（大鱼吃小鱼的爽感来源）
     *   2) 咬死   —— 自己不够大，但可以把对方活活咬到没血
     * 第 2 条是「小鱼逆袭大鱼」唯一可行的路径，不能砍掉，否则逆转玩法直接消失。
     */
    const canDevour =
      victim.health <= victim.maxHealth * COMBAT_CONFIG.DEVOUR_HP_RATIO &&
      sizeRatio >= COMBAT_CONFIG.DEVOUR_MIN_SIZE_RATIO;

    if (victim.health > 0 && !canDevour) return;
    // 逆转判定：小鱼反杀大鱼（玩家专属高光时刻）
    if (
      sizeRatio < AMBUSH_CONFIG.REVERSAL_SIZE_THRESHOLD &&
      attacker.id !== 'player' &&
      victim.id === 'player'
    ) {
      state.score += scoreGain(state.pondId, Math.floor(victim.radius * 10));
      // 逆转特效属于游戏状态的一部分（会存进 GameState 被渲染），直接产生；
      // 同时发事件，方便将来接音效 / 成就，而不用回头改这里。
      // 特效增强：金色大字（Label.size）+ 双圈定向冲击波，这是全游戏最稀缺的高光时刻，值得排场。
      state.labels.push({
        x: victim.x, y: victim.y - 50,
        text: REVERSAL_PHRASE, color: '#fbbf24', timer: 90, size: 44,
      });
      // 冲击波：内圈快而密（金）、外圈慢而疏（红），定向速度让粒子炸成一圈而不是糊成一团
      for (let ring = 0; ring < 2; ring += 1) {
        const speed = ring === 0 ? 7 : 3.5;
        const count = ring === 0 ? 22 : 14;
        for (let i = 0; i < count; i += 1) {
          const a = (i / count) * Math.PI * 2 + ring * 0.35;
          const spark = createParticle(victim.x, victim.y, ring === 0 ? '#fcd34d' : '#ef4444');
          spark.vx = Math.cos(a) * speed;
          spark.vy = Math.sin(a) * speed;
          spark.size = ring === 0 ? 4 : 3;
          state.particles.push(spark);
        }
      }
      for (let i = 0; i < 30; i += 1) {
        state.particles.push(createParticle(victim.x, victim.y, '#fcd34d'));
        state.particles.push(createParticle(victim.x, victim.y, '#ef4444'));
      }
      ctx.events.emit('reversal', { x: victim.x, y: victim.y, score: state.score });
    }

    victim.health = 0;
    state.labels.push({
      x: victim.x,
      y: victim.y - 50,
      text: pick(PHRASES.EAT) ?? '捕获!',
      color: '#ef4444',
      timer: 60,
    });
    applyDevour(attacker, victim, state, ctx, isBackAttack);
    ctx.events.emit('death', { victim, killer: attacker });

    // P0-4 胜利条件：玩家击杀深海霸主（虎鲸 / 美人鱼 / 深海巨怪）
    checkVictory(state, attacker, victim);

    if (attacker.radius > victim.radius * 1.1) {
      attacker.renderScale = 1.1;
      attacker.happyTimer = 30;
    }
  } else if (isBackAttack) {
    // 背刺没咬中吞噬判定，依然扎扎实实来一口
    const stabRaw =
      victim.maxHealth * COMBAT_CONFIG.BACK_STAB_HP_RATIO * AMBUSH_CONFIG.BACK_DAMAGE_MULT;
    const stab = dealDamage(victim, stabRaw);
    victim.fearTimer = 60;
    victim.angerTimer = 180;
    ctx.events.emit('hurt', { target: victim, amount: stab, source: attacker });
    if (attacker.id === 'player') {
      say(attacker, pick(PHRASES.AMBUSH) ?? '偷袭!', 30, '#fcd34d');
    }
  }
};

/**
 * P0-4 胜利条件：玩家亲手击杀深海霸主（虎鲸 / 美人鱼 / 深海巨怪）即通关。
 * AI 击杀不算 —— 判定 attacker 必须是玩家。
 * 抽成函数是因为不止一个地方能杀死实体（撕咬、鱼雷），逻辑不能各写一份。
 */
export const checkVictory = (state: GameState, attacker: Entity, victim: Entity): void => {
  if (attacker.id !== 'player') return;
  if (victim.config.behavior !== 'BOSS') return;
  state.status = GameStatus.VICTORY;
  recordRun(state); // 通关也上本地排行榜
  state.score += Math.floor(victim.config.weightValue);
};

const CREATURES_MASCOT = CreatureType.MASCOT;
const CREATURES_CLOWN = CreatureType.CLOWN_FISH;

/**
 * 每帧碰撞检测。
 * 实体上限 180，用平方距离双重循环（约 1.6 万次比较/帧）足够快，
 * 且比 QuadTree 更少边界情况；玩家单独配对处理。
 */
export const combatSystem = (state: GameState, ctx: FrameContext): void => {
  const { player, entities } = state;

  // 玩家 vs 鱼
  for (const e of entities) {
    if (e.type === CREATURES_MASCOT) continue;
    if (dist(e, player) < e.radius + player.radius) {
      processCollision(e, player, state, ctx);
      processCollision(player, e, state, ctx);
    }
  }

  // 鱼 vs 鱼：让世界自己运转（重构前这一段完全缺失）
  for (let i = 0; i < entities.length; i += 1) {
    const a = entities[i];
    if (a.health <= 0) continue;
    for (let j = i + 1; j < entities.length; j += 1) {
      const b = entities[j];
      if (b.health <= 0) continue;
      if (dist(a, b) > a.radius + b.radius) continue;
      processCollision(a, b, state, ctx);
      processCollision(b, a, state, ctx);
    }
  }

  // 清理尸体（放在最后，保证本帧事件都能拿到完整 victim 数据）
  if (entities.some((e) => e.health <= 0)) {
    state.entities = entities.filter((e) => e.health > 0);
  }
};
