/**
 * FQ-06 三个核心队员角色（《鱼群争霸开发计划》§6.1）。
 *
 * 钉住四件事：
 *   ① **角色按物种占核心位**，上限 3，每种角色只有一个位；核心位是有限资源。
 *   ② **角色自带弱点**真的落到身体上（电鳗血薄 / 剑鱼输出低 / 河豚速度慢），
 *      而且不会污染 `data/creatures.ts` 的共享配置。
 *   ③ **只有核心成员能放专属能力** —— 普通成员在同样布局下必须毫无反应
 *      （十条队员同时放控制 = 计划 §12 的头号风险）。
 *   ④ **核心身份与冷却属于身体**，附身时**对调不清零**（连续换身刷不了技能）。
 *
 * ── 沿用 FQ-05 的两条测量纪律 ──
 *   · 移动类用例显式钉 `speed`（默认走物种速度，太慢）
 *   · 移动类用例不推进 `state.time`（队形角带 `state.time * 0.01` 自转项，推时间落点就成环带）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import {
  squadSystem,
  issueCommand,
  possessMember,
  recruitToSquad,
  getCoreMembers,
  __resetSwitchCursor,
} from '../systems/squad';
import { SQUAD_ROLE, SQUAD_ROLE_CONFIG, SQUAD_ROLES } from '../data/squadRoles';
import { CREATURES, CreatureType } from '../data/creatures';
import { GameStatus, type FrameContext, type GameEvents, type GameState, type Entity } from '../types';

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

/**
 * 直接造一个已入队成员（不走收编，用于验证能力与移动）。
 *
 * ⚠️ 朝向必须钉住：`createEntity` 给的是 `Math.random() * 2π` 的随机朝向，
 *    而 `turnToward(..., 0.15)` 掉头要二十来帧 —— 在 60 帧的测速窗口里，
 *    「初始朝向随机」带来的位移差（实测能把 15% 的速度差完全淹没，甚至反向）
 *    远大于我们要测的那点倍率。用例会把成员统一放在玩家的 +x 侧，
 *    所以固定朝 -x（Math.PI）径直跑，位移就只由速度决定。
 */
const addMember = (state: GameState, type: CreatureType, x: number, y: number, speed = 4): Entity => {
  const m = createEntity(type, x, y);
  m.ownerId = 'player';
  m.semiGhostTimer = 0;
  m.speed = speed;
  m.angle = Math.PI;
  state.entities.push(m);
  return m;
};

const addEnemy = (state: GameState, type: CreatureType, x: number, y: number): Entity => {
  const e = createEntity(type, x, y);
  e.semiGhostTimer = 0;
  state.entities.push(e);
  return e;
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const runFrames = (state: GameState, n: number): void => {
  for (let i = 0; i < n; i += 1) squadSystem(state, makeCtx());
};

/**
 * 走**真实收编路径**拿到一个成员（验证 assignCoreRole 是在收编时发生的）。
 *
 * 两个坑，都踩过：
 *  · **俘虏必须先死**。真实链路里 `resolveDeath` 先写 `victim.health = 0`
 *    （combat.ts）才轮到 `settleDevour → recruitToSquad`。留一条活着的俘虏在场上，
 *    新入队的护卫 / 电鳗会把它当成「身边的威胁」，在收编那一帧就把技能放了 ——
 *    于是后面所有能力用例都从「冷却中」开局，全部假失败。
 *  · **要认新成员，不能按物种找**。同种收编第二次时，按 type 找会找回第一条，
 *    用例就变成了「拿 first 断言 second」。这里用「收编前不存在的 id」认人。
 */
const recruit = (state: GameState, type: CreatureType, x: number, y: number): Entity => {
  const victim = createEntity(type, x, y);
  victim.semiGhostTimer = 0;
  state.entities.push(victim);
  const known = new Set(state.entities.map((e) => e.id));

  recruitToSquad(state, victim);
  victim.health = 0; // 已被吃掉：与 combat.ts 的 resolveDeath 顺序保持一致

  squadSystem(state, makeCtx());
  const member = state.entities.find(
    (e) => e.ownerId === 'player' && e.type === type && !known.has(e.id)
  );
  if (!member) throw new Error(`收编失败：${type}`);
  return member;
};

beforeEach(() => {
  __resetSwitchCursor();
});

/* ══════════════ ① 核心位分配 ══════════════ */

describe('FQ-06 · 核心位分配', () => {
  it('三个角色按物种入列：河豚→护卫、电鳗→控制、剑鱼→机动', () => {
    const state = makePlayingState();
    const p = state.player;

    const puffer = recruit(state, CreatureType.PUFFER_FISH, p.x + 60, p.y);
    const eel = recruit(state, CreatureType.ELECTRIC_EEL, p.x + 90, p.y);
    const sword = recruit(state, CreatureType.SWORD_FISH, p.x + 120, p.y);

    expect(puffer.coreRole).toBe(SQUAD_ROLE.GUARD);
    expect(eel.coreRole).toBe(SQUAD_ROLE.CONTROL);
    expect(sword.coreRole).toBe(SQUAD_ROLE.SCOUT);
    expect(getCoreMembers(state)).toHaveLength(3);
  });

  it('普通物种收编不占核心位（只有角色表里的物种才有角色）', () => {
    const state = makePlayingState();
    const p = state.player;
    const clown = recruit(state, CreatureType.CLOWN_FISH, p.x + 60, p.y);

    expect(clown.coreRole).toBeUndefined();
    expect(getCoreMembers(state)).toHaveLength(0);
  });

  it('每种角色只有一个位：第二条河豚只是普通成员', () => {
    const state = makePlayingState();
    const p = state.player;

    const first = recruit(state, CreatureType.PUFFER_FISH, p.x + 60, p.y);
    const second = recruit(state, CreatureType.PUFFER_FISH, p.x + 90, p.y);

    expect(first.coreRole).toBe(SQUAD_ROLE.GUARD);
    expect(second.coreRole).toBeUndefined();
  });

  it('核心位满了就不再分配（上限 CORE_SLOTS）', () => {
    const state = makePlayingState();
    const p = state.player;
    // 先手动占满 3 个核心位（品种随意，只看占位）
    for (let i = 0; i < SQUAD_ROLE_CONFIG.CORE_SLOTS; i += 1) {
      const filler = addMember(state, CreatureType.SQUID, p.x + 60 + i * 30, p.y);
      filler.coreRole = 'SCOUT';
    }
    expect(getCoreMembers(state)).toHaveLength(SQUAD_ROLE_CONFIG.CORE_SLOTS);

    const puffer = recruit(state, CreatureType.PUFFER_FISH, p.x + 200, p.y);
    expect(puffer.coreRole).toBeUndefined();
  });
});

/* ══════════════ ② 弱点落到身体 ══════════════ */

describe('FQ-06 · 角色弱点真的落到身体上', () => {
  it('电鳗血量低（healthMult 0.7）', () => {
    const state = makePlayingState();
    const p = state.player;
    const base = CREATURES[CreatureType.ELECTRIC_EEL].health;

    const eel = recruit(state, CreatureType.ELECTRIC_EEL, p.x + 60, p.y);

    expect(eel.maxHealth).toBe(Math.round(base * SQUAD_ROLES.CONTROL.healthMult));
    expect(eel.maxHealth).toBeLessThan(base);
    expect(eel.health).toBeLessThanOrEqual(eel.maxHealth);
  });

  it('机动鱼正面输出低（damageMult 0.6），且不污染共享物种配置', () => {
    const state = makePlayingState();
    const p = state.player;
    const base = CREATURES[CreatureType.SWORD_FISH].damage;

    const sword = recruit(state, CreatureType.SWORD_FISH, p.x + 60, p.y);

    expect(sword.config.damage).toBeCloseTo(base * SQUAD_ROLES.SCOUT.damageMult, 5);
    // ⚠️ 反污染：改的是**克隆出来的** config，数据表必须原封不动
    expect(CREATURES[CreatureType.SWORD_FISH].damage).toBe(base);
  });

  /**
   * 河豚速度慢（speedMult 0.85）。
   *
   * 这个用例踩过两个坑，改窗口前先看懂它们，否则又会变成「靠运气通过」：
   *  · **别跑满 60 帧**：`FOLLOW_DEADZONE` = 260，成员从 600 出发只能靠近约 215px
   *    就进死区停下了。60 帧里双方**都撞到死区**，比的是「谁过冲多一点」而不是速度，
   *    实测甚至会出现护卫跑得更远的假结果。这里只跑 30 帧（普通成员 150px、护卫 127px，
   *    都没到死区），位移才真正由速度决定。
   *  · 朝向已由 `addMember` 钉死，见那里的注释。
   */
  it('河豚速度慢（speedMult 0.85）—— 同样的距离，护卫跑得比普通成员少', () => {
    const measure = (withRole: boolean): number => {
      const state = makePlayingState();
      const p = state.player;
      // 护卫指令 + 无敌人 → 角色不会改目标点，双方都跑同一个队形槽（index 0）
      const m = addMember(state, CreatureType.PUFFER_FISH, p.x + 600, p.y, 4);
      if (withRole) m.coreRole = SQUAD_ROLE.GUARD;
      const before = dist(m, p);
      runFrames(state, 30);
      return before - dist(m, p);
    };

    const guardMoved = measure(true);
    const plainMoved = measure(false);
    expect(guardMoved).toBeGreaterThan(0);
    // 不只比大小 —— 直接钉住倍率本身：位移比应当就是 speedMult
    expect(guardMoved / plainMoved).toBeCloseTo(SQUAD_ROLES.GUARD.speedMult, 2);
  });
});

/* ══════════════ ③ 专属能力：只有核心成员会放 ══════════════ */

describe('FQ-06 · 河豚护卫：贴上去给盾', () => {
  it('自己人受威胁且贴得上 → 给盾，并进入冷却', () => {
    const state = makePlayingState();
    const p = state.player;
    const guard = recruit(state, CreatureType.PUFFER_FISH, p.x + 100, p.y);
    addEnemy(state, CreatureType.SQUID, p.x + 150, p.y); // 玩家身边的威胁

    squadSystem(state, makeCtx());

    expect(p.shieldTimer).toBe(SQUAD_ROLE_CONFIG.GUARD_SHIELD_FRAMES);
    expect(guard.roleCooldown).toBe(SQUAD_ROLE_CONFIG.GUARD_COOLDOWN);
  });

  it('冷却中不会连发（护盾有冷却，不是无限盾）', () => {
    const state = makePlayingState();
    const p = state.player;
    const guard = recruit(state, CreatureType.PUFFER_FISH, p.x + 100, p.y);
    addEnemy(state, CreatureType.SQUID, p.x + 150, p.y);

    squadSystem(state, makeCtx());
    p.shieldTimer = 0; // 人工清零：若还能再放，这里会被重新填上
    squadSystem(state, makeCtx());

    expect(p.shieldTimer).toBe(0);
    expect(guard.roleCooldown).toBe(SQUAD_ROLE_CONFIG.GUARD_COOLDOWN - 1);
  });

  it('普通成员在同样布局下不会给盾（首版只有核心位能放专属能力）', () => {
    const state = makePlayingState();
    const p = state.player;
    const plain = addMember(state, CreatureType.PUFFER_FISH, p.x + 100, p.y); // 同种鱼，但没角色
    addEnemy(state, CreatureType.SQUID, p.x + 150, p.y);

    squadSystem(state, makeCtx());

    expect(plain.coreRole).toBeUndefined();
    expect(p.shieldTimer).toBe(0);
  });
});

describe('FQ-06 · 电鳗控制：短控制 + 有冷却', () => {
  it('集火目标在范围内就控它', () => {
    const state = makePlayingState();
    const p = state.player;
    recruit(state, CreatureType.ELECTRIC_EEL, p.x + 60, p.y); // 需要队员才能下令
    const target = addEnemy(state, CreatureType.SQUID, p.x + 300, p.y);

    expect(issueCommand(state, 'FOCUS')).toBe(true);
    squadSystem(state, makeCtx());

    expect(target.speedBoostTimer).toBe(-SQUAD_ROLE_CONFIG.CONTROL_SLOW_FRAMES);
  });

  it('没有集火时也控贴近队伍的威胁', () => {
    const state = makePlayingState();
    const p = state.player;
    const eel = recruit(state, CreatureType.ELECTRIC_EEL, p.x + 60, p.y);
    const threat = addEnemy(state, CreatureType.SQUID, p.x + 200, p.y);

    squadSystem(state, makeCtx()); // 缺省指令 = 护卫

    expect(threat.speedBoostTimer).toBe(-SQUAD_ROLE_CONFIG.CONTROL_SLOW_FRAMES);
    expect(eel.roleCooldown).toBe(SQUAD_ROLE_CONFIG.CONTROL_COOLDOWN);
  });

  it('控制是**短**控制：持续帧数远小于冷却帧数（不能无限控死）', () => {
    expect(SQUAD_ROLE_CONFIG.CONTROL_SLOW_FRAMES).toBeLessThan(SQUAD_ROLE_CONFIG.CONTROL_COOLDOWN);
  });
});

/* ══════════════ ④ 机动鱼的移动 ══════════════ */

describe('FQ-06 · 机动鱼：快速接近 / 脱离包围', () => {
  it('集火时比普通成员冲得快', () => {
    const measure = (withRole: boolean): number => {
      const state = makePlayingState();
      const p = state.player;
      const m = addMember(state, CreatureType.SWORD_FISH, p.x + 600, p.y, 4);
      if (withRole) m.coreRole = SQUAD_ROLE.SCOUT;
      const target = addEnemy(state, CreatureType.SQUID, p.x, p.y);
      issueCommand(state, 'FOCUS');
      state.squad.commandTargetId = target.id;

      const before = dist(m, target);
      runFrames(state, 60);
      return before - dist(m, target);
    };

    const scoutMoved = measure(true);
    const plainMoved = measure(false);
    expect(scoutMoved).toBeGreaterThan(plainMoved);
    // 钉住倍率本身：机动鱼的 speedMult × 集火冲锋倍率
    expect(scoutMoved / plainMoved).toBeCloseTo(
      SQUAD_ROLES.SCOUT.speedMult * SQUAD_ROLE_CONFIG.SCOUT_FOCUS_SPEED_MULT,
      2
    );
  });

  it('撤退时绕到**背对敌群**的那一侧（优先脱离包围）', () => {
    const state = makePlayingState();
    const p = state.player;
    const scout = addMember(state, CreatureType.SWORD_FISH, p.x, p.y, 4);
    scout.coreRole = SQUAD_ROLE.SCOUT;
    // 敌群全在玩家右侧
    addEnemy(state, CreatureType.SQUID, p.x + 300, p.y);
    addEnemy(state, CreatureType.SQUID, p.x + 320, p.y + 60);

    issueCommand(state, 'RETREAT');
    runFrames(state, 200);

    expect(scout.x).toBeLessThan(p.x - 100); // 站到玩家的另一侧
  });
});

/* ══════════════ ⑤ 核心身份属于身体 ══════════════ */

describe('FQ-06 · 附身：核心身份与冷却对调，不清零', () => {
  it('附身后玩家接管身体的角色与冷却，旧身体交还队员', () => {
    const state = makePlayingState();
    const p = state.player;
    const guard = addMember(state, CreatureType.PUFFER_FISH, p.x + 80, p.y);
    guard.coreRole = SQUAD_ROLE.GUARD;
    guard.roleCooldown = 300;

    expect(possessMember(state, guard.id)).toBe(true);

    expect(p.coreRole).toBe(SQUAD_ROLE.GUARD);
    expect(p.roleCooldown).toBe(300);
    expect(guard.coreRole).toBeUndefined();
    expect(guard.roleCooldown).toBe(0);
  });

  /**
   * 连续换身刷不掉冷却：冷却**跟着身体走**（禁止靠换身刷新技能）。
   *
   * ⚠️ 别写成「附身 A 再附身 A 换回去」—— 对调两次等于恒等变换，
   *    「真的对调了」和「压根没对调」在这条路径上观测结果一模一样，
   *    于是这个用例在反向验证里连「删掉 swapBodyIdentity」都测不出来。
   *    必须让**第三具身体**接盘，冷却的迁移轨迹才是可观测的。
   */
  it('连续换身刷不掉冷却：冷却跟着身体走（禁止靠换身刷新技能）', () => {
    const state = makePlayingState();
    const p = state.player;
    const guard = addMember(state, CreatureType.PUFFER_FISH, p.x + 80, p.y);
    guard.coreRole = SQUAD_ROLE.GUARD;
    guard.roleCooldown = 300;
    const plain = addMember(state, CreatureType.CLOWN_FISH, p.x + 120, p.y); // 第三条身体

    possessMember(state, guard.id); // 玩家 → 河豚身体，连角色带冷却一起接管
    expect(p.coreRole).toBe(SQUAD_ROLE.GUARD);
    expect(p.roleCooldown).toBe(300);

    possessMember(state, plain.id); // 再换到小丑鱼：河豚身体（含冷却）交棒给 plain

    // 冷却一路跟着那具河豚身体走，300 一次都没被清零
    expect(plain.coreRole).toBe(SQUAD_ROLE.GUARD);
    expect(plain.roleCooldown).toBe(300);
    expect(p.coreRole).toBeUndefined();
    expect(p.roleCooldown).toBe(0);
  });
});
