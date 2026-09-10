/**
 * P0 功能测试：装扮接线 / 新手保护与无敌帧 / 复活 / 胜利条件。
 * 对应 开发路线图.md 的 P0 清单。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '../core/EventBus';
import { processCollision } from '../systems/combat';
import { worldSystem } from '../systems/world';
import { createEntity } from '../systems/spawn';
import { updateGame } from '../gameEngine';
import { createInitialState } from '../factories/initialState';
import { PROTECTION_CONFIG } from '../data/world';
import { CreatureType } from '../data/creatures';
import { GameStatus, type FrameContext, type GameEvents } from '../types';

const makeCtx = (input: Partial<FrameContext['input']> = {}): FrameContext => ({
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false, ...input },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const makePlayingState = () => {
  const state = createInitialState({ skipWorldGen: true });
  state.status = GameStatus.PLAYING;
  return state;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('P0-2 新手保护与无敌帧', () => {
  it('保护配置存在且有合理时长', () => {
    expect(PROTECTION_CONFIG.NEWBIE_DURATION).toBeGreaterThan(0);
    expect(PROTECTION_CONFIG.REVIVE_DURATION).toBeGreaterThan(0);
  });

  it('无敌帧期间不能被吃也不能被伤害', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 让吞噬判定必定成功，验证是被无敌拦下的
    const state = makePlayingState();
    const ctx = makeCtx();

    // 贴身摆放（距离 < 双方半径和），排除「距离太远」的干扰
    const shark = createEntity(CreatureType.GREAT_WHITE, state.player.x + 50, state.player.y);
    shark.semiGhostTimer = 0;
    state.entities.push(shark);

    state.player.invulnerableTimer = 300; // 保护中
    const hp = state.player.health;

    processCollision(shark, state.player, state, ctx);

    expect(state.player.health).toBe(hp);
    expect(state.status).toBe(GameStatus.PLAYING);
  });

  it('保护中的玩家仍然可以正常捕食（保护不是坐牢）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makePlayingState();
    const ctx = makeCtx();

    const food = createEntity(CreatureType.PLANKTON, state.player.x + 15, state.player.y);
    food.semiGhostTimer = 0;
    state.entities.push(food);

    state.player.invulnerableTimer = 300;
    processCollision(state.player, food, state, ctx);

    expect(food.health).toBe(0);
  });

  it('闪避 / 翻滚技能设置的无敌帧同样生效', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makePlayingState();
    const ctx = makeCtx();

    const shark = createEntity(CreatureType.GREAT_WHITE, state.player.x + 50, state.player.y);
    shark.semiGhostTimer = 0;
    state.entities.push(shark);

    // 模拟闪避技能：短暂无敌
    state.player.invulnerableTimer = 30;
    const hp = state.player.health;
    processCollision(shark, state.player, state, ctx);
    expect(state.player.health).toBe(hp);
  });
});

/**
 * P1-1 之后战斗不再是「判定命中即秒杀」，而是「撕咬扣血 → 残血才能吞」。
 * 单帧调用一次 processCollision 只会咬一口，测试里要真实打死目标就得反复咬。
 * 这里手动清 biteCooldown 模拟「冷却结束再来一口」，最多咬 1000 次防止死循环。
 */
const biteUntilDead = (
  state: ReturnType<typeof makePlayingState>,
  ctx: FrameContext,
  attacker: ReturnType<typeof createEntity>,
  victim: ReturnType<typeof createEntity>
): number => {
  for (let i = 0; i < 1000; i += 1) {
    if (victim.health <= 0) return i;
    attacker.biteCooldown = 0;
    processCollision(attacker, victim, state, ctx);
  }
  return 1000;
};

describe('P0-4 胜利条件', () => {
  it('玩家击杀深海霸主（BOSS）触发胜利', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 吞噬判定必定成功
    const state = makePlayingState();
    const ctx = makeCtx();

    const boss = createEntity(CreatureType.ORCA, state.player.x + 100, state.player.y);
    boss.semiGhostTimer = 0;
    state.entities.push(boss);

    state.player.angle = 0; // 正对猎物
    state.player.invulnerableTimer = 0;
    // 模拟后期体型：让小丑鱼开局单挑虎鲸本来就不该赢，这里验证的是「击杀 BOSS 会触发胜利」
    state.player.radius = boss.radius * 2;
    state.player.level = 20;

    const bites = biteUntilDead(state, ctx, state.player, boss);

    expect(bites).toBeLessThan(1000); // 确实能打死，而不是永远打不动
    expect(boss.health).toBeLessThanOrEqual(0);
    expect(state.status).toBe(GameStatus.VICTORY);
  });

  it('AI 击杀 BOSS 不触发玩家胜利', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makePlayingState();
    const ctx = makeCtx();

    const killer = createEntity(CreatureType.GREAT_WHITE, 3000, 3000);
    const boss = createEntity(CreatureType.MERMAID, 3020, 3000);
    killer.semiGhostTimer = 0;
    boss.semiGhostTimer = 0;
    killer.angle = 0;
    state.entities.push(killer, boss);

    const bites = biteUntilDead(state, ctx, killer, boss);

    expect(bites).toBeLessThan(1000);
    expect(boss.health).toBeLessThanOrEqual(0);
    expect(state.status).toBe(GameStatus.PLAYING);
  });
});

describe('P0-1 商场换装入口（E 键门闸）', () => {
  it('游进商场范围只提示，按 E 才切到换装状态', () => {
    const state = createInitialState(); // 需要真实建筑
    state.status = GameStatus.PLAYING;

    const shop = state.buildings.find((b) => b.type === 'SHOP');
    expect(shop).toBeDefined();
    state.player.x = shop!.x;
    state.player.y = shop!.y;

    // 只进范围不按键：保持 PLAYING（路过不被劫持），提示画在**商场头顶**（b.prompt）
    // —— 以前写在 player.speechBubble 里，和战斗气泡同槽互相顶掉（还曾因渲染丢失从未显示过）
    worldSystem(state, makeCtx());
    expect(state.status).toBe(GameStatus.PLAYING);
    expect(shop!.prompt?.text).toContain('按 E');
    // 不再占用战斗气泡槽（speechBubble 要么没写、要么是生态区提示，反正不该是商场文案）
    expect(state.player.speechBubble?.text ?? '').not.toContain('按 E');

    // 离开交互圈：提示跟着消失（world 每帧先清残留）
    state.player.x += shop!.radius * 3;
    worldSystem(state, makeCtx());
    expect(shop!.prompt).toBeNull();

    // 游回商场再按 E（上升沿）：切换到商场换装
    state.player.x = shop!.x;
    state.player.y = shop!.y;
    worldSystem(state, makeCtx()); // 先空跑一帧，确保提示恢复、E 归位
    worldSystem(state, makeCtx({ interact: true }));
    expect(state.status).toBe(GameStatus.SHOP);
  });

  it('按住 E 只触发一次，松开再按才能再次进入', () => {
    const state = createInitialState();
    state.status = GameStatus.PLAYING;

    const shop = state.buildings.find((b) => b.type === 'SHOP')!;
    state.player.x = shop.x;
    state.player.y = shop.y;

    // prevInteract 是模块级状态，上一个用例结束时 E 是按下的 —— 先松开归位
    worldSystem(state, makeCtx());

    // 按 E 进入
    worldSystem(state, makeCtx({ interact: true }));
    expect(state.status).toBe(GameStatus.SHOP);

    // 模拟点「完成」回到游戏，人还站在商场里、E 仍按着：
    // 清掉冷却，单独验证上升沿防粘死
    state.status = GameStatus.PLAYING;
    shop.cooldown = 0;
    worldSystem(state, makeCtx({ interact: true }));
    expect(state.status).toBe(GameStatus.PLAYING);

    // 松开 E（prevInteract 归位）再按，新的上升沿才会再次进入
    worldSystem(state, makeCtx());
    worldSystem(state, makeCtx({ interact: true }));
    expect(state.status).toBe(GameStatus.SHOP);
  });
});

describe('P0 附带：状态机暂停', () => {
  it('菜单 / 进化 / 商场 / 胜负状态下世界暂停推进', () => {
    const pausedStatuses = [
      GameStatus.MENU,
      GameStatus.EVOLVING,
      GameStatus.SHOP,
      GameStatus.GAME_OVER,
      GameStatus.VICTORY,
    ];

    for (const status of pausedStatuses) {
      const state = createInitialState({ skipWorldGen: true });
      state.status = status;
      updateGame(state, { x: 0, y: 0 }, false, false, false, 1280, 720);
      expect(state.time).toBe(0);
    }
  });

  it('游玩状态下正常推进', () => {
    const state = makePlayingState();
    updateGame(state, { x: 0, y: 0 }, false, false, false, 1280, 720);
    expect(state.time).toBe(1);
  });
});
