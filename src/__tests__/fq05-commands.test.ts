/**
 * FQ-05 战队指令与指定附身（《鱼群争霸开发计划》§6.2）。
 *
 * 这轮要钉住的四件事：
 *   ① **指令是状态不是动作** —— 下完令一直挂着，队员每帧照着它动；集火的目标也存成状态。
 *   ② **目标失效与冷却迁移正确** —— 目标死亡 / 追不上 / 跟丢 → 回护卫；
 *      附身时技能冷却留在灵魂上（刷不掉），撕咬与反击冷却跟着身体对调（也刷不掉）。
 *   ③ **离散输入只生效一次**（AR-03）—— 连点不多次换身；指定附身的目标没了就**失败**，
 *      绝不悄悄换到别人身上。
 *   ④ **三指令真的改变了行为** —— 不是三个高亮按钮：护卫会为近处猎物脱队、
 *      集火能追 520 以外的目标、撤退会收紧队形并无视敌人。
 *
 * ── 两条测量纪律（都是踩过的坑）──
 *   · **移动类用例显式钉 speed**：成员默认速度是物种速度（小丑鱼 1.1 → 1.375px/帧），
 *     跑 800px 要 580 帧。被测的是「指令把队员送到哪」，不是「这条鱼游多快」，
 *     所以夹具直接给 `speed = 4`，用例才既快又稳。
 *   · **移动类用例不推进 `state.time`**：队形角带 `state.time * 0.01` 的自转项，
 *     推时间 = 目标点在玩家周围缓慢绕圈，落点变成一个环带、没法断言。
 *     冻住时间 = 队形静止在 0 弧度（只对 index 0 的成员成立，本文件只用单成员）。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import {
  squadSystem,
  issueCommand,
  getSquadCommand,
  pickFocusTarget,
  queueSquadAction,
  requestPossess,
  switchToNextMember,
  getSquadMembers,
  __resetSwitchCursor,
} from '../systems/squad';
import { SQUAD_COMMAND, SQUAD_COMMAND_CONFIG, SQUAD_COMMAND_LIST } from '../data/squadRoles';
import { SQUAD_CONFIG } from '../data/world';
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

/** 造一个已入队的成员。speed 显式给 —— 见文件头「测量纪律」 */
const addMember = (state: GameState, type: CreatureType, x: number, y: number, speed = 4) => {
  const m = createEntity(type, x, y);
  m.ownerId = 'player';
  m.semiGhostTimer = 0;
  m.speed = speed;
  state.entities.push(m);
  return m;
};

/** 造一个敌人（野生鱼） */
const addEnemy = (state: GameState, type: CreatureType, x: number, y: number) => {
  const e = createEntity(type, x, y);
  e.semiGhostTimer = 0;
  state.entities.push(e);
  return e;
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** 推进 n 帧战队系统（不推进 state.time —— 见文件头） */
const runFrames = (state: GameState, n: number): void => {
  for (let i = 0; i < n; i += 1) squadSystem(state, makeCtx());
};

beforeEach(() => {
  __resetSwitchCursor();
});

/* ══════════════ 指令是状态（§6.2） ══════════════ */

describe('FQ-05 · 指令是状态', () => {
  it('三条指令都能下达，并写进 state.squad.command', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    const enemy = addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 300, state.player.y);

    for (const cfg of SQUAD_COMMAND_LIST) {
      const ok = issueCommand(state, cfg.id, cfg.needsTarget ? { worldMouse: { x: enemy.x, y: enemy.y } } : {});
      expect(ok, `${cfg.name} 应该能下达`).toBe(true);
      expect(getSquadCommand(state)).toBe(cfg.id);
    }
  });

  it('集火会把目标存成状态（commandTargetId）—— 队员每帧照着它动', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    const enemy = addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 300, state.player.y);

    expect(issueCommand(state, SQUAD_COMMAND.FOCUS)).toBe(true);
    expect(state.squad.commandTargetId).toBe(enemy.id);
    expect(state.squad.notice?.text).toContain(enemy.config.name);
  });

  it('护卫 / 撤退不需要目标，下达后把旧目标清掉', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 300, state.player.y);

    issueCommand(state, SQUAD_COMMAND.FOCUS);
    expect(state.squad.commandTargetId).toBeDefined();

    issueCommand(state, SQUAD_COMMAND.RETREAT);
    expect(state.squad.commandTargetId).toBeUndefined();
    expect(state.squad.notice?.text).toBe('撤退');
  });

  it('没有队员时任何指令都下达失败，并给原因（不静默失败）', () => {
    const state = makePlayingState();
    state.squad.command = SQUAD_COMMAND.RETREAT; // 先摆一个「已下令」的状态

    expect(issueCommand(state, SQUAD_COMMAND.GUARD)).toBe(false);
    expect(state.squad.command).toBe(SQUAD_COMMAND.RETREAT); // 失败了就不该改状态
    expect(state.squad.notice?.text).toContain('没有队员');
  });

  it('集火选不到敌人时不下令，只给原因', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    state.squad.command = SQUAD_COMMAND.GUARD;

    expect(issueCommand(state, SQUAD_COMMAND.FOCUS)).toBe(false);
    expect(state.squad.command).toBe(SQUAD_COMMAND.GUARD);
    expect(state.squad.notice?.text).toContain('没有可集火的敌人');
  });

  it('队员不是合法集火目标（自己人不算敌人）', () => {
    const state = makePlayingState();
    // 队员就在脸上，但它是友军 —— 只有阵营判定拦得住
    const ally = addMember(state, CreatureType.SWORD_FISH, state.player.x + 60, state.player.y);

    expect(pickFocusTarget(state)).toBeUndefined();
    expect(issueCommand(state, SQUAD_COMMAND.FOCUS)).toBe(false);
    expect(ally.ownerId).toBe('player');
  });

  it('集火优先「鼠标落点圈内」的敌人，而不是「离玩家最近」的', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    const near = addEnemy(state, CreatureType.CLOWN_FISH, state.player.x + 200, state.player.y);
    const far = addEnemy(state, CreatureType.CLOWN_FISH, state.player.x + 700, state.player.y);

    // 不给鼠标位置 → 退回「离玩家最近」
    expect(pickFocusTarget(state)?.id).toBe(near.id);
    // 鼠标落在远的那条身上 → 远的那条赢（点谁打谁）
    expect(pickFocusTarget(state, { x: far.x, y: far.y })?.id).toBe(far.id);
  });

  it('集火目标超出可点选距离时不下令', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    const far = addEnemy(state, CreatureType.CLOWN_FISH, state.player.x + SQUAD_COMMAND_CONFIG.FOCUS_PICK_RANGE + 100, state.player.y);

    expect(pickFocusTarget(state, { x: far.x, y: far.y })).toBeUndefined();
    expect(issueCommand(state, SQUAD_COMMAND.FOCUS, { worldMouse: { x: far.x, y: far.y } })).toBe(false);
  });

  it('非游玩状态不受理指令（进化 / 结算 / 商场 / 菜单都一样）', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);

    for (const st of [GameStatus.MENU, GameStatus.EVOLVING, GameStatus.SHOP, GameStatus.GAME_OVER]) {
      state.status = st;
      expect(issueCommand(state, SQUAD_COMMAND.RETREAT)).toBe(false);
      expect(state.squad.notice?.text).toContain('无法下令');
    }
  });
});

/* ══════════════ 目标失效（§6.2「目标死亡 / 追不上后回护卫」） ══════════════ */

describe('FQ-05 · 目标失效与回护卫', () => {
  it('目标死亡 → 下一帧回护卫并给原因', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    const enemy = addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 400, state.player.y);
    expect(issueCommand(state, SQUAD_COMMAND.FOCUS)).toBe(true);

    enemy.health = 0;
    squadSystem(state, makeCtx());

    expect(getSquadCommand(state)).toBe(SQUAD_COMMAND.GUARD);
    expect(state.squad.commandTargetId).toBeUndefined();
    expect(state.squad.notice?.text).toContain('目标已消失');
  });

  it('目标跑出追击上限 → 回护卫', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    const enemy = addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 400, state.player.y);
    expect(issueCommand(state, SQUAD_COMMAND.FOCUS)).toBe(true);

    // 逃到追击上限之外
    enemy.x = state.player.x + SQUAD_COMMAND_CONFIG.FOCUS_CHASE_RANGE + 100;
    squadSystem(state, makeCtx());

    expect(getSquadCommand(state)).toBe(SQUAD_COMMAND.GUARD);
    expect(state.squad.notice?.text).toContain('目标太远');
  });

  it('目标钻进草丛 → 先宽限，超过宽限帧数才回护卫（草丛挡一帧不该让整队散掉）', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    const enemy = addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 400, state.player.y);
    expect(issueCommand(state, SQUAD_COMMAND.FOCUS)).toBe(true);

    // 开隐身 = 失去感知（距离远大于 CONCEAL_REVEAL_RANGE，不可能靠贴脸破功）
    enemy.camoActive = true;

    // 宽限期内保持集火
    runFrames(state, SQUAD_COMMAND_CONFIG.TARGET_LOST_GRACE);
    expect(state.squad.targetLostTimer).toBe(SQUAD_COMMAND_CONFIG.TARGET_LOST_GRACE);
    expect(getSquadCommand(state)).toBe(SQUAD_COMMAND.FOCUS);

    // 再多一帧 → 判失靶
    squadSystem(state, makeCtx());
    expect(getSquadCommand(state)).toBe(SQUAD_COMMAND.GUARD);
    expect(state.squad.notice?.text).toContain('跟丢了目标');
  });

  it('目标重新可感知后宽限计数清零（不会被之前那一帧的丢人算旧账）', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.CLOWN_FISH, state.player.x + 120, state.player.y);
    const enemy = addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 400, state.player.y);
    issueCommand(state, SQUAD_COMMAND.FOCUS);

    enemy.camoActive = true;
    runFrames(state, SQUAD_COMMAND_CONFIG.TARGET_LOST_GRACE - 1);
    expect(state.squad.targetLostTimer).toBeGreaterThan(0);

    enemy.camoActive = false;
    squadSystem(state, makeCtx());

    expect(state.squad.targetLostTimer).toBe(0);
    expect(getSquadCommand(state)).toBe(SQUAD_COMMAND.FOCUS);
  });

  it('切换冷却每帧递减', () => {
    const state = makePlayingState();
    state.squad.switchCooldown = 5;

    runFrames(state, 3);

    expect(state.squad.switchCooldown).toBe(2);
  });
});

/* ══════════════ 冷却归属：灵魂 vs 身体（§6.1 末句） ══════════════ */

describe('FQ-05 · 冷却迁移', () => {
  it('附身不刷新技能 / 流派冷却（它们在灵魂上，换身体碰不到）', () => {
    const state = makePlayingState();
    state.player.schoolSkillCooldown = 500;
    state.player.skillCooldown = 400;
    addMember(state, CreatureType.SWORD_FISH, state.player.x + 200, state.player.y);

    expect(switchToNextMember(state)).toBe(true);

    expect(state.player.schoolSkillCooldown).toBe(500);
    expect(state.player.skillCooldown).toBe(400);
  });

  it('附身只换身体，不清除当前指令（计划 §6.2 末段）', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.SWORD_FISH, state.player.x + 200, state.player.y);
    const enemy = addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 300, state.player.y);
    expect(issueCommand(state, SQUAD_COMMAND.FOCUS)).toBe(true);

    expect(switchToNextMember(state)).toBe(true);

    // 指令与集火目标都还在 —— 换了身体不等于换了命令
    expect(getSquadCommand(state)).toBe(SQUAD_COMMAND.FOCUS);
    expect(state.squad.commandTargetId).toBe(enemy.id);
  });

  it('附身把撕咬 / 反击冷却跟着身体对调（对调，不是清零 —— 清零等于白送先手）', () => {
    const state = makePlayingState();
    const member = addMember(state, CreatureType.SWORD_FISH, state.player.x + 200, state.player.y);

    state.player.biteCooldown = 100;
    state.player.counterCooldown = 60;
    state.player.counterWindup = 12;
    member.biteCooldown = 5;
    member.counterCooldown = 0;
    member.counterWindup = 0;

    expect(switchToNextMember(state)).toBe(true);

    // 玩家现在拿着小弟那具身体 → 拿到小弟的冷却
    expect(state.player.biteCooldown).toBe(5);
    expect(state.player.counterCooldown).toBe(0);
    expect(state.player.counterWindup).toBe(0);

    // 小弟接管了玩家原来的身体 → 原封不动带走玩家那套冷却
    const oldBody = getSquadMembers(state)[0];
    expect(oldBody.biteCooldown).toBe(100);
    expect(oldBody.counterCooldown).toBe(60);
    expect(oldBody.counterWindup).toBe(12);
  });
});

/* ══════════════ 离散输入只生效一次（AR-03） ══════════════ */

describe('FQ-05 · 离散输入', () => {
  it('连点两次「附身下一条」，一帧内只换一次身', () => {
    const state = makePlayingState();
    const a = addMember(state, CreatureType.SWORD_FISH, state.player.x + 200, state.player.y);
    const b = addMember(state, CreatureType.GREAT_WHITE, state.player.x - 200, state.player.y);
    const aType = a.type;
    const bType = b.type;

    queueSquadAction(state, { kind: 'POSSESS_NEXT' });
    queueSquadAction(state, { kind: 'POSSESS_NEXT' });
    expect(state.squad.pendingActions).toHaveLength(2);

    squadSystem(state, makeCtx());

    // 队列一次清空（不留到下一帧重复执行）
    expect(state.squad.pendingActions).toHaveLength(0);
    // 只换了第一具身体：玩家 = A 的身体，且队里不该再有人拿着 A 的身体
    // （若真的换了两次，B 就会接管 A 的身体）
    expect(state.player.type).toBe(aType);
    expect(state.player.type).not.toBe(bType);
    expect(getSquadMembers(state).filter((m) => m.type === aType)).toHaveLength(0);
    expect(state.squad.switchCooldown).toBeGreaterThan(0);
  });

  it('队列有上限：连点不会把队列撑爆（更不会变成连击）', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.SWORD_FISH, state.player.x + 200, state.player.y);

    for (let i = 0; i < 40; i += 1) queueSquadAction(state, { kind: 'POSSESS_NEXT' });

    expect(state.squad.pendingActions).toHaveLength(SQUAD_COMMAND_CONFIG.ACTION_QUEUE_MAX);
  });

  it('指定附身：点谁换谁，身体落到它原来的位置', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.SWORD_FISH, state.player.x + 200, state.player.y);
    const target = addMember(state, CreatureType.GREAT_WHITE, state.player.x - 300, state.player.y + 120);
    const targetType = target.type;
    const targetRadius = target.radius;
    const targetX = target.x;
    const targetY = target.y;

    queueSquadAction(state, { kind: 'POSSESS', memberId: target.id });
    squadSystem(state, makeCtx());

    expect(state.player.type).toBe(targetType);
    expect(state.player.radius).toBe(targetRadius);
    expect(state.player.x).toBeCloseTo(targetX, 5);
    expect(state.player.y).toBeCloseTo(targetY, 5);
  });

  it('指定附身的目标不存在 → 不换身 + 给原因（绝不悄悄换到别人身上）', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.SWORD_FISH, state.player.x + 200, state.player.y);
    addMember(state, CreatureType.GREAT_WHITE, state.player.x - 200, state.player.y);
    const beforeType = state.player.type;
    const beforeX = state.player.x;

    queueSquadAction(state, { kind: 'POSSESS', memberId: 'ghost-member-id' });
    squadSystem(state, makeCtx());

    expect(state.player.type).toBe(beforeType);
    expect(state.player.x).toBeCloseTo(beforeX, 5);
    expect(state.squad.notice?.text).toContain('阵亡或离队');
    expect(state.squad.pendingActions).toHaveLength(0);
  });

  it('指定附身的目标在「点下去 → 生效」之间阵亡 → 什么都不做', () => {
    const state = makePlayingState();
    const doomed = addMember(state, CreatureType.GREAT_WHITE, state.player.x + 200, state.player.y);
    addMember(state, CreatureType.SWORD_FISH, state.player.x - 200, state.player.y);
    const beforeType = state.player.type;
    const beforeX = state.player.x;

    // 玩家点下头像……
    queueSquadAction(state, { kind: 'POSSESS', memberId: doomed.id });
    // ……这一帧结束前它被旁边的野怪咬死了
    doomed.health = 0;

    squadSystem(state, makeCtx());

    expect(state.player.type).toBe(beforeType);
    expect(state.player.x).toBeCloseTo(beforeX, 5);
    expect(state.squad.notice?.text).toContain('阵亡或离队');
  });

  it('附身冷却中指定附身被拒绝，并说明还有多久', () => {
    const state = makePlayingState();
    addMember(state, CreatureType.SWORD_FISH, state.player.x + 200, state.player.y);
    const target = addMember(state, CreatureType.GREAT_WHITE, state.player.x - 200, state.player.y);
    const beforeType = state.player.type;

    state.squad.switchCooldown = 20;
    queueSquadAction(state, { kind: 'POSSESS', memberId: target.id });
    squadSystem(state, makeCtx());

    expect(state.player.type).toBe(beforeType);
    expect(state.squad.notice?.text).toContain('冷却');
    // 直接调 API 也是一样的结论
    expect(requestPossess(state, target.id)).toBe(false);
  });

  it('没有队员时按 R 给原因，而不是静默失败', () => {
    const state = makePlayingState();

    expect(switchToNextMember(state)).toBe(false);
    expect(state.squad.notice?.text).toContain('没有队员');
  });
});

/* ══════════════ 三指令真的改变了行为 ══════════════ */

describe('FQ-05 · 三指令的行为差异', () => {
  it('护卫（缺省）：玩家近处出现猎物时会短暂脱队扑上去', () => {
    const state = makePlayingState();
    const member = addMember(state, CreatureType.CLOWN_FISH, state.player.x + 500, state.player.y);
    // 猎物在玩家 300px 处（< GUARD_CHASE_RANGE）
    const prey = addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 300, state.player.y);

    runFrames(state, 150);

    expect(dist(member, prey)).toBeLessThan(70);
    expect(dist(member, prey)).toBeLessThan(dist(member, state.player));
  });

  it('护卫：不为远处猎物脱队（判据是「离玩家」的距离，不是离队员的）', () => {
    const state = makePlayingState();
    const member = addMember(state, CreatureType.CLOWN_FISH, state.player.x + 500, state.player.y);
    // 猎物在玩家 800px 处（> GUARD_CHASE_RANGE 520）—— 对队员自己来说并不算远
    const prey = addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 800, state.player.y);

    runFrames(state, 150);

    // 老实地回到队形里，没有一路追出去
    expect(dist(member, prey)).toBeGreaterThan(300);
    expect(dist(member, state.player)).toBeLessThan(450);
  });

  it('集火：能扑向护卫够不着、但可点选距离以内的目标（同场景对比）', () => {
    const state = makePlayingState();
    const member = addMember(state, CreatureType.CLOWN_FISH, state.player.x + 500, state.player.y);
    const prey = addEnemy(state, CreatureType.SWORD_FISH, state.player.x + 800, state.player.y);

    // 先按护卫跑一段：够不着（800 > GUARD_CHASE_RANGE）
    runFrames(state, 150);
    expect(dist(member, prey)).toBeGreaterThan(300);

    // 换成集火：同一个目标，这次追得上
    expect(issueCommand(state, SQUAD_COMMAND.FOCUS)).toBe(true);
    runFrames(state, 200);

    expect(dist(member, prey)).toBeLessThan(70);
  });

  it('撤退：队形比护卫收得更紧，且完全无视敌人', () => {
    // ── 无敌人对照：集结距离差 == (FOLLOW_GAP + FOLLOW_DEADZONE) − (RALLY_GAP + RETREAT_DEADZONE)
    //    半径项在两次运行里相同，自动抵消 —— 所以这条断言不依赖任何物种体型
    const guardState = makePlayingState();
    const guardMember = addMember(guardState, CreatureType.CLOWN_FISH, guardState.player.x + 500, guardState.player.y);
    runFrames(guardState, 120);
    const guardDist = dist(guardMember, guardState.player);

    const retreatState = makePlayingState();
    const retreatMember = addMember(retreatState, CreatureType.CLOWN_FISH, retreatState.player.x + 500, retreatState.player.y);
    expect(issueCommand(retreatState, SQUAD_COMMAND.RETREAT)).toBe(true);
    // 同一个场景再放一个护卫会去扑的猎物：撤退必须无视它
    const prey = addEnemy(retreatState, CreatureType.SWORD_FISH, retreatState.player.x + 300, retreatState.player.y);
    runFrames(retreatState, 120);
    const retreatDist = dist(retreatMember, retreatState.player);

    expect(retreatDist).toBeLessThan(guardDist);
    const expectedDelta =
      SQUAD_CONFIG.FOLLOW_GAP + SQUAD_CONFIG.FOLLOW_DEADZONE -
      (SQUAD_COMMAND_CONFIG.RETREAT_RALLY_GAP + SQUAD_COMMAND_CONFIG.RETREAT_DEADZONE);
    expect(Math.abs(guardDist - retreatDist - expectedDelta)).toBeLessThan(15);

    // 无视敌人：没有扑向 300px 处的猎物
    expect(dist(retreatMember, prey)).toBeGreaterThan(90);
  });
});
