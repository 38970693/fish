/**
 * 战队系统测试 —— 收编 / 上限 / 跟随 / 主动切换 / 亡语夺舍 / 自己人不打自己人。
 *
 * 对应原始提示词：
 *   #70  被吃掉的鱼加入战队
 *   #234 主动切换（灵魂附身，原身体变小弟）+ 亡语机制
 *   #245 夺舍优先选半径最大的成员
 *   #254 自动挂机不追自己战队的人
 *   #294 没有成员可夺舍时才干净切结算
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { processCollision } from '../systems/combat';
import { progressionSystem } from '../systems/progression';
import {
  recruitToSquad,
  getSquadMembers,
  squadSystem,
  switchToNextMember,
  tryPossessOnDeath,
  possessMember,
  __resetSwitchCursor,
} from '../systems/squad';
import { SQUAD_CONFIG, PROTECTION_CONFIG } from '../data/world';
import { CreatureType } from '../data/creatures';
import { GameStatus, type FrameContext, type GameEvents, type GameState } from '../types';

const makeCtx = (input: Partial<FrameContext['input']> = {}): FrameContext => ({
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false, ...input },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const makePlayingState = (): GameState => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  return state;
};

/** 造一个已经入队的成员实体 */
const addMember = (state: GameState, type: string, x: number, y: number) => {
  const m = createEntity(type, x, y);
  m.ownerId = 'player';
  m.semiGhostTimer = 0;
  state.entities.push(m);
  return m;
};

/** 造成员用的俘虏数据（模拟刚被吃掉的那条鱼） */
const makeRecruit = (type: string, x = 0, y = 0) => {
  const e = createEntity(type, x, y);
  return e;
};

beforeEach(() => {
  __resetSwitchCursor();
});

/* ══════════════ 收编（#70） ══════════════ */

describe('战队 · 收编', () => {
  it('被玩家吃掉的小鱼会进入待入队队列', () => {
    const state = makePlayingState();
    const prey = makeRecruit(CreatureType.CLOWN_FISH, 100, 100);

    recruitToSquad(state, prey);

    expect(state.squad.pending).toHaveLength(1);
    expect(state.squad.pending[0].type).toBe(prey.type);
  });

  it('浮游生物（饲料）不进战队', () => {
    const state = makePlayingState();
    const food = makeRecruit(CreatureType.PLANKTON, 100, 100);

    recruitToSquad(state, food);

    expect(state.squad.pending).toHaveLength(0);
  });

  it('squadSystem 把队列落地成实体，并标记 ownerId', () => {
    const state = makePlayingState();
    recruitToSquad(state, makeRecruit(CreatureType.CLOWN_FISH, 300, 300));

    squadSystem(state, makeCtx());

    const members = getSquadMembers(state);
    expect(members).toHaveLength(1);
    expect(members[0].ownerId).toBe('player');
    expect(state.squad.pending).toHaveLength(0);
    expect(state.squad.recruitedTotal).toBe(1);
    expect(state.squad.notice?.text).toContain('加入战队');
    expect(state.squad.notice?.text).toContain('1/');
  });

  it('V2 形态随身体收编并复制，后续修改俘虏不会污染队员', () => {
    const state = makePlayingState();
    const prey = makeRecruit(CreatureType.CLOWN_FISH, 300, 300);
    prey.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed: 88, genes: { bodyLength: 0.8 } };
    recruitToSquad(state, prey);
    squadSystem(state, makeCtx());
    const member = getSquadMembers(state)[0];
    expect(member.appearanceV2).toEqual(prey.appearanceV2);
    expect(member.appearanceV2).not.toBe(prey.appearanceV2);
  });

  it(`收编人数不超过上限 ${SQUAD_CONFIG.MAX_SIZE}`, () => {
    const state = makePlayingState();

    // 一次灌 20 个，远超上限
    for (let i = 0; i < 20; i += 1) {
      recruitToSquad(state, makeRecruit(CreatureType.CLOWN_FISH, i * 10, 0));
    }
    squadSystem(state, makeCtx());

    expect(getSquadMembers(state).length).toBeLessThanOrEqual(SQUAD_CONFIG.MAX_SIZE);
  });

  it('已满员时新俘虏不再入队', () => {
    const state = makePlayingState();
    for (let i = 0; i < SQUAD_CONFIG.MAX_SIZE; i += 1) {
      recruitToSquad(state, makeRecruit(CreatureType.CLOWN_FISH, i * 10, 0));
    }
    squadSystem(state, makeCtx());
    expect(getSquadMembers(state)).toHaveLength(SQUAD_CONFIG.MAX_SIZE);

    recruitToSquad(state, makeRecruit(CreatureType.CLOWN_FISH, 999, 999));

    expect(state.squad.pending).toHaveLength(0);
    expect(getSquadMembers(state)).toHaveLength(SQUAD_CONFIG.MAX_SIZE);
  });
});

/* ══════════════ 自己人不打自己人（#254） ══════════════ */

describe('战队 · 不内斗', () => {
  it('玩家吃不到自己的队员', () => {
    const state = makePlayingState();
    const ctx = makeCtx();
    const member = addMember(state, CreatureType.CLOWN_FISH, state.player.x, state.player.y);
    // 把队员血量压低，确保「能吃掉」的条件都满足，只可能是友军判定拦下的
    member.health = member.maxHealth * 0.1;
    const hp = member.health;

    processCollision(state.player, member, state, ctx);
    processCollision(member, state.player, state, ctx);

    expect(member.health).toBe(hp);
    expect(state.player.health).toBe(state.player.maxHealth);
  });

  it('队员之间也互不攻击', () => {
    const state = makePlayingState();
    const ctx = makeCtx();
    const a = addMember(state, CreatureType.CLOWN_FISH, 100, 100);
    const b = addMember(state, CreatureType.SWORD_FISH, 110, 100);
    a.health = a.maxHealth * 0.1;
    const aHp = a.health;

    processCollision(b, a, state, ctx);

    expect(a.health).toBe(aHp);
  });

  it('队员仍然会被野怪咬（小弟不是无敌的）', () => {
    const state = makePlayingState();
    const ctx = makeCtx();
    const member = addMember(state, CreatureType.CLOWN_FISH, 100, 100);
    const shark = createEntity(CreatureType.GREAT_WHITE, 105, 100);
    shark.semiGhostTimer = 0;
    // ⚠️ createEntity 给的是随机朝向，不摆正的话「正面咬」判定永远不成立，
    //    会误判成「野怪咬不到队员」
    shark.angle = Math.atan2(member.y - shark.y, member.x - shark.x);
    state.entities.push(shark);
    const hp = member.health;

    // 反复判定，绕过概率
    for (let i = 0; i < 40 && member.health === hp; i += 1) {
      shark.biteCooldown = 0;
      shark.angle = Math.atan2(member.y - shark.y, member.x - shark.x);
      processCollision(shark, member, state, ctx);
    }

    expect(member.health).toBeLessThan(hp);
  });
});

/* ══════════════ 跟随 ══════════════ */

describe('战队 · 跟随', () => {
  it('掉队太远的成员会向玩家靠拢', () => {
    const state = makePlayingState();
    const far = addMember(state, CreatureType.CLOWN_FISH, state.player.x + 1500, state.player.y);
    const before = Math.abs(far.x - state.player.x);

    for (let i = 0; i < 30; i += 1) {
      state.time += 1;
      squadSystem(state, makeCtx());
    }

    expect(Math.abs(far.x - state.player.x)).toBeLessThan(before);
  });

  it('已到位的成员不会来回抖（死区内不追）', () => {
    const state = makePlayingState();
    // 紧贴玩家站位，远在 FOLLOW_DEADZONE 之内
    const near = addMember(
      state,
      CreatureType.CLOWN_FISH,
      state.player.x + state.player.radius + 40,
      state.player.y
    );
    const x0 = near.x;
    const y0 = near.y;

    for (let i = 0; i < 10; i += 1) {
      state.time += 1;
      squadSystem(state, makeCtx());
    }

    expect(Math.abs(near.x - x0)).toBeLessThan(1);
    expect(Math.abs(near.y - y0)).toBeLessThan(1);
  });
});

/* ══════════════ 主动切换（#234） ══════════════ */

describe('战队 · 主动切换（灵魂附身）', () => {
  it('没有队员时切换失败（调用方拿 false 不做处理）', () => {
    const state = makePlayingState();
    expect(switchToNextMember(state)).toBe(false);
  });

  it('切换后玩家接管队员的身体，原身体留在队里当小弟', () => {
    const state = makePlayingState();
    const member = addMember(state, CreatureType.GREAT_WHITE, state.player.x + 200, state.player.y);

    const oldType = state.player.type;
    const oldRadius = state.player.radius;
    const memberType = member.type;
    const memberRadius = member.radius;

    expect(switchToNextMember(state)).toBe(true);

    // 玩家换成了队员的身体
    expect(state.player.type).toBe(memberType);
    expect(state.player.radius).toBe(memberRadius);
    // 玩家原来的身体变成了队员
    const members = getSquadMembers(state);
    expect(members.some((m) => m.type === oldType && m.radius === oldRadius)).toBe(true);
    // 人数不变（交换，不是复制）
    expect(members).toHaveLength(1);
  });

  it('主动附身时 V2 形态跟随身体对调', () => {
    const state = makePlayingState();
    state.player.appearanceV2 = { schemaVersion: 2, recipeId: 'STANDARD_FISH', seed: 1 };
    const member = addMember(state, CreatureType.CLOWN_FISH, state.player.x + 200, state.player.y);
    member.appearanceV2 = { schemaVersion: 2, recipeId: 'CLOWN_FISH', seed: 2, parts: { tailFin: 'tail.ribbon' } };
    expect(possessMember(state, member.id)).toBe(true);
    expect(state.player.appearanceV2?.seed).toBe(2);
    expect(getSquadMembers(state)[0].appearanceV2?.seed).toBe(1);
  });

  it('位置真正对调：玩家飞到小弟身上，旧身体留在原地', () => {
    const state = makePlayingState();
    const px = state.player.x;
    const py = state.player.y;
    const member = addMember(state, CreatureType.SWORD_FISH, px + 400, py + 250);
    const mx = member.x;
    const my = member.y;

    switchToNextMember(state);

    // 玩家到了小弟原来的位置
    expect(state.player.x).toBeCloseTo(mx, 5);
    expect(state.player.y).toBeCloseTo(my, 5);
    // 旧身体（现为成员）留在玩家原来的位置 —— 曾经的 bug 是反过来的，
    // 小弟被拽到玩家身上，两个虚线环叠在一起
    const oldBody = getSquadMembers(state)[0];
    expect(oldBody.x).toBeCloseTo(px, 5);
    expect(oldBody.y).toBeCloseTo(py, 5);
  });

  it('切换保留灵魂层面的进度（体重 / 分数 / 等级不因换身体而清零）', () => {
    const state = makePlayingState();
    state.player.weight = 123;
    state.score = 456;
    state.player.level = 9;
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 100, state.player.y);

    switchToNextMember(state);

    expect(state.player.weight).toBe(123);
    expect(state.score).toBe(456);
    // ⚠️ level 必须跟着灵魂走：它由吃鱼推进，又用来解锁流派技能
    //    （skills.ts：Lv3 第 1 个、Lv6 第 2 个…）。附身 t1 小鱼不能让 Lv 掉到 1，
    //    否则 getSchoolSkill 的 index 算成 -1，已解锁的 Q 技能当场消失。
    expect(state.player.level).toBe(9);
  });

  it('附身很小的小弟也不会把等级拉低（技能不会被锁回去）', () => {
    const state = makePlayingState();
    state.player.level = 9;
    // 一条 t1 的小鱼，等级只有 1
    const small = addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    small.level = 1;
    const smallRadius = small.radius; // 必须在交换前记下来：交换后 small 就变成玩家的旧身体了

    switchToNextMember(state);

    expect(state.player.level).toBe(9);
    // 玩家的身体换成了小鱼（体型确实变小），但灵魂进度没丢
    expect(state.player.radius).toBe(smallRadius);
  });

  it('有冷却时会拦住连点', () => {
    const state = makePlayingState();
    const a = addMember(state, CreatureType.CLOWN_FISH, state.player.x + 100, state.player.y);
    addMember(state, CreatureType.SWORD_FISH, state.player.x - 100, state.player.y);

    expect(switchToNextMember(state)).toBe(true);
    expect(state.squad.switchCooldown).toBeGreaterThan(0);

    const typeAfterFirst = state.player.type;
    expect(switchToNextMember(state)).toBe(false);
    expect(state.player.type).toBe(typeAfterFirst);
    expect(a.ownerId).toBe('player');
  });

  it('只有正常游玩中才能切：进化 / 结算 / 商场等遮罩态下按 R 无效', () => {
    const state = makePlayingState();
    // 队员刻意用与玩家（默认小丑鱼）不同的种类，才能验证「切成功后身体真的变了」
    addMember(state, CreatureType.SWORD_FISH, state.player.x + 100, state.player.y);
    const before = state.player.type;

    // 这些状态下世界是暂停的，keydown 挂在 window 上仍会触发 —— 必须靠 status 门闸挡住，
    // 否则玩家能在弹窗背后偷偷换身体（还白嫖一次位置对调）。
    for (const st of [
      GameStatus.EVOLVING,
      GameStatus.GAME_OVER,
      GameStatus.VICTORY,
      GameStatus.SHOP,
      GameStatus.MENU,
    ]) {
      state.squad.switchCooldown = 0; // 排除冷却干扰，专测 status 门闸
      state.status = st;
      expect(switchToNextMember(state)).toBe(false);
      expect(state.player.type).toBe(before);
    }

    // 回到 PLAYING 立刻就能切
    state.status = GameStatus.PLAYING;
    expect(switchToNextMember(state)).toBe(true);
    expect(state.player.type).not.toBe(before);
  });
});

/* ══════════════ 亡语机制（#234 / #245 / #294） ══════════════ */

describe('战队 · 亡语夺舍', () => {
  it('本体死亡时夺舍，游戏继续（不切结算）', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 100, state.player.y);
    state.player.health = 0;

    progressionSystem(state, makeCtx());

    expect(state.status).toBe(GameStatus.PLAYING);
    expect(state.player.health).toBe(state.player.maxHealth);
  });

  it('夺舍优先选「半径最大」的成员（#245）', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 100, state.player.y);
    const biggest = addMember(state, CreatureType.GREAT_WHITE, state.player.x - 100, state.player.y);
    addMember(state, CreatureType.SWORD_FISH, state.player.x, state.player.y + 100);
    state.player.health = 0;

    progressionSystem(state, makeCtx());

    expect(state.player.type).toBe(biggest.type);
    expect(state.player.radius).toBe(biggest.radius);
  });

  it('夺舍后给保护帧，防止落地即被守尸', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 100, state.player.y);
    state.player.health = 0;

    progressionSystem(state, makeCtx());

    expect(state.player.invulnerableTimer).toBe(SQUAD_CONFIG.POSSESS_PROTECTION);
    expect(state.player.invulnerableTimer).toBeLessThanOrEqual(PROTECTION_CONFIG.REVIVE_DURATION * 2);
  });

  it('队里没人时干净切到结算（#294）', () => {
    const state = makePlayingState();
    state.player.health = 0;

    expect(tryPossessOnDeath(state)).toBe(false);
    progressionSystem(state, makeCtx());

    expect(state.status).toBe(GameStatus.GAME_OVER);
  });

  it('夺舍会消耗掉那个成员（不是复制一个出来）', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.SWORD_FISH, state.player.x + 100, state.player.y);
    const before = getSquadMembers(state).length;
    state.player.health = 0;

    progressionSystem(state, makeCtx());

    expect(getSquadMembers(state)).toHaveLength(before - 1);
    expect(state.squad.possessCount).toBe(1);
  });

  it('possessMember 对不存在的成员返回 false', () => {
    const state = makePlayingState();
    expect(possessMember(state, 'no-such-id')).toBe(false);
  });
});
