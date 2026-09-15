/**
 * 核心系统测试 —— 重构前项目里没有任何一个测试真正覆盖游戏逻辑
 * （evolution / building / biome 三个测试文件只 import 了常量）。
 * 这里补齐最关键的一层：数据自检、实体工厂、技能、战斗判定、容错、整帧冒烟。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '../core/EventBus';
import { safe } from '../core/errors';
import { CREATURES, CREATURE_DATA, CreatureType, SPAWN_POOL_BY_TIER, validateCreatures } from '../data/creatures';
import { SKILL_DATA } from '../data/skills';
import { BiomeType } from '../data/biomes';
import { createEntity } from '../systems/spawn';
import { SKILL_HANDLERS, validateSkills } from '../systems/skills';
import { processCollision } from '../systems/combat';
import { getBiome } from '../systems/terrain';
import { updateGame } from '../gameEngine';
import { createInitialState } from '../factories/initialState';
import { COMBAT_CONFIG } from '../data/world';
import { GameStatus, type FrameContext, type GameEvents, type GameState } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 640, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ══════════════ 数据层 ══════════════ */

describe('数据自检', () => {
  it('所有生物配置都合法（缺字段会在这里暴露，而不是等玩家发现）', () => {
    expect(validateCreatures(Object.keys(SKILL_DATA))).toEqual([]);
  });

  it('所有声明的技能都有实现（魔鬼鱼「毒刺」曾在这里静默失效）', () => {
    expect(validateSkills()).toEqual([]);
  });

  it('每种生物都能造出合法实体', () => {
    for (const type of Object.keys(CREATURE_DATA)) {
      const e = createEntity(type, 3000, 3000);
      expect(e.config.name).toBeTruthy();
      expect(Number.isFinite(e.radius) && e.radius > 0).toBe(true);
      expect(Number.isFinite(e.speed) && e.speed > 0).toBe(true);
      expect(e.health).toBeGreaterThan(0);
    }
  });

  it('未知生物类型回退到小丑鱼，不返回 undefined', () => {
    const e = createEntity('根本不存在的鱼', 0, 0);
    expect(e.type).toBe(CreatureType.CLOWN_FISH);
  });

  it('新加的鱼会自动进入对应 tier 的刷怪池', () => {
    const tier1 = SPAWN_POOL_BY_TIER[1] ?? [];
    expect(tier1).toContain(CreatureType.CLOWN_FISH);
    // 吉祥物不参与随机生成
    const allPools = Object.values(SPAWN_POOL_BY_TIER).flat();
    expect(allPools).not.toContain(CreatureType.MASCOT);
  });

  it('速度按基准值换算（spec 里写的是倍率）', () => {
    const clown = CREATURES[CreatureType.CLOWN_FISH];
    expect(clown.speed).toBeCloseTo(1.1 * 1.5, 5);
  });
});

/* ══════════════ 技能 ══════════════ */

describe('技能系统', () => {
  it('每个技能都能执行且不抛异常', () => {
    const state = createInitialState({ skipWorldGen: true });
    for (const id of Object.keys(SKILL_HANDLERS)) {
      expect(() => SKILL_HANDLERS[id as keyof typeof SKILL_HANDLERS](state.player, state, 1)).not.toThrow();
    }
  });

  it('逃跑 / 缩壳这类状态技能会真正改状态', () => {
    const state = createInitialState({ skipWorldGen: true });
    SKILL_HANDLERS.DASH(state.player, state, 1);
    expect(state.player.speedBoostTimer).toBeGreaterThan(0);

    SKILL_HANDLERS.SHELL(state.player, state, 1);
    expect(state.player.shieldTimer).toBeGreaterThan(0);
  });
});

/* ══════════════ 战斗 ══════════════ */

describe('战斗判定', () => {
  const makePair = (attackerType: string, victimType: string) => {
    const state = createInitialState({ skipWorldGen: true });
    state.status = GameStatus.PLAYING;
    const attacker = createEntity(attackerType, 3000, 3000);
    const victim = createEntity(victimType, 3000 + attacker.radius, 3000);
    attacker.angle = 0; // 正对 victim
    victim.angle = 0;
    // 关掉半虚保护，否则刚生成的鱼互相吃不了
    attacker.semiGhostTimer = 0;
    victim.semiGhostTimer = 0;
    state.entities.push(attacker, victim);
    return { state, attacker, victim, ctx: makeCtx() };
  };

  it('体型碾压时判定成功就把对方吃掉', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 必定命中概率判定
    const { state, victim, ctx } = makePair(CreatureType.ORCA, CreatureType.PLANKTON);
    processCollision(state.entities[0], victim, state, ctx);
    expect(victim.health).toBe(0);
  });

  it('等级门闸：同等级及以下可以击杀（同级残血的鱼照样咬死）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { state, attacker, victim, ctx } = makePair(
      CreatureType.CLOWN_FISH,
      CreatureType.BLUE_TANG
    );
    expect(attacker.level).toBe(victim.level); // 前提：都是 tier1 → Lv2
    victim.health = 1; // 打到残血
    processCollision(attacker, victim, state, ctx);
    expect(victim.health).toBe(0);
  });

  it('等级门闸：等级高于自己的鱼杀不死，血量保底 1 点', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { state, attacker, victim, ctx } = makePair(CreatureType.CLOWN_FISH, CreatureType.ORCA);
    expect(victim.level).toBeGreaterThan(attacker.level); // 前提：小丑鱼 Lv2 越级咬虎鲸 Lv5
    victim.health = 1; // 残血 BOSS，这一口本该带走 —— 但等级不够
    processCollision(attacker, victim, state, ctx);
    expect(victim.health).toBe(1); // 留了活口：伤害照算，致死被拦
  });

  it('绕到猎物尾部撕咬按背刺加成记（FQ-04 语义：看的是**猎物的尾巴**）', () => {
    // makePair 里猎物朝 +x、攻击者站在它 -x 侧 —— 正好在猎物尾部，天然构成背刺。
    // （旧实现判的是「猎物在攻击者身后」，方向恰好相反；改语义的完整用例见 fq04-combat.test.ts）
    const backPair = makePair(CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG);
    const backBefore = backPair.victim.health;
    processCollision(backPair.attacker, backPair.victim, backPair.state, backPair.ctx);
    const backDamage = backBefore - backPair.victim.health;

    // 对照：让猎物转身面对攻击者 → 攻击者不再位于它的尾部，同一口只剩正面伤害
    const frontPair = makePair(CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG);
    frontPair.victim.angle = Math.PI;
    const frontBefore = frontPair.victim.health;
    processCollision(frontPair.attacker, frontPair.victim, frontPair.state, frontPair.ctx);
    const frontDamage = frontBefore - frontPair.victim.health;

    expect(backDamage).toBeGreaterThan(0);
    expect(frontDamage).toBeGreaterThan(0);
    expect(backDamage).toBeCloseTo(frontDamage * (1 + COMBAT_CONFIG.BACK_BITE_BONUS), 5);
  });

  it('刚生成的鱼受半虚保护，既不能吃也不会被吃', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { state, attacker, victim, ctx } = makePair(CreatureType.ORCA, CreatureType.PLANKTON);
    victim.semiGhostTimer = 100;
    processCollision(attacker, victim, state, ctx);
    expect(victim.health).toBeGreaterThan(0);
  });

  it('吉祥物不参与战斗', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { state, ctx } = makePair(CreatureType.ORCA, CreatureType.MASCOT);
    const mascot = state.entities[1];
    processCollision(state.entities[0], mascot, state, ctx);
    expect(mascot.health).toBeGreaterThan(0);
  });
});

/* ══════════════ 地形 ══════════════ */

describe('地形与生态区', () => {
  it('四个象限各对应一个生态区', () => {
    expect(getBiome(1000, 1000)).toBe(BiomeType.SHALLOWS);
    expect(getBiome(5000, 1000)).toBe(BiomeType.REEF);
    expect(getBiome(1000, 5000)).toBe(BiomeType.SWAMP);
    expect(getBiome(5000, 5000)).toBe(BiomeType.ABYSS);
  });
});

/* ══════════════ 容错 ══════════════ */

describe('容错机制', () => {
  it('某个系统抛异常不会带走整个游戏循环', () => {
    const broken = safe('故意崩溃', () => {
      throw new Error('boom');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => broken()).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  it('连续失败达到阈值后自动摘除该系统', () => {
    let calls = 0;
    const broken = safe('总是崩', () => {
      calls += 1;
      throw new Error('boom');
    }, { maxFailures: 2 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    broken();
    broken();
    const callsAfterDisable = calls;
    broken();

    expect(callsAfterDisable).toBe(2);
    expect(calls).toBe(2); // 第三次直接跳过，函数体没被执行
  });
});

/* ══════════════ 整帧冒烟 ══════════════ */

describe('整帧冒烟', () => {
  it('连续跑 300 帧不崩溃，且玩家坐标始终有效', () => {
    const state: GameState = createInitialState();
    state.status = GameStatus.PLAYING;

    for (let i = 0; i < 300; i += 1) {
      updateGame(state, { x: 640, y: 360 }, i % 3 === 0, i % 5 === 0, i % 7 === 0, 1280, 720);
      expect(Number.isFinite(state.player.x)).toBe(true);
      expect(Number.isFinite(state.player.y)).toBe(true);

      // ⚠️ 这个断言以前是随机的：约 1/6 概率挂在 `expected 272 to be 300` 之类的数字上。
      //    两个原因都会让世界暂停（都是设计行为，不是 bug）：
      //      1) 玩家起始 evolutionPoints=15，tier-2 阈值 30 —— 吃几条鱼就触发 EVOLVING
      //      2) createInitialState **不发放新手保护**（那是 App 点开始游戏时才加的），
      //         所以这里的玩家真的会被吃掉 → GAME_OVER
      //    冒烟测试只关心「连跑 300 帧不崩 + 坐标始终有效」，所以把暂停的状态放行回去。
      //    注意要用断言写法绕开 TS 的控制流收窄（否则 status 已被窄化成 PLAYING）。
      if ((state.status as GameStatus) !== GameStatus.PLAYING) {
        state.status = GameStatus.PLAYING;
      }
      if (state.player.health <= 0) state.player.health = state.player.maxHealth;
    }

    expect(state.time).toBe(300);
  });

  it('菜单状态下世界不推进', () => {
    const state = createInitialState({ skipWorldGen: true });
    updateGame(state, { x: 0, y: 0 }, false, false, false, 1280, 720);
    expect(state.time).toBe(0);
  });
});
