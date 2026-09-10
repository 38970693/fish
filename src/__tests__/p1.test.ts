/**
 * P1 功能测试：撕咬战斗 / 大鱼反制 / 四大流派 / 音效系统。
 * 对应 开发路线图.md 的 P1 清单。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '../core/EventBus';
import { processCollision, dealDamage } from '../systems/combat';
import { skillsSystem, getSchoolSkill, SKILL_HANDLERS, validateSkills } from '../systems/skills';
import { aiSystem } from '../systems/ai';
import { createEntity } from '../systems/spawn';
import { createInitialState } from '../factories/initialState';
import { COMBAT_CONFIG } from '../data/world';
import { SCHOOL_DATA, SCHOOL_SKILL_COOLDOWN } from '../data/schools';
import { SKILL_DATA } from '../data/skills';
import { CreatureType } from '../data/creatures';
import { GameStatus, type FrameContext, type GameEvents, type Entity } from '../types';
import { playSfx, subscribeAudio, setMuted, isMuted } from '../audio';
import { gameEvents } from '../gameEngine';

const makeCtx = (over: Partial<FrameContext['input']> = {}): FrameContext => ({
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false, ...over },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const makePlayingState = () => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  return state;
};

/** 造一对贴身站好、朝向正确的对手，保证进入撕咬判定而不是被距离/角度挡下 */
const makePair = (
  attackerType: CreatureType,
  victimType: CreatureType
): { attacker: Entity; victim: Entity } => {
  const attacker = createEntity(attackerType, 3000, 3000);
  const victim = createEntity(victimType, 3020, 3000); // 20px，远小于双方半径和
  attacker.semiGhostTimer = 0;
  victim.semiGhostTimer = 0;
  attacker.invulnerableTimer = 0;
  victim.invulnerableTimer = 0;
  attacker.angle = 0; // 正对 +x，也就是正对猎物
  return { attacker, victim };
};

afterEach(() => {
  vi.restoreAllMocks();
});

/* ══════════════ P1-1 撕咬战斗 ══════════════ */

describe('P1-1 撕咬取代一击必杀', () => {
  it('咬一口只掉血，不会直接归零', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 判定必定命中
    const state = makePlayingState();
    const ctx = makeCtx();
    const { attacker, victim } = makePair(CreatureType.GREAT_WHITE, CreatureType.ORCA);

    processCollision(attacker, victim, state, ctx);

    expect(victim.health).toBeLessThan(victim.maxHealth);
    expect(victim.health).toBeGreaterThan(0);
  });

  it('咬完进入撕咬冷却，冷却中不再扣血', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makePlayingState();
    const ctx = makeCtx();
    const { attacker, victim } = makePair(CreatureType.GREAT_WHITE, CreatureType.ORCA);

    processCollision(attacker, victim, state, ctx);
    const afterFirst = victim.health;
    expect(attacker.biteCooldown).toBe(COMBAT_CONFIG.BITE_COOLDOWN);

    processCollision(attacker, victim, state, ctx);
    expect(victim.health).toBe(afterFirst);
  });

  it('被咬后进入愤怒状态', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makePlayingState();
    const ctx = makeCtx();
    const { attacker, victim } = makePair(CreatureType.GREAT_WHITE, CreatureType.ORCA);

    processCollision(attacker, victim, state, ctx);
    expect(victim.angerTimer).toBe(COMBAT_CONFIG.ANGER_DURATION);
  });

  it('小鱼也能把大鱼活活咬死（逆转路径没有被砍掉）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makePlayingState();
    const ctx = makeCtx();
    const { attacker, victim } = makePair(CreatureType.CLOWN_FISH, CreatureType.ORCA);

    // 小鱼扛不住大鱼的「猛回头」，测试只关注「能不能咬死」，所以给它续上命
    attacker.maxHealth = 100000;
    attacker.health = 100000;

    let bites = 0;
    for (let i = 0; i < 3000; i += 1) {
      if (victim.health <= 0) break;
      attacker.biteCooldown = 0;
      processCollision(attacker, victim, state, ctx);
      bites += 1;
    }

    expect(bites).toBeLessThan(3000);
    expect(victim.health).toBeLessThanOrEqual(0);
  });
});

/* ══════════════ P1-2 大鱼反制 ══════════════ */

describe('P1-2 大鱼反制', () => {
  it('被比自己小的鱼咬到，会猛回头反击', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makePlayingState();
    const ctx = makeCtx();
    const { attacker, victim } = makePair(CreatureType.GREAT_WHITE, CreatureType.ORCA);

    const before = attacker.health;
    processCollision(attacker, victim, state, ctx);

    // 虎鲸比大白鲨大 → 反击成立
    expect(attacker.health).toBeLessThan(before);
  });

  it('被比自己大的鱼咬，不存在反击', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makePlayingState();
    const ctx = makeCtx();
    const { attacker, victim } = makePair(CreatureType.ORCA, CreatureType.GREAT_WHITE);

    const before = attacker.health;
    processCollision(attacker, victim, state, ctx);

    expect(attacker.health).toBe(before);
  });

  it('愤怒中的大鱼会放反制技能（AI 自动触发）', () => {
    const state = makePlayingState();
    const ctx = makeCtx();

    const bigFish = createEntity(CreatureType.ORCA, 3000, 3000);
    const smallFish = createEntity(CreatureType.CLOWN_FISH, 3100, 3000);
    bigFish.semiGhostTimer = 0;
    smallFish.semiGhostTimer = 0;
    bigFish.angerTimer = 120;
    state.entities.push(bigFish, smallFish);
    // 玩家放在旁边（AI 只处理 2600px 内的鱼），且体型小于 bigFish 才会触发反制
    state.player.x = 2900;
    state.player.y = 3000;

    const before = smallFish.health;
    aiSystem(state, ctx);

    // 尾浪震荡会打到周围的小鱼
    expect(smallFish.health).toBeLessThan(before);
    expect(bigFish.schoolSkillCooldown).toBeGreaterThan(0);
  });
});

/* ══════════════ 伤害结算：无敌 / 护盾 / 易伤 ══════════════ */

describe('伤害结算统一走 dealDamage', () => {
  const dummy = (): Entity => {
    const e = createEntity(CreatureType.SQUID, 0, 0);
    e.invulnerableTimer = 0;
    e.shieldTimer = 0;
    e.vulnerableTimer = 0;
    return e;
  };

  it('无敌帧期间伤害为 0', () => {
    const e = dummy();
    e.invulnerableTimer = 30;
    expect(dealDamage(e, 100)).toBe(0);
    expect(e.health).toBe(e.maxHealth);
  });

  it('易伤标记让伤害翻倍', () => {
    const plain = dummy();
    const marked = dummy();
    marked.vulnerableTimer = 300;

    const d1 = dealDamage(plain, 20);
    const d2 = dealDamage(marked, 20);

    expect(d2).toBeCloseTo(d1 * COMBAT_CONFIG.VULNERABLE_DAMAGE_MULT, 5);
  });

  it('护盾吸收大部分伤害', () => {
    const plain = dummy();
    const shielded = dummy();
    shielded.shieldTimer = 120;

    const d1 = dealDamage(plain, 20);
    const d2 = dealDamage(shielded, 20);

    expect(d2).toBeLessThan(d1);
    expect(d2).toBeCloseTo(d1 * (1 - COMBAT_CONFIG.SHIELD_ABSORB_RATIO), 5);
  });
});

/* ══════════════ P1-3 四大流派 ══════════════ */

describe('P1-3 四大战斗流派', () => {
  it('流派数据完整：4 派 × 4 技能', () => {
    const ids = Object.keys(SCHOOL_DATA);
    expect(ids).toHaveLength(4);
    for (const id of ids) {
      const school = SCHOOL_DATA[id as keyof typeof SCHOOL_DATA];
      expect(school.skills).toHaveLength(4);
      expect(school.name).toBeTruthy();
    }
  });

  it('每个流派技能都有名字和实现（不会按了没反应）', () => {
    for (const id of Object.keys(SCHOOL_DATA)) {
      const school = SCHOOL_DATA[id as keyof typeof SCHOOL_DATA];
      for (const skill of school.skills) {
        expect(SKILL_DATA[skill as keyof typeof SKILL_DATA], `${skill} 缺数据`).toBeTruthy();
        expect(typeof SKILL_HANDLERS[skill as keyof typeof SKILL_HANDLERS], `${skill} 缺实现`).toBe(
          'function'
        );
      }
    }
    // 启动自检不应该报任何问题
    expect(validateSkills()).toEqual([]);
  });

  it('流派技能按等级逐档解锁', () => {
    const state = makePlayingState();
    const player = state.player;

    expect(player.config.school).toBe('MOBILITY'); // 小丑鱼属于机动流

    player.level = 2;
    expect(getSchoolSkill(player)).toBeUndefined();

    player.level = 3;
    expect(getSchoolSkill(player)).toBe(SCHOOL_DATA.MOBILITY.skills[0]);

    player.level = 6;
    expect(getSchoolSkill(player)).toBe(SCHOOL_DATA.MOBILITY.skills[1]);

    player.level = 99;
    expect(getSchoolSkill(player)).toBe(SCHOOL_DATA.MOBILITY.skills[3]);
  });

  it('Q 键释放流派技能并进入冷却', () => {
    const state = makePlayingState();
    const player = state.player;
    player.level = 3;
    player.schoolSkillCooldown = 0;
    player.speedBoostTimer = 0;

    skillsSystem(state, makeCtx({ q: true }));

    // 机动流第一档是激流滑行 → 提速
    expect(player.schoolSkillId).toBe(SCHOOL_DATA.MOBILITY.skills[0]);
    expect(player.speedBoostTimer).toBeGreaterThan(0);
    expect(player.schoolSkillCooldown).toBe(SCHOOL_SKILL_COOLDOWN);
  });

  it('冷却期间按 Q 不会重复触发', () => {
    const state = makePlayingState();
    const player = state.player;
    player.level = 3;
    player.schoolSkillCooldown = 100;
    player.speedBoostTimer = 0;

    skillsSystem(state, makeCtx({ q: true }));
    expect(player.speedBoostTimer).toBe(0);
  });
});

/* ══════════════ P1-4 音效系统 ══════════════ */

describe('P1-4 音效系统', () => {
  it('订阅后发事件不会抛错（无音频设备的环境也安全）', () => {
    subscribeAudio();
    expect(() => {
      gameEvents.emit('eat', {
        attacker: {} as Entity,
        victim: {} as Entity,
        isBackAttack: false,
        x: 0,
        y: 0,
      });
      gameEvents.emit('hurt', { target: {} as Entity, amount: 1 });
    }).not.toThrow();
  });

  it('没有音频上下文时 playSfx 静默失败，不影响玩法', () => {
    expect(() => {
      playSfx('eat');
      playSfx('levelup');
      playSfx('reversal');
    }).not.toThrow();
  });

  it('静音开关可用', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it('音效完全不侵入玩法逻辑：不订阅也能正常跑', () => {
    const state = makePlayingState();
    const ctx = makeCtx();
    expect(() => aiSystem(state, ctx)).not.toThrow();
  });
});
