/**
 * G1 / FQ-04 —— 战斗规格四条（《鱼群争霸开发计划》§5.1 / §5.2）。
 *
 *   ① 稳定撕咬：满足朝向 / 距离 / 冷却就一定造成伤害，同一位置同样输入结果一致
 *   ② 背刺方向：**攻击者在猎物尾部**才算背刺（旧实现判反了，判的是「猎物在攻击者身后」）
 *   ③ 越级击杀：鱼群争霸（state.run）取消「高等级保底 1 血」硬门槛，旧模式保留
 *   ④ 大鱼反击：前摇 → 范围 → 伤害时点 → 冷却，挨了一口游开就能躲掉
 *
 * ⚠️ 本仓库 `uuid()` = `Math.random().toString(36)`，钉随机数时全场实体会拿到同一个 id。
 *    本文件尽量**不钉随机数** —— 那本身就是要验证的事（撕咬不该再掷骰子）。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createEntity } from '../systems/spawn';
import { createInitialState } from '../factories/initialState';
import { combatSystem, processCollision } from '../systems/combat';
import { clamp } from '../core/math';
import { COMBAT_CONFIG } from '../data/world';
import { RUN_MODE, createRunState } from '../data/runRules';
import { CreatureType } from '../data/creatures';
import { MAP_CENTER } from '../systems/terrain';
import { GameStatus } from '../types';
import type { FrameContext, GameEvents, GameState, Entity } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const makeState = (rivals = false): GameState => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  if (rivals) state.run = createRunState(RUN_MODE.RIVALS);
  return state;
};

/** 战场刻意摆远一点，别让 combatSystem 的「玩家 vs 鱼」那一段插进来 */
const BATTLE_X = 800;
const BATTLE_Y = 800;

/**
 * 造一对贴身对手。
 * 猎物固定在 (BATTLE_X, BATTLE_Y) 且**朝 +x**；攻击者站在它正前方（默认）
 * 或正后方（`behind: true`）——「前后」一律按**猎物的朝向**算，这正是 FQ-04 的语义。
 */
const makePair = (
  attackerType: CreatureType,
  victimType: CreatureType,
  opts: { behind?: boolean; attackerAngle?: number } = {}
): { state: GameState; attacker: Entity; victim: Entity } => {
  const state = makeState();
  const victim = createEntity(victimType, BATTLE_X, BATTLE_Y);
  const offset = opts.behind ? -20 : 20;
  const attacker = createEntity(attackerType, BATTLE_X + offset, BATTLE_Y);
  for (const e of [attacker, victim]) {
    e.semiGhostTimer = 0;
    e.invulnerableTimer = 0;
    e.biteCooldown = 0;
  }
  victim.angle = 0; // 猎物朝 +x
  // 默认：攻击者正对猎物（朝 -x 或 +x 取决于站在哪边）
  attacker.angle = opts.attackerAngle ?? (opts.behind ? 0 : Math.PI);

  state.entities = [attacker, victim];
  return { state, attacker, victim };
};

/**
 * 同 `makePair`，但把**猎物血量拉满**。
 *
 * 为什么非要这样：大白鲨对大蓝唐鱼的一口 ≈120，而蓝唐鱼只有 20 血 —— 那一口会
 * 当场满足 `DEVOUR_HP_RATIO` 把它整个吞掉，`victim.health` 归 0，
 * 量出来的就不再是「这一口的伤害」而是「整条血的 20」。凡是要比数值的用例都得先 Tank 起来，
 * 顺便把 `DEVOUR_HP_RATIO` 也堵住，保证结算路径是「咬」而不是「吞」。
 */
const makeTankyPair = (
  attackerType: CreatureType,
  victimType: CreatureType,
  opts: { behind?: boolean; attackerAngle?: number } = {}
) => {
  const pair = makePair(attackerType, victimType, opts);
  pair.victim.maxHealth = 1e6;
  pair.victim.health = 1e6;
  return pair;
};

/** 这一口让猎物掉了多少血（>0 表示真的咬中了） */
const biteDamage = (attacker: Entity, victim: Entity, state: GameState, ctx: FrameContext): number => {
  const before = victim.health;
  attacker.biteCooldown = 0;
  processCollision(attacker, victim, state, ctx);
  return before - victim.health;
};

afterEach(() => {
  vi.restoreAllMocks();
});

/* ══════════════ ① 稳定撕咬 ══════════════ */

describe('FQ-04 稳定撕咬：满足朝向 / 距离 / 冷却就一定造成伤害', () => {
  it('同一位置、同样输入连续采样 30 次，每一口都掉血（不再掷骰子）', () => {
    const { state, attacker, victim } = makePair(CreatureType.GREAT_WHITE, CreatureType.BLUE_TANG);
    const ctx = makeCtx();
    victim.maxHealth = 1e6;
    victim.health = 1e6; // 血量拉满：只观察「咬没咬中」，不掺死亡与吞噬

    const randomSpy = vi.spyOn(Math, 'random');
    const damages: number[] = [];
    for (let i = 0; i < 30; i += 1) damages.push(biteDamage(attacker, victim, state, ctx));

    // 每一口都必须 > 0（旧实现里 eatProbability 只有 0.05~0.8，必然出现 0）
    expect(damages.every((d) => d > 0)).toBe(true);
    // 而且每一口都一样：同一位置 + 同样输入 = 同样结果（§5.1「可预测的攻击」）
    expect(new Set(damages).size).toBe(1);
    // 整个判定过程一次骰子都没掷（没有隐藏的命中率）
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('朝向不满足（落在 60°~120° 空档）时不发起攻击', () => {
    const { state, attacker, victim } = makePair(CreatureType.GREAT_WHITE, CreatureType.BLUE_TANG, {
      attackerAngle: Math.PI / 2, // 与猎物方位差 90°：既不正对，也不在后弧
    });
    const ctx = makeCtx();
    expect(biteDamage(attacker, victim, state, ctx)).toBe(0);
    expect(attacker.biteCooldown).toBe(0); // 没咬出去，不该吃掉冷却
  });

  it('攻击者背对猎物时仍可咬到（后弧触达保持旧行为，只是不再叫「背刺」）', () => {
    const { state, attacker, victim } = makePair(CreatureType.GREAT_WHITE, CreatureType.BLUE_TANG, {
      behind: true,
      attackerAngle: Math.PI, // 站在猎物身后，却背对着它 → 后弧可达
    });
    const ctx = makeCtx();
    expect(biteDamage(attacker, victim, state, ctx)).toBeGreaterThan(0);
    expect(attacker.biteCooldown).toBe(COMBAT_CONFIG.BITE_COOLDOWN);
  });

  it('撕咬冷却中不再扣血（同一次攻击只结算一次）', () => {
    const { state, attacker, victim } = makePair(CreatureType.GREAT_WHITE, CreatureType.BLUE_TANG);
    const ctx = makeCtx();
    biteDamage(attacker, victim, state, ctx);
    expect(biteDamage(attacker, victim, state, ctx)).toBe(0);
  });
});

/* ══════════════ ② 背刺方向 ══════════════ */

describe('FQ-04 背刺方向：攻击者绕到猎物尾部才算', () => {
  it('正面（攻击者在猎物前方）不算背刺', () => {
    const { state, attacker, victim } = makeTankyPair(CreatureType.GREAT_WHITE, CreatureType.BLUE_TANG);
    const ctx = makeCtx();
    // 把等级差抹平：这一段只谈「背刺加成有没有」，等级优势另有 ③ 专测。
    // （不抹平的话大白鲨 Lv5 打蓝唐鱼 Lv2 会先乘一个 1+3×LEVEL_DAMAGE_STEP）
    attacker.level = victim.level;
    // 基准值必须在**咬之前**算：`SHRINK_ON_BITE` 会在咬后把猎物半径缩 0.5%，
    // 咬完再算会让「期望值」比「实际伤害」大一点点。大白鲨这一档被 SIZE_FACTOR 封顶
    // 挡着看不出差别，但规矩得立住 —— 换个不被封顶的体型就会翻车。
    const base =
      attacker.config.damage *
      COMBAT_CONFIG.BITE_DAMAGE_MULT *
      clamp(attacker.radius / victim.radius, COMBAT_CONFIG.SIZE_FACTOR_MIN, COMBAT_CONFIG.SIZE_FACTOR_MAX);
    const front = biteDamage(attacker, victim, state, ctx);
    // 正面就是「干净的一口」：没有背刺加成
    expect(front).toBeCloseTo(base, 5);
  });

  it('绕后（攻击者在猎物尾部）算背刺，伤害高于正面', () => {
    const ctx = makeCtx();
    // 两侧各用**一对全新的鱼**：体型因子取的是同一份「出厂半径」，
    // 比值才正好是 1 + BACK_BITE_BONUS（同一对鱼连咬两口会被 SHRINK_ON_BITE 带偏）
    const front = makeTankyPair(CreatureType.GREAT_WHITE, CreatureType.BLUE_TANG);
    const frontDamage = biteDamage(front.attacker, front.victim, front.state, ctx);

    const back = makeTankyPair(CreatureType.GREAT_WHITE, CreatureType.BLUE_TANG, { behind: true });
    const backDamage = biteDamage(back.attacker, back.victim, back.state, ctx);

    expect(backDamage).toBeGreaterThan(frontDamage);
    expect(backDamage).toBeCloseTo(frontDamage * (1 + COMBAT_CONFIG.BACK_BITE_BONUS), 5);
  });

  it('旧语义不再成立：攻击者背对猎物（猎物在它身后）**不是**背刺', () => {
    // 攻击者站在猎物**前方**（按猎物朝向算），却背对着猎物 —— 这正是旧实现认成
    // 「背刺」的姿势（「猎物在攻击者身后」），FQ-04 之后它必须只是普通的一口。
    const ctx = makeCtx();
    const odd = makeTankyPair(CreatureType.GREAT_WHITE, CreatureType.BLUE_TANG, {
      attackerAngle: 0, // 站在 +x 侧却朝 +x：背对猎物
    });
    const oddDamage = biteDamage(odd.attacker, odd.victim, odd.state, ctx);

    const front = makeTankyPair(CreatureType.GREAT_WHITE, CreatureType.BLUE_TANG);
    const frontDamage = biteDamage(front.attacker, front.victim, front.state, ctx);

    expect(oddDamage).toBeGreaterThan(0); // 后弧可达，照样咬得到
    expect(oddDamage).toBeCloseTo(frontDamage, 5); // 但没有背刺加成
  });
});

/* ══════════════ ③ 越级击杀 ══════════════ */

describe('FQ-04 越级击杀：新模式取消硬门槛，旧模式保留原规则', () => {
  const setupOverlevel = (state: GameState) => {
    const boss = createEntity(CreatureType.ORCA, BATTLE_X, BATTLE_Y);
    const small = createEntity(CreatureType.CLOWN_FISH, BATTLE_X + 20, BATTLE_Y);
    for (const e of [boss, small]) {
      e.semiGhostTimer = 0;
      e.invulnerableTimer = 0;
      e.biteCooldown = 0;
    }
    boss.angle = 0;
    small.angle = Math.PI;
    state.entities = [small, boss];
    expect(boss.level).toBeGreaterThan(small.level); // 前提：确实是越级
    boss.health = 1; // 残血：这一口本该带走
    return { boss, small };
  };

  it('旧模式：越级咬残血 BOSS，血量保底 1（原规则不动）', () => {
    const state = makeState(false);
    const { boss, small } = setupOverlevel(state);
    processCollision(small, boss, state, makeCtx());
    expect(boss.health).toBe(1);
    expect(state.status).toBe(GameStatus.PLAYING);
  });

  it('鱼群争霸：同样的一口直接带走（§5.2 取消硬门槛）', () => {
    const state = makeState(true);
    const { boss, small } = setupOverlevel(state);
    processCollision(small, boss, state, makeCtx());
    expect(boss.health).toBe(0);
  });

  it('等级优势仍然存在，只是从命中率挪到了伤害上（且有上限）', () => {
    const ctx = makeCtx();
    // 同为「正面咬 BLUE_TANG」，只差等级：Lv2 打 Lv2 → 无加成
    const even = makePair(CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG);
    even.attacker.level = even.victim.level;
    const evenDamage = biteDamage(even.attacker, even.victim, even.state, ctx);
    const evenBase = evenDamage; // 无等级加成时就是公式里的那一坨

    // 高一级 → 伤害 ×1.15
    const up = makePair(CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG);
    up.attacker.level = up.victim.level + 1;
    const upDamage = biteDamage(up.attacker, up.victim, up.state, ctx);
    expect(upDamage).toBeCloseTo(evenBase * (1 + COMBAT_CONFIG.LEVEL_DAMAGE_STEP), 5);

    // 差 99 级 → 封顶在 LEVEL_DAMAGE_CAP，不是无限放大
    const cap = makePair(CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG);
    cap.attacker.level = cap.victim.level + 99;
    const capDamage = biteDamage(cap.attacker, cap.victim, cap.state, ctx);
    expect(capDamage).toBeCloseTo(evenBase * (1 + COMBAT_CONFIG.LEVEL_DAMAGE_CAP), 5);
  });
});

/* ══════════════ ④ 大鱼反击 ══════════════ */

describe('FQ-04 大鱼反击：前摇 → 范围 → 伤害时点 → 冷却', () => {
  /**
   * 大鱼（虎鲸）被小鱼（小丑鱼）咬一口 → 只起前摇。
   * 攻击者血量拉满：这一组用例只观察「反击打没打中」，不掺死亡。
   */
  const startCounterScene = () => {
    const state = makeState();
    const big = createEntity(CreatureType.ORCA, BATTLE_X, BATTLE_Y);
    const small = createEntity(CreatureType.CLOWN_FISH, BATTLE_X + 20, BATTLE_Y);
    for (const e of [big, small]) {
      e.semiGhostTimer = 0;
      e.invulnerableTimer = 0;
      e.biteCooldown = 0;
    }
    big.angle = 0;
    small.angle = Math.PI;
    small.maxHealth = 1e6;
    small.health = 1e6;
    state.entities = [small, big];
    expect(big.radius).toBeGreaterThan(small.radius); // 前提：确实是被小个子咬

    processCollision(small, big, state, makeCtx());
    return { state, big, small };
  };

  /** 推进 n 帧（只走 combatSystem，关掉大鱼自己的普通撕咬，隔离出反击这一条路） */
  const tick = (state: GameState, big: Entity, n: number) => {
    const ctx = makeCtx();
    for (let i = 0; i < n; i += 1) {
      big.biteCooldown = 999; // 不让「大鱼顺手再咬一口」污染观察
      combatSystem(state, ctx);
    }
  };

  it('被小鱼咬到只起前摇：大鱼挨的是撕咬那一下，反击当帧不落地', () => {
    const { big, small } = startCounterScene();
    expect(big.counterWindup).toBe(COMBAT_CONFIG.COUNTER_WINDUP);
    // 大鱼掉的血来自「被撕咬」那一下（正常结算，怪物难度就该这样）
    expect(big.health).toBeLessThan(big.maxHealth);
    // 关键：**反击**没有立刻生效 —— 小丑鱼一点血没掉，也没被记归属
    expect(small.health).toBe(small.maxHealth);
    expect(small.lastHitById).toBeUndefined();
  });

  it('前摇走完才结算伤害：范围内的鱼挨打', () => {
    const { state, big, small } = startCounterScene();
    tick(state, big, COMBAT_CONFIG.COUNTER_WINDUP - 1);
    expect(small.health).toBe(small.maxHealth); // 前摇最后一帧前都还是安全的

    tick(state, big, 1);
    expect(big.counterWindup).toBe(0);
    expect(small.health).toBeLessThan(small.maxHealth);
  });

  it('挨了一口就游出范围，可以完全躲开（这就是「可躲避」的落点）', () => {
    const { state, big, small } = startCounterScene();
    // 前摇期间游走：跑到判定范围之外（COUNTER_RANGE_MULT × 大鱼半径）
    small.x = BATTLE_X + big.radius * COMBAT_CONFIG.COUNTER_RANGE_MULT + 200;

    tick(state, big, COMBAT_CONFIG.COUNTER_WINDUP + 1);

    expect(small.health).toBe(small.maxHealth); // 一点没掉
    // 但反击确实「放出来了」：前摇走完、进入冷却 —— 是打空，不是没打
    expect(big.counterWindup).toBe(0);
    expect(big.counterCooldown).toBeGreaterThan(0);
  });

  it('反击有冷却：冷却期内再被咬不会起新的前摇', () => {
    const { state, big, small } = startCounterScene();
    tick(state, big, COMBAT_CONFIG.COUNTER_WINDUP + 1);
    expect(big.counterCooldown).toBeGreaterThan(0);

    // 冷却中再咬一口：伤害照算，但不该再起前摇
    const before = big.counterCooldown ?? 0;
    processCollision(small, big, state, makeCtx());
    expect(big.counterWindup).toBe(0);
    expect(big.counterCooldown).toBeLessThanOrEqual(before);
  });

  it('反击也走统一伤害入口：致命那一击归属被咬的大鱼', () => {
    const { state, big, small } = startCounterScene();
    const weightBefore = state.player.weight;
    small.maxHealth = 10;
    small.health = 10; // 一口就能被反击打死

    tick(state, big, COMBAT_CONFIG.COUNTER_WINDUP + 1);

    expect(small.health).toBe(0);
    // 归属记录到被咬的大鱼（反击也是正常伤害来源，走同一条 dealDamage）
    expect(small.lastHitById).toBe(big.id);
    // 小丑鱼不在玩家阵营 → 收益不该进玩家账（归属按阵营，不是「谁在旁边谁拿」）
    expect(state.player.weight).toBe(weightBefore);
  });
});

/* ══════════════ 边界：反击不该被玩家输入位置带偏 ══════════════ */

describe('FQ-04 大鱼反击：玩家也在实体表外，但照样会被反击到', () => {
  it('玩家被大鱼反击时走的是同一条路径（state.player 单独遍历）', () => {
    const state = makeState();
    const big = createEntity(CreatureType.ORCA, MAP_CENTER.x, MAP_CENTER.y);
    big.semiGhostTimer = 0;
    big.invulnerableTimer = 0;
    big.biteCooldown = 0;
    state.entities = [big];

    // 玩家贴着大鱼、血量拉满（只观察反击是否落到玩家身上）
    state.player.x = MAP_CENTER.x + 20;
    state.player.y = MAP_CENTER.y;
    state.player.maxHealth = 1e6;
    state.player.health = 1e6;
    state.player.invulnerableTimer = 0;
    state.player.angle = Math.PI; // 面向大鱼（正前方）
    big.angle = 0;

    processCollision(state.player, big, state, makeCtx());
    expect(big.counterWindup).toBe(COMBAT_CONFIG.COUNTER_WINDUP);

    const ctx = makeCtx();
    for (let i = 0; i < COMBAT_CONFIG.COUNTER_WINDUP + 1; i += 1) {
      big.biteCooldown = 999;
      combatSystem(state, ctx);
    }
    expect(state.player.health).toBeLessThan(1e6);
  });
});
