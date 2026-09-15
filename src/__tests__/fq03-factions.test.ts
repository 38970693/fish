/**
 * G1 / FQ-03 —— 统一阵营、伤害来源与一次性死亡/收益归属。
 *
 * 对应《鱼群争霸开发计划》§5.2 / §11.1 与《架构评估与演进计划》AR-02。
 * 这一组用例钉死四件事：
 *   ① 友伤矩阵：普通攻击 / 范围技能 / 持续伤害都不打自己人，野鱼照打（生态链不断）
 *   ② 一次死亡只结算一次（撕咬 / 技能 / 中毒 / 环境四条路径共用一个收口）
 *   ③ 任意致死来源都不漏奖励（以前技能打死 = 零收益零事件）
 *   ④ 收益记**阵营**：队友击杀照样进玩家账，抢最后一口不再是唯一解
 *
 * ⚠️ 本仓库的 `uuid()` = `Math.random().toString(36)`，一旦把 Math.random 钉成常数，
 *    场上所有实体会拿到同一个 id —— 凡是需要钉随机数的用例，记得手动给实体补不同 id。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createEntity } from '../systems/spawn';
import { createInitialState } from '../factories/initialState';
import {
  combatSystem,
  processCollision,
  dealDamage,
  resolveDeath,
} from '../systems/combat';
import { castSkill } from '../systems/skills';
import { aiSystem } from '../systems/ai';
import { canHarm, factionOf, FACTION } from '../systems/factions';
import { COMBAT_CONFIG } from '../data/world';
import { CreatureType } from '../data/creatures';
import { GameStatus } from '../types';
import type { FrameContext, GameEvents, GameState, Entity } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

interface CtxWithCounter extends FrameContext {
  deaths: { victim: Entity; killer?: Entity }[];
}

const makeCountingCtx = (): CtxWithCounter => {
  const ctx = makeCtx() as CtxWithCounter;
  ctx.deaths = [];
  ctx.events.on('death', (payload) => ctx.deaths.push(payload));
  return ctx;
};

const makeState = (): GameState => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  return state;
};

/** 在玩家旁边放一条鱼；`team` 传 'player' 就是战队成员 */
const placeFish = (
  state: GameState,
  type: CreatureType,
  offsetX: number,
  team?: string
): Entity => {
  const e = createEntity(type, state.player.x + offsetX, state.player.y);
  e.semiGhostTimer = 0;
  e.invulnerableTimer = 0;
  if (team) e.ownerId = team;
  state.entities.push(e);
  return e;
};

afterEach(() => {
  vi.restoreAllMocks();
});

/* ══════════════ ① 阵营关系 ══════════════ */

describe('FQ-03 阵营：唯一可攻击判定', () => {
  it('玩家本体与战队成员同阵营，互相打不到', () => {
    const state = makeState();
    const member = placeFish(state, CreatureType.SQUID, 60, 'player');

    expect(factionOf(state.player)).toBe(FACTION.PLAYER);
    expect(factionOf(member)).toBe(FACTION.PLAYER);
    expect(canHarm(state.player, member)).toBe(false);
    expect(canHarm(member, state.player)).toBe(false);
  });

  it('野鱼之间保留生态链：WILD 不是「中立阵营」，该吃照样吃', () => {
    const state = makeState();
    const a = placeFish(state, CreatureType.ORCA, 60);
    const b = placeFish(state, CreatureType.SQUID, 120);

    expect(factionOf(a)).toBe(FACTION.WILD);
    expect(canHarm(a, b)).toBe(true);
  });

  it('玩家阵营 vs 野鱼：双向都能打', () => {
    const state = makeState();
    const wild = placeFish(state, CreatureType.SQUID, 60);
    const member = placeFish(state, CreatureType.BLUE_TANG, 120, 'player');

    expect(canHarm(state.player, wild)).toBe(true);
    expect(canHarm(wild, state.player)).toBe(true);
    expect(canHarm(member, wild)).toBe(true);
  });

  it('自己不打自己（按对象判，不是按 id 判）', () => {
    const state = makeState();
    const a = placeFish(state, CreatureType.SQUID, 60);
    expect(canHarm(a, a)).toBe(false);
    expect(canHarm(state.player, state.player)).toBe(false);
  });
});

/* ══════════════ ② 友伤矩阵（普通攻击 / 范围技能 / 持续伤害） ══════════════ */

describe('FQ-03 友伤矩阵', () => {
  it('普通撕咬：玩家咬不到自己的队员', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 命中判定必定成功
    const state = makeState();
    const ctx = makeCtx();
    const member = placeFish(state, CreatureType.SQUID, 20, 'player');
    member.id = 'member-1';
    state.player.id = 'player';

    const before = member.health;
    processCollision(state.player, member, state, ctx);
    processCollision(member, state.player, state, ctx);

    expect(member.health).toBe(before);
    expect(state.player.health).toBe(state.player.maxHealth);
  });

  it('范围技能：SHOCK 只打野鱼，不打队员（技能以前完全没有阵营过滤）', () => {
    const state = makeState();
    const ctx = makeCtx();
    const member = placeFish(state, CreatureType.SQUID, 40, 'player');
    const wild = placeFish(state, CreatureType.BLUE_TANG, 80);
    member.id = 'member-1';
    wild.id = 'wild-1';

    const memberHp = member.health;
    const wildHp = wild.health;

    castSkill(state, ctx, state.player, 'SHOCK', 1);

    expect(member.health).toBe(memberHp); // 自己人：毫发无伤
    expect(wild.health).toBeLessThan(wildHp); // 野鱼：照打
  });

  it('持续伤害：VENOM 不会给自己的队员挂毒', () => {
    const state = makeState();
    const ctx = makeCtx();
    state.player.angle = 0; // 正对 +x
    const member = placeFish(state, CreatureType.SQUID, state.player.radius * 2, 'player');
    member.id = 'member-2';

    castSkill(state, ctx, state.player, 'VENOM', 1);

    expect(member.poisonTimer).toBe(0);
  });

  it('单体技能不会「锁定」队员（nearestEnemy 以前只按距离取）', () => {
    const state = makeState();
    const ctx = makeCtx();
    const member = placeFish(state, CreatureType.SQUID, 30, 'player');
    const wild = placeFish(state, CreatureType.BLUE_TANG, 200);
    member.id = 'member-3';
    wild.id = 'wild-3';

    castSkill(state, ctx, state.player, 'WEAKNESS_MARK', 1);

    // 弱点标记只能点野鱼（范围内最近的合法敌人）
    expect(member.vulnerableTimer ?? 0).toBe(0);
    expect(wild.vulnerableTimer ?? 0).toBeGreaterThan(0);
  });
});

/* ══════════════ ③ 一次性死亡结算 ══════════════ */

describe('FQ-03 一次死亡只结算一次', () => {
  it('同一条鱼重复调用 resolveDeath 只发一次奖励与一次事件', () => {
    const state = makeState();
    const ctx = makeCountingCtx();
    const victim = placeFish(state, CreatureType.SQUID, 40);
    victim.id = 'victim-1';

    const weightBefore = state.player.weight;
    const gain = victim.config.weightValue;

    expect(resolveDeath(state, ctx, victim, state.player)).toBe(true);
    expect(resolveDeath(state, ctx, victim, state.player)).toBe(false);
    expect(resolveDeath(state, ctx, victim, state.player)).toBe(false);

    expect(ctx.deaths).toHaveLength(1);
    expect(state.player.weight).toBe(weightBefore + gain);
  });

  it('技能致死也会被结算（以前这类死亡被静默清掉：零事件零收益）', () => {
    const state = makeState();
    const ctx = makeCountingCtx();
    const victim = placeFish(state, CreatureType.SQUID, 40);
    victim.id = 'victim-2';
    victim.health = 1; // 一发 SHOCK 必死

    const weightBefore = state.player.weight;
    castSkill(state, ctx, state.player, 'SHOCK', 1);
    expect(victim.health).toBeLessThanOrEqual(0);

    combatSystem(state, ctx); // 尸体清理前统一补结算

    expect(ctx.deaths).toHaveLength(1);
    expect(ctx.deaths[0].killer?.id).toBe('player');
    expect(state.player.weight).toBe(weightBefore + victim.config.weightValue);
    expect(state.entities.some((e) => e.id === 'victim-2')).toBe(false);
  });

  it('环境致死（无来源）只清场不发奖 —— 不把别人的归属抢过来', () => {
    const state = makeState();
    const ctx = makeCountingCtx();
    const victim = placeFish(state, CreatureType.SQUID, 40);
    victim.id = 'victim-3';

    const weightBefore = state.player.weight;
    dealDamage(victim, 99999); // 没有 source：陨石 / 腐蚀这一类

    combatSystem(state, ctx);

    expect(ctx.deaths).toHaveLength(1);
    expect(state.player.weight).toBe(weightBefore); // 没凶手，就没有收益
  });

  it('中毒致死归属施毒者（持续伤害也是一条合法致死路径）', () => {
    const state = makeState();
    const ctx = makeCountingCtx();
    const victim = placeFish(state, CreatureType.SQUID, 40);
    victim.id = 'victim-4';
    victim.poisonTimer = 1;
    victim.poisonSourceId = 'player'; // 玩家的 VENOM 挂的毒
    victim.health = 0.01; // 这一口毒就是最后一击

    const weightBefore = state.player.weight;
    aiSystem(state, ctx);
    expect(victim.health).toBeLessThanOrEqual(0);

    combatSystem(state, ctx);

    expect(ctx.deaths).toHaveLength(1);
    expect(ctx.deaths[0].killer?.id).toBe('player');
    expect(state.player.weight).toBe(weightBefore + victim.config.weightValue);
  });
});

/* ══════════════ ④ 收益记阵营 ══════════════ */

describe('FQ-03 收益归属：队友击杀也算玩家的', () => {
  it('队友咬死的鱼，成长进玩家账（抢最后一口不再是最优解）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState();
    const ctx = makeCountingCtx();
    const member = placeFish(state, CreatureType.GREAT_WHITE, 60, 'player');
    const victim = placeFish(state, CreatureType.SQUID, 80);
    member.id = 'member-kill';
    victim.id = 'victim-kill';
    member.level = 99; // 绕开等级门闸，只验证归属
    victim.health = 1;

    const weightBefore = state.player.weight;
    const epBefore = state.player.evolutionPoints;
    processCollision(member, victim, state, ctx);

    expect(victim.health).toBe(0);
    expect(state.player.weight).toBe(weightBefore + victim.config.weightValue);
    expect(state.player.evolutionPoints).toBe(epBefore + victim.config.weightValue);
    expect(state.player.eatenHistory[victim.type]).toBe(1);
  });

  it('队友击杀 BOSS 同样触发胜利（以前只认 attacker.id === player）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState();
    const ctx = makeCountingCtx();
    const member = placeFish(state, CreatureType.GREAT_WHITE, 60, 'player');
    const boss = placeFish(state, CreatureType.ORCA, 80);
    member.id = 'member-boss';
    boss.id = 'boss-1';
    member.level = 99;
    boss.health = 1;

    processCollision(member, boss, state, ctx);

    expect(state.status).toBe(GameStatus.VICTORY);
  });

  it('野鱼互吃不给玩家记成长（生态链收益不进玩家账）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState();
    const ctx = makeCountingCtx();
    const predator = placeFish(state, CreatureType.ORCA, 60);
    const prey = placeFish(state, CreatureType.SQUID, 80);
    predator.id = 'pred-1';
    prey.id = 'prey-1';
    predator.level = 99;
    prey.health = 1;

    const weightBefore = state.player.weight;
    processCollision(predator, prey, state, ctx);

    expect(prey.health).toBe(0);
    expect(state.player.weight).toBe(weightBefore);
  });
});

/* ══════════════ ⑤ 背刺方向（FQ-04 已修正，留作对照） ══════════════ */

/**
 * 这条用例原先钉的是**反的**语义：「把攻击者转过去背对猎物，就算背刺」。
 * FQ-04 按 §5.1 改成「攻击者位于**猎物尾部**才算」，所以整条用例翻了过来 ——
 * 留在原文件里是为了让「当初那个反的判据」有据可查（改的人一眼能看到前后差别）。
 */
describe('背刺方向语义（FQ-04 修正后）', () => {
  it('判据是「攻击者在猎物尾部」，不是「猎物在攻击者身后」', () => {
    const state = makeState();
    const ctx = makeCtx();
    // 攻击者 0 号位、猎物 +10：攻击者在猎物的 -x 侧，两人都朝 +x（攻击者正对猎物）
    const attacker = placeFish(state, CreatureType.CLOWN_FISH, 0);
    const victim = placeFish(state, CreatureType.BLUE_TANG, 10);
    attacker.id = 'atk-dir';
    victim.id = 'vic-dir';
    victim.maxHealth = 1e6;
    victim.health = 1e6; // 只量伤害，不掺死亡与吞噬
    attacker.angle = 0;
    // ⚠️ 同一对鱼连咬两口：`SHRINK_ON_BITE` 会在第一口后把猎物半径缩 0.5%，
    //    体型因子随之变大 —— 不还原半径，「背刺 = 正面 × 1.5」就永远差 0.5%。
    const r0 = victim.radius;

    // ① 猎物朝 +x（尾巴朝 -x）→ 攻击者正站在它尾部 = 背刺
    victim.angle = 0;
    processCollision(attacker, victim, state, ctx);
    const afterBack = victim.health;
    const backDamage = 1e6 - afterBack;

    // ② 猎物转身面对攻击者 → 攻击者不再位于尾部 = 普通一口
    victim.radius = r0; // 抹掉咬后缩水，两口的体型因子才可比
    victim.angle = Math.PI;
    attacker.biteCooldown = 0;
    processCollision(attacker, victim, state, ctx);
    const frontDamage = afterBack - victim.health;

    expect(backDamage).toBeGreaterThan(0);
    expect(frontDamage).toBeGreaterThan(0);
    expect(backDamage).toBeGreaterThan(frontDamage);
    expect(backDamage).toBeCloseTo(frontDamage * (1 + COMBAT_CONFIG.BACK_BITE_BONUS), 5);
  });
});
