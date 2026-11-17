/**
 * 战斗系统 —— 吞噬判定、背后偷袭、概率吞噬。
 *
 * 重构要点：
 *  1. 从「只检测玩家 vs 鱼」扩展为「鱼 vs 鱼也吃」，生态链真正转起来
 *  2. 表现（粒子 / 飘字 / 逆转特效）改成发事件，逻辑层不再硬编码粒子
 *  3. 保留原有数值手感，未改动任何概率与倍率
 *
 * ✅ 2026-09-14 实测更正（G1 / FQ-03 核对）：上面那句「概率一击必杀」**早已不成立** ——
 *    现在命中只扣血（`BITE_DAMAGE_MULT`），死亡要么血被磨到 0，要么满足
 *    `DEVOUR_HP_RATIO` + `DEVOUR_MIN_SIZE_RATIO` 才被吞。旧注释留着只会误导，故改写：
 *    当前真正的随机性在**命中判定**本身（`EAT_PROBABILITY`，0.05～0.8 + 各类加成），
 *    命中与否掷一次骰子 —— 这与计划 §5.1「稳定造成伤害」相冲突，是 FQ-04 的待办。
 */

import { CreatureType } from '../data/creatures';
import { AMBUSH_CONFIG, COMBAT_CONFIG, PHRASES, REVERSAL_PHRASE, PLAYER_GROWTH_CONFIG } from '../data/world';
import { scoreGain } from '../data/ponds';
import { GameStatus } from '../types';
import type { Entity, GameState, FrameContext, PlayerState, Particle } from '../types';
import { dist, uuid, pick, clamp, normalizeAngle } from '../core/math';
import { QuadTree } from '../utils/SpatialHash';
import { recruitToSquad } from './squad';
import { recordRun } from './leaderboard';
import { isConcealed, CONCEAL_BITE_PROB_MULT } from './concealment';
import { canHarm, isPlayerFaction } from './factions';
import { awardPlayerGrowth } from './playerGrowth';
import { hasObstacleOcclusion } from '../core/obstacleGeometry';
import { awardArenaKill } from './arenaRewards';

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

const isSemiGhost = (e: Entity): boolean => !!e.semiGhostTimer && e.semiGhostTimer > 0;

/**
 * 等级门闸（COMBAT_CONFIG.KILL_LEVEL_GATE，2026-09-13 规则）：
 * victim 是否「杀不死」—— 等级高于攻击者时，咬得动但打不死（血量保底 1 点）。
 * 伤害 / 缩水 / 愤怒 / 反击都照常，这里只拦「致死」这一步。
 *
 * ⚠️ FQ-04 / §5.2：**鱼群争霸（`state.run` 存在）取消这道硬门槛** ——
 *    「新模式取消『高等级永远保留 1 点血』，保留等级或体型的有限数值优势」，
 *    等级优势改由 `LEVEL_DAMAGE_STEP` 的伤害倍率体现，难度交给血量 / 技能 / 反击。
 *    **旧模式（`state.run === undefined`）原样保留**，这是本轮唯一按模式分叉的规则。
 */
const isUnkillable = (state: GameState, attacker: Entity, victim: Entity): boolean =>
  !!COMBAT_CONFIG.KILL_LEVEL_GATE && !state.run && victim.level > attacker.level;

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
 *
 * @param source 伤害来源（G1 / FQ-03）：只用来记**致死归属**，不影响伤害数值。
 *   传了就写进 `target.lastHitById`，死亡结算据此把收益记到来源所属的阵营；
 *   环境伤害（陨石 / 沼泽腐蚀）不传来源，也就不会抢走别人的归属。
 */
export const dealDamage = (target: Entity, amount: number, source?: Entity): number => {
  const arenaDamage = !!(target.arenaStats || source?.arenaStats);
  if (arenaDamage && target.health <= 0) return 0;
  const previousHealth = target.health;
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
  if (source?.arenaStats && target.arenaStats && source !== target) {
    source.arenaStats.damage += Math.max(0, Math.min(damage, target.health + damage));
  }
  target.hitReactionTimer = 8;
  // 记归属时用对象同一性判自伤（不能用 id 比：单测把 Math.random 钉成常数时
  // `uuid()` 会给所有实体生成同一个 id，见 factions.ts 的注释）
  if (source && source !== target) {
    target.lastHitById = source.id;
    target.hostileHitCounter = (target.hostileHitCounter ?? 0) + 1;
  }
  return arenaDamage ? Math.max(0, Math.min(damage, previousHealth)) : damage;
};

/**
 * 击杀收益结算。**只由 `resolveDeath` 调用**，别处不许发奖励 ——
 * 「一次死亡只发一次」这条全靠这个收口撑着。
 *
 * 归属规则（G1 / FQ-03）：**收益记阵营，不记个人**
 *   · 玩家本体杀死 → 玩家拿成长，自己回血（与旧行为逐字一致）
 *   · 队友杀死     → 玩家照样拿成长，**队友回血**，玩家也补一份回血
 *     —— 这正是「抢最后一口不再是最优解」的落点：
 *        以前队友击杀一分钱不给，理性玩法就是把队友挤开自己补刀；
 *        现在连回血都不必靠玩家亲手收尾，补刀动机进一步被压掉。
 *        （回血那一份刻意给了玩家：归属是阵营级的，不是只给「嘴」）
 *   · 野鱼互吃     → 只有吞它那条回血，玩家不拿（生态链照旧转）
 *
 * ⚠️ 收编仍然只认玩家本体（`killer.id === 'player'`）：队友打下来的鱼要不要入队
 *    属于战利品取舍（G3 / FQ-10），本轮不扩大范围。
 */
const settleDevour = (
  state: GameState,
  ctx: FrameContext,
  victim: Entity,
  killer: Entity,
  isBackAttack: boolean
): void => {
  const attackerIsPlayer = killer.id === 'player';
  const gain = victim.config.weightValue;

  if (state.arena) {
    awardArenaKill(state, ctx, victim, killer);
    ctx.events.emit('eat', { attacker: killer, victim, isBackAttack, x: victim.x, y: victim.y });
    for (let i = 0; i < 6; i++) state.particles.push(createCookieParticle(victim.x, victim.y));
    return;
  }

  // 吞下去的那条鱼回血（大鱼吃小鱼的即时反馈，与阵营无关）
  killer.health = Math.min(killer.maxHealth, killer.health + gain * 2);

  if (isPlayerFaction(killer)) {
    const p = state.player;
    const growth = Math.min(gain, Math.max(1, p.config.tier) * PLAYER_GROWTH_CONFIG.MAX_KILL_WEIGHT_PER_TIER);
    const leveledUp = awardPlayerGrowth(state, ctx, growth);
    p.eatenHistory[victim.type] = (p.eatenHistory[victim.type] || 0) + 1;
    if (!attackerIsPlayer) p.health = Math.min(p.maxHealth, p.health + gain * 2);

    if (leveledUp) {
      say(p, `升级至 Lv.${p.level}!`, 60, '#fcd34d');
    } else {
      say(p, pick(PHRASES.EAT) ?? '捕获!', 45, '#bef264');
    }
  }

  if (isBackAttack && attackerIsPlayer) {
    say(killer, pick(PHRASES.AMBUSH) ?? '偷袭!', 45, '#ef4444');
  }

  // 吃到鱼的奖励感：爆出一撮金色小饼干碎屑
  for (let i = 0; i < 6; i += 1) {
    state.particles.push(createCookieParticle(victim.x, victim.y));
  }

  ctx.events.emit('eat', {
    attacker: killer,
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

/**
 * 一次性死亡结算 —— 所有致死路径的最终收口（G1 / FQ-03）。
 *
 * 为什么需要它：以前只有撕咬会结算死亡（发奖励 / 发 death 事件 / 判胜利），
 * 而技能、中毒、陨石照样能把血打到 0 —— 尸体在 `combatSystem` 末尾被静默 filter 掉，
 * 于是「玩家一个技能崩死一条鱼」= 零收益、零事件、零胜利判定，连音效都没有。
 *
 * 幂等：`deathSettled` 标记保证一条鱼只结算一次。同帧内撕咬先结算、后面的技能再补刀
 * 不会二次发奖；反过来技能先打死、撕咬再判定也会被 `health <= 0` 的早退挡掉。
 *
 * @param killer 致死来源。缺省时（环境致死）只清理不发奖。
 * @returns 是否由本次调用完成结算（false = 已经结算过了）
 */
export const resolveDeath = (
  state: GameState,
  ctx: FrameContext,
  victim: Entity,
  killer?: Entity | null,
  isBackAttack = false
): boolean => {
  if (victim.deathSettled) return false;
  victim.deathSettled = true;
  victim.health = 0;

  if (!state.arena || victim.arenaStats) state.labels.push({
    x: victim.x,
    y: victim.y - 50,
    text: state.arena ? `淘汰 · ${state.arena.contestants.find(c => c.body === victim)?.name ?? victim.config.name}` : pick(PHRASES.EAT) ?? '捕获!',
    color: '#ef4444',
    timer: 60,
  });

  if (killer) {
    settleDevour(state, ctx, victim, killer, isBackAttack);
    // P0-4 胜利条件：玩家阵营（本体**或队友**）击杀深海霸主即通关
    checkVictory(state, killer, victim);
  }

  ctx.events.emit('death', { victim, killer: killer ?? undefined });
  return true;
};

/** 按 id 找回致死来源：玩家本体不在 entities 里，要单独认一次 */
const findKiller = (state: GameState, victim: Entity): Entity | null => {
  const id = victim.lastHitById;
  if (!id) return null;
  if (id === state.player.id) return state.player;
  return state.entities.find((e) => e.id === id) ?? null;
};

/* ══════════════ 大鱼反击（FQ-04 / §5.1） ══════════════ */

/**
 * 反击起手：被**更小的**鱼咬到，就进入一段有前摇的蓄力。
 *
 * 旧实现是「被咬的同一帧直接造成伤害」—— 玩家没有任何反应窗口，与 §5.1
 * 「大鱼反击改为可观察的动作：前摇、攻击范围、伤害时点和冷却。
 * 转身本身不立即生成无法躲避的伤害」直接冲突。
 * 现在这一帧只做三件事：起前摇、回头（纯表现）、亮预告；伤害等前摇走完才落地。
 */
const startCounter = (state: GameState, victim: Entity, attacker: Entity): void => {
  if (victim.radius <= attacker.radius) return; // 只有「被小个子咬」才反击
  if (victim.counterWindup && victim.counterWindup > 0) return; // 已经在蓄力
  if (victim.counterCooldown && victim.counterCooldown > 0) return; // 冷却中

  victim.counterWindup = COMBAT_CONFIG.COUNTER_WINDUP;
  victim.counterCooldown = COMBAT_CONFIG.COUNTER_COOLDOWN;
  // 回头瞄准只是**表现**：伤害留到前摇结束，转身本身不产生伤害
  victim.angle = Math.atan2(attacker.y - victim.y, attacker.x - victim.x);
  state.labels.push({
    x: victim.x,
    y: victim.y - 40,
    text: '猛回头!',
    color: '#fbbf24',
    timer: COMBAT_CONFIG.COUNTER_WINDUP,
  });
};

/** 先推进冷却，再推进前摇；前摇归零的那一帧才是「伤害时点」 */
const tickCounterOne = (state: GameState, ctx: FrameContext, e: Entity): void => {
  if (e.counterCooldown && e.counterCooldown > 0) e.counterCooldown -= 1;
  if (!e.counterWindup || e.counterWindup <= 0) return;
  e.counterWindup -= 1;
  if (e.counterWindup > 0) return; // 前摇还没走完 —— 这期间一点伤害都没有

  /* ── 伤害时点：范围内的敌对目标才吃这一下 ──
   * 判据是**当下**的站位（不是被咬那一刻），所以「挨了一口就赶紧游开」
   * 是真的躲得掉 —— 这就是 §5.1 要的那条可躲避路径。 */
  const range = e.radius * COMBAT_CONFIG.COUNTER_RANGE_MULT;
  const strike = (other: Entity): void => {
    if (other === e || other.health <= 0) return;
    if (dist(e, other) > range) return;
    if (!canHarm(e, other)) return;
    if (hasObstacleOcclusion(e, other, state.obstacles)) return;
    const dmg = dealDamage(other, e.config.damage * COMBAT_CONFIG.COUNTER_DAMAGE_MULT, e);
    ctx.events.emit('hurt', { target: other, amount: dmg, source: e });
  };
  for (const other of state.entities) strike(other);
  if (state.player !== e) strike(state.player);

  // 表现：一圈金色冲击 + 飘字。打空了也要有交代，玩家才读得懂「那下被躲开了」。
  state.labels.push({ x: e.x, y: e.y - 40, text: '反击!', color: '#f97316', timer: 40 });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const spark = createParticle(e.x, e.y, '#fbbf24');
    spark.vx = Math.cos(a) * 5;
    spark.vy = Math.sin(a) * 5;
    state.particles.push(spark);
  }
};

/** 每帧推进所有实体的反击状态（玩家本体不在 entities 里，单独走一遍） */
const tickCounters = (state: GameState, ctx: FrameContext): void => {
  for (const e of state.entities) tickCounterOne(state, ctx, e);
  tickCounterOne(state, ctx, state.player);
};

/** 一次攻击判定。attacker 试图吃 victim。 */
export const processCollision = (
  attacker: Entity,
  victim: Entity,
  state: GameState,
  ctx: FrameContext
): void => {
  if (attacker.health <= 0 || victim.health <= 0) return;
  // Arena neutrals are food, not attackers: zero-damage bites must not trigger fear or counters.
  if (state.arena && !attacker.arenaStats) return;

  // 吉祥物无敌且不参与战斗
  const mascot = CREATURES_MASCOT;
  if (attacker.type === mascot || victim.type === mascot) return;

  // 自己人不打自己人（统一阵营入口：combat / ai / skills 三处共用 `canHarm`）
  if (!canHarm(attacker, victim)) return;
  // 同类不互吃
  if (attacker.type === victim.type && !(state.arena && (attacker.arenaStats || victim.arenaStats))) return;
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
  if (hasObstacleOcclusion(attacker, victim, state.obstacles)) return;

  // 超过偷袭检测范围时，必须是实打实的贴身碰撞
  if (
    distance > AMBUSH_CONFIG.DETECTION_RANGE_MAX ||
    distance < AMBUSH_CONFIG.DETECTION_RANGE_MIN * 0.5
  ) {
    if (distance > attacker.radius + victim.radius) return;
  }

  /* ── ① 朝向与位置语义（FQ-04 / §5.1）──
   * 旧实现用一个 `angleDiff` 兼任两件事，于是「背刺」判反了：
   *   · **能不能咬到**（朝向）：看**攻击者**有没有朝着猎物；
   *   · **是不是背刺**（位置）：看**猎物的尾巴**朝哪边 —— 攻击者绕到尾部才算（§5.1）。
   * 两条从此分开算，别再让「攻击者背对猎物」冒充背刺。
   */
  const angleToVictim = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
  const facingDiff = normalizeAngle(angleToVictim - attacker.angle);
  const canBiteForward = Math.abs(facingDiff) <= Math.PI / 3;
  // 后弧可达：攻击者背对猎物时依然咬得到（保留旧触达范围，只是不再叫「背刺」）
  const canBiteRearArc = Math.abs(facingDiff) > AMBUSH_CONFIG.BACK_ANGLE_THRESHOLD;
  if (!canBiteForward && !canBiteRearArc) return;

  const angleToAttacker = Math.atan2(attacker.y - victim.y, attacker.x - victim.x);
  const tailDiff = normalizeAngle(angleToAttacker - victim.angle);
  const isBackAttack = Math.abs(tailDiff) > AMBUSH_CONFIG.BACK_ANGLE_THRESHOLD;

  const sizeRatio = attacker.radius / victim.radius;

  /* ── ② 命中：稳定造成伤害（FQ-04 / §5.1）──
   * 旧实现在这里掷一次骰子（体型越大 / 等级越高命中率越高），于是**同一位置、同样输入**
   * 有时咬中有时落空 —— 与 §5.1「稳定造成伤害」直接冲突，命中率上的加成也因此不可解释。
   * 现在满足朝向 / 距离 / 冷却就一定咬中；唯一保留随机落空的场合是
   * **猎物藏在掩体里**（水草 / 隐身）：那是有解释的掩体机制，不是贴身随机闪避。
   * 原来挂在命中率上的加成（等级压制 / 诱惑 / 小丑鱼）全部搬到伤害上，见 ③。
   */
  if (isConcealed(victim) && Math.random() >= CONCEAL_BITE_PROB_MULT) return;

  /* ── ③ 伤害：体型因子 × 等级优势 × 机制加成 × 背刺 ── */
  const sizeFactor = clamp(
    sizeRatio,
    COMBAT_CONFIG.SIZE_FACTOR_MIN,
    COMBAT_CONFIG.SIZE_FACTOR_MAX
  );
  let damage = attacker.config.damage * COMBAT_CONFIG.BITE_DAMAGE_MULT * sizeFactor;
  // 等级优势（原：命中率 +0.15/级 → 现在按伤害加成，按 LEVEL_DAMAGE_CAP 封顶）
  if (attacker.level > victim.level) {
    const maxSteps = Math.round(COMBAT_CONFIG.LEVEL_DAMAGE_CAP / COMBAT_CONFIG.LEVEL_DAMAGE_STEP);
    const steps = Math.min(attacker.level - victim.level, maxSteps);
    damage *= 1 + steps * COMBAT_CONFIG.LEVEL_DAMAGE_STEP;
  }
  // 诱惑中的猎手咬被香味骗来的鱼（原：命中率 +0.4）
  if (attacker.lureActive) damage *= COMBAT_CONFIG.LURE_DAMAGE_MULT;
  // 同级小丑鱼被针对（原有设定，原：命中率被覆盖成 0.7）
  if (
    attacker.level === victim.level &&
    victim.type === CREATURES_CLOWN &&
    attacker.type !== CREATURES_CLOWN
  ) {
    damage *= COMBAT_CONFIG.CLOWN_PREY_DAMAGE_MULT;
  }
  if (isBackAttack) damage *= 1 + COMBAT_CONFIG.BACK_BITE_BONUS;

  const realDamage = dealDamage(victim, damage, attacker);
  attacker.biteCooldown = COMBAT_CONFIG.BITE_COOLDOWN;

  // 被咬后体型缓慢缩水（P1-2）+ 恐惧 + 愤怒
  victim.radius = Math.max(
    COMBAT_CONFIG.MIN_RADIUS,
    victim.radius * COMBAT_CONFIG.SHRINK_ON_BITE
  );
  victim.fearTimer = 60;
  victim.angerTimer = COMBAT_CONFIG.ANGER_DURATION;

  ctx.events.emit('hurt', { target: victim, amount: realDamage, source: attacker });

  // 背刺提示：绕后打出来的那一下要让玩家看得见（旧实现只在「没咬中」时提示，恰好反了）
  if (isBackAttack && attacker.id === 'player') {
    say(attacker, pick(PHRASES.AMBUSH) ?? '偷袭!', 30, '#fcd34d');
  }

  /* ── ④ 大鱼反击：只起前摇，伤害留到前摇结束（FQ-04 / §5.1）── */
  startCounter(state, victim, attacker);

  /* ── ⑤ 判定死亡 ──
   * 两种死法：
   *   1) 吞下去 —— 对方残血且自己够大，一口吞（大鱼吃小鱼的爽感来源）
   *   2) 咬死   —— 自己不够大，但可以把对方活活咬到没血
   * 第 2 条是「小鱼逆袭大鱼」唯一可行的路径，不能砍掉 —— 旧模式仍受等级门闸约束
   * （仅限同等级及以下）；鱼群争霸按 §5.2 取消该门槛，改由数值优势与反击拉扯体现难度。
   */
  const canDevour =
    victim.health <= victim.maxHealth * COMBAT_CONFIG.DEVOUR_HP_RATIO &&
    sizeRatio >= COMBAT_CONFIG.DEVOUR_MIN_SIZE_RATIO;

  if (victim.health > 0 && !canDevour) return;

  /* ── 等级门闸：高于自己的猎物杀不死（旧模式保留；鱼群争霸已放开）──
   * 伤害 / 缩水 / 愤怒 / 反击都已照常发生，这里只拦「致死」：
   * 血量被这一口打到 0 以下时拉回 1（留个活口），吞噬同样失效。 */
  if (isUnkillable(state, attacker, victim)) {
    if (victim.health <= 0) victim.health = 1;
    return;
  }
  // 逆转判定：小鱼反杀大鱼（玩家专属高光时刻）
  if (
    !state.arena && sizeRatio < AMBUSH_CONFIG.REVERSAL_SIZE_THRESHOLD &&
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

  // 一次性结算：奖励 / death 事件 / 胜利判定全在里面，重复调用会被标记挡掉
  resolveDeath(state, ctx, victim, attacker, isBackAttack);

  if (attacker.radius > victim.radius * 1.1) {
    attacker.renderScale = 1.1;
    attacker.happyTimer = 30;
  }
};

/**
 * P0-4 胜利条件：玩家阵营击杀深海霸主即通关；玩家挂机时显示提示继续巡游。
 *
 * 判定改用**阵营**（G1 / FQ-03）：以前只认 `attacker.id === 'player'`，
 * 于是队友把 BOSS 磨到死也不算数 —— 和「收益记阵营」是同一个毛病的两面。
 * 野鱼 / 敌对鱼群击杀仍然不算（它们不是玩家阵营）。
 *
 * 抽成函数是因为不止一个地方能杀死实体（撕咬 / 技能 / 中毒 / 环境），逻辑不能各写一份。
 */
export const checkVictory = (state: GameState, attacker: Entity, victim: Entity): void => {
  if (state.arena) return;
  if (!isPlayerFaction(attacker)) return;
  if (victim.config.behavior !== 'BOSS') return;
  state.score += Math.floor(victim.config.weightValue);
  if (state.autopilotEnabled) {
    state.labels.push({ x: state.player.x, y: state.player.y - 70,
      text: `击败${victim.config.name} · 继续巡游`, color: '#fbbf24', timer: 150 });
    return;
  }
  state.status = GameStatus.VICTORY;
  recordRun(state); // 通关也上本地排行榜
};

const CREATURES_MASCOT = CreatureType.MASCOT;
const CREATURES_CLOWN = CreatureType.CLOWN_FISH;

/**
 * 每帧碰撞检测。
 *
 * 鱼 vs 鱼的宽相（2026-09-13 性能轮第二刀）：旧实现是平方距离双重循环
 * （180 实体 ≈ 1.6 万次比较/帧，占逻辑耗时 ~70%）。现在每帧把 entities
 * 重建进一棵 QuadTree（零分配，见 utils/SpatialHash.ts），每个实体只对
 * 「与自己接触的候选」做精确判定 —— 候选一般是 0~3 个。
 *
 * ⚠️ 行为等价三保证（缺一就会改变「同帧谁吃谁」和 Math.random 取数顺序）：
 *  1. 候选集合不变：树的叶子精检 `d² ≤ (r1+r2)²` 与旧门闸
 *     `dist(a,b) > a.radius + b.radius → continue` 数学等价（半径非负）；
 *  2. 处理顺序不变：查询结果按**原数组下标升序**排序，只处理 j > i ——
 *     与旧双循环 (i, j) 的遍历序完全一致（自身 j === i 也被 j > i 挡掉）；
 *  3. 树是快照但实体是引用：combat 不改 x/y，尸体清理在循环后替换数组
 *     （树下一帧重建），咬后缩水改的 radius 通过 itemAt 回读实时值。
 */
const combatTree = new QuadTree<Entity>();
const combatBuf: number[] = [];
const byIndexAsc = (a: number, b: number): number => a - b;

export const combatSystem = (state: GameState, ctx: FrameContext): void => {
  const { player, entities } = state;

  // 大鱼反击的时钟（前摇倒计时 + 冷却）：必须在碰撞之前推进，
  // 否则「前摇结束那一帧」的伤害时点会被拖到下一帧才结算
  tickCounters(state, ctx);

  // 玩家 vs 鱼（O(n) 线性，无需索引）
  for (const e of entities) {
    if (e.type === CREATURES_MASCOT) continue;
    if (dist(e, player) < e.radius + player.radius) {
      processCollision(e, player, state, ctx);
      processCollision(player, e, state, ctx);
    }
  }

  // 鱼 vs 鱼：让世界自己运转（重构前这一段完全缺失）
  combatTree.rebuild(entities);
  for (let i = 0; i < entities.length; i += 1) {
    const a = entities[i];
    if (a.health <= 0) continue;
    const count = combatTree.queryCircle(a.x, a.y, a.radius, combatBuf);
    if (count === 0) continue;
    combatBuf.sort(byIndexAsc);
    for (let k = 0; k < count; k += 1) {
      const j = combatBuf[k];
      if (j <= i) continue;
      const b = entities[j];
      if (b.health <= 0) continue;
      processCollision(a, b, state, ctx);
      processCollision(b, a, state, ctx);
    }
  }

  /* ── 一次性死亡结算（G1 / FQ-03）──
   * 撕咬会在 `processCollision` 里当场结算，但技能 / 中毒 / 陨石这些路径只管扣血，
   * 扣到 0 就完事了 —— 以前这些尸体在下面被静默 filter 掉，零奖励、零 death 事件、
   * 零胜利判定（玩家一个技能崩死 BOSS 不通关，就是这个洞）。
   * 这里统一补一刀：`deathSettled` 保证撕咬已经结算过的不会再发一次。
   */
  let hasCorpse = false;
  for (const e of entities) {
    if (e.health > 0) continue;
    hasCorpse = true;
    if (!e.deathSettled) resolveDeath(state, ctx, e, findKiller(state, e));
  }

  // 清理尸体（放在最后，保证本帧事件都能拿到完整 victim 数据）
  if (hasCorpse) {
    state.entities = entities.filter((e) => e.health > 0);
  }
};
