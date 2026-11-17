import { describe, expect, it } from 'vitest';
import { createInitialState } from '../factories/initialState';
import { createEntity } from '../systems/spawn';
import { chooseAutopilotEvolution, chooseAutopilotInput, createAutopilotMemory } from '../systems/playerAutopilot';
import { CreatureType, GameStatus } from '../types';
import type { FrameContext, GameEvents, GameState } from '../types';
import { CREATURES } from '../data/creatures';
import { EventBus } from '../core/EventBus';
import { getPlayerSpeed, playerControlSystem } from '../systems/playerControl';
import { skillsSystem } from '../systems/skills';
import { combatSystem } from '../systems/combat';
import { resolveObstacles } from '../systems/terrain';

const makeState = () => {
  const state = createInitialState({ skipWorldGen: true, mode: 'LEGACY', worldMode: 'FINITE' });
  state.status = GameStatus.PLAYING;
  state.player.x = 2000;
  state.player.y = 2000;
  state.player.angle = 0;
  state.player.radius = 40;
  state.player.level = 4;
  state.entities = [];
  state.obstacles = [];
  state.buildings = [];
  state.portals = [];
  state.currents = [];
  return state;
};

const context = (input: ReturnType<typeof chooseAutopilotInput>): FrameContext => ({
  mouse: input.mouse,
  input: { ...input, mouseDown: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(), dt: 1,
});

const setSpecies = (state: GameState, type: CreatureType) => {
  state.player.type = type;
  state.player.config = CREATURES[type];
};

const fish = (type: CreatureType, id: string, x: number, y: number, radius: number) => {
  const e = createEntity(type, x, y);
  e.id = id;
  e.radius = radius;
  e.semiGhostTimer = 0;
  e.vx = 0;
  e.vy = 0;
  return e;
};

describe('玩家挂机控制器', () => {
  it('选择可捕食目标，且只生成输入、不修改鱼群和玩家状态', () => {
    const state = makeState();
    state.entities = [fish(CreatureType.PLANKTON, 'food', 2280, 2000, 10)];
    const before = JSON.stringify(state);
    const input = chooseAutopilotInput(state, createAutopilotMemory(), 1280, 720);

    expect(input.targetId).toBe('fish:food');
    expect(input.mouse.x).toBeGreaterThan(640);
    expect(input.mouse.y).toBeCloseTo(360, 3);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('大鱼挡在食物前方时避开直冲路线', () => {
    const state = makeState();
    state.entities = [
      fish(CreatureType.PLANKTON, 'food', 2400, 2000, 10),
      fish(CreatureType.ORCA, 'danger', 2130, 2000, 75),
    ];
    const input = chooseAutopilotInput(state, createAutopilotMemory(), 1280, 720);

    expect(Math.abs(input.mouse.y - 360) + Math.max(0, 640 - input.mouse.x)).toBeGreaterThan(50);
    expect(input.space).toBe(true);
  });

  it('岩石挡路时选择绕行，不会朝岩石中心一直顶', () => {
    const state = makeState();
    state.entities = [fish(CreatureType.PLANKTON, 'food', 2400, 2000, 10)];
    state.obstacles = [{ id: 'rock', type: 'ROCK', x: 2130, y: 2000, radius: 80 }];
    const input = chooseAutopilotInput(state, createAutopilotMemory(), 1280, 720);

    expect(Math.abs(input.mouse.y - 360)).toBeGreaterThan(50);
  });

  it('残血时优先寻找可用急救站', () => {
    const state = makeState();
    state.player.health = state.player.maxHealth * 0.2;
    state.entities = [fish(CreatureType.PLANKTON, 'food', 2200, 2000, 10)];
    state.buildings = [{ id: 'heal', type: 'HOSPITAL', x: 2600, y: 2000, radius: 150, cooldown: 0 }];

    const input = chooseAutopilotInput(state, createAutopilotMemory(), 1280, 720);
    expect(input.targetId).toBe('hospital:heal');
  });

  it('进化只从已冻结的候选中选择', () => {
    const state = makeState();
    state.status = GameStatus.EVOLVING;
    state.evolveOptions = [CreatureType.CLOWN_FISH, CreatureType.ORCA];

    expect([CreatureType.CLOWN_FISH, CreatureType.ORCA]).toContain(chooseAutopilotEvolution(state));
    state.evolveOptions = [];
    expect(chooseAutopilotEvolution(state)).toBeNull();
  });

  it('预判横向游动的猎物，并在连续追击中实际吃掉它', () => {
    const state = makeState();
    const prey = fish(CreatureType.PLANKTON, 'moving', 2280, 2000, 10);
    prey.vy = 1.5;
    state.entities = [prey];
    const memory = createAutopilotMemory();
    const initial = chooseAutopilotInput(state, memory, 1280, 720);
    const initialWeight = state.player.weight;
    expect(initial.mouse.y).toBeGreaterThan(380);

    for (let i = 0; i < 180 && prey.health > 0; i += 1) {
      state.time++;
      const ctx = context(chooseAutopilotInput(state, memory, 1280, 720));
      playerControlSystem(state, ctx);
      prey.y += prey.vy;
      combatSystem(state, ctx);
    }
    expect(prey.health).toBeLessThanOrEqual(0);
    expect(state.player.weight).toBeGreaterThan(initialWeight);
  });

  it('近距离拾取按轨迹经过目标计分，不会为了预测终点绕过目标', () => {
    const state = makeState();
    state.player.radius = 15;
    state.player.speed = 8;
    const item = { id: 'close', x: 2055, y: 2000, radius: 8, type: 'FEAST' as const, status: 'ACTIVE' as const, timer: 600 };
    state.treasures = [item];
    const memory = createAutopilotMemory();
    let closest = Infinity;
    for (let i = 0; i < 20; i += 1) {
      state.time++;
      playerControlSystem(state, context(chooseAutopilotInput(state, memory, 1280, 720)));
      closest = Math.min(closest, Math.hypot(state.player.x - item.x, state.player.y - item.y));
      if (closest <= state.player.radius + item.radius) break;
    }
    expect(closest).toBeLessThanOrEqual(state.player.radius + item.radius);
  });

  it('已经开始追击的冲刺不会在 75% 能量边缘反复开关，并保留逃命储备', () => {
    const state = makeState();
    state.entities = [fish(CreatureType.PLANKTON, 'food', 2500, 2000, 10)];
    const memory = createAutopilotMemory();
    expect(chooseAutopilotInput(state, memory, 1280, 720).space).toBe(true);
    state.player.boost.current = 74;
    expect(chooseAutopilotInput(state, memory, 1280, 720).space).toBe(true);
    state.player.boost.current = 29;
    expect(chooseAutopilotInput(state, memory, 1280, 720).space).toBe(false);
    state.player.boost.current = 31;
    expect(chooseAutopilotInput(state, memory, 1280, 720).space).toBe(false);
  });

  it('真实运动中绕过岩石并捕获岩石后方的猎物', () => {
    const state = makeState();
    const prey = fish(CreatureType.PLANKTON, 'food', 2500, 2000, 10);
    state.entities = [prey];
    const rock = { id: 'rock', type: 'ROCK' as const, x: 2250, y: 2000, radius: 80 };
    state.obstacles = [rock];
    const memory = createAutopilotMemory();
    let collisions = 0;
    for (let i = 0; i < 600 && prey.health > 0; i += 1) {
      state.time++;
      const ctx = context(chooseAutopilotInput(state, memory, 1280, 720));
      playerControlSystem(state, ctx);
      if (Math.hypot(state.player.x - rock.x, state.player.y - rock.y) < state.player.radius + rock.radius) collisions++;
      resolveObstacles(state.player, state.obstacles);
      combatSystem(state, ctx);
    }
    expect(prey.health).toBeLessThanOrEqual(0);
    expect(collisions).toBe(0);
  });

  it('持续无法接近的目标会暂时跳过，转向其他食物', () => {
    const state = makeState();
    state.entities = [fish(CreatureType.PLANKTON, 'blocked', 2280, 2000, 10),
      fish(CreatureType.PLANKTON, 'alternative', 2700, 2000, 10)];
    const memory = createAutopilotMemory();
    expect(chooseAutopilotInput(state, memory, 1280, 720).targetId).toBe('fish:blocked');
    // 模拟被地形卡住：时间继续，距离不缩短。
    for (let i = 0; i < 241; i += 1) {
      state.time++;
      chooseAutopilotInput(state, memory, 1280, 720);
    }
    expect(memory.targetId).toBe('fish:alternative');
    expect(memory.skipped['fish:blocked']).toBeGreaterThan(state.time);
  });

  it('捕食者靠近时自动缩壳，技能在真实系统中生效且不覆盖已有护盾', () => {
    const state = makeState();
    setSpecies(state, CreatureType.TURTLE);
    state.player.skillCooldown = 0;
    state.player.shieldTimer = 0;
    state.player.invulnerableTimer = 0;
    state.entities = [fish(CreatureType.ORCA, 'danger', 2150, 2000, 75)];
    const memory = createAutopilotMemory();
    const input = chooseAutopilotInput(state, memory, 1280, 720);
    expect(input.rightMouseDown).toBe(true);
    skillsSystem(state, context(input));
    expect(state.player.shieldTimer).toBeGreaterThan(0);
    state.player.skillCooldown = 0;
    expect(chooseAutopilotInput(state, memory, 1280, 720).rightMouseDown).toBe(false);
  });

  it('主技能冷却时使用已解锁的 Q 控制技能，实际减速猎物', () => {
    const state = makeState();
    setSpecies(state, CreatureType.JELLYFISH);
    state.player.level = 9;
    state.player.skillCooldown = 60;
    state.player.schoolSkillCooldown = 0;
    const prey = fish(CreatureType.PLANKTON, 'food', 2280, 2000, 10);
    state.entities = [prey];
    const input = chooseAutopilotInput(state, createAutopilotMemory(), 1280, 720);
    expect(input.q).toBe(true);
    skillsSystem(state, context(input));
    expect(prey.speedBoostTimer).toBeLessThan(0);
    expect(state.player.schoolSkillCooldown).toBeGreaterThan(0);
  });

  it('危险的大鱼在拉怪范围内时不释放旋涡技能', () => {
    const state = makeState();
    setSpecies(state, CreatureType.JELLYFISH);
    state.player.level = 6;
    state.player.skillCooldown = 60;
    state.player.schoolSkillCooldown = 0;
    state.entities = [fish(CreatureType.PLANKTON, 'food', 2260, 2000, 10),
      fish(CreatureType.ORCA, 'danger', 2400, 2150, 75)];
    expect(chooseAutopilotInput(state, createAutopilotMemory(), 1280, 720).q).toBe(false);
  });

  it('后退技能的落点有岩石时不释放，空旷时可以实际后退', () => {
    const state = makeState();
    setSpecies(state, CreatureType.SQUID);
    state.player.skillCooldown = 0;
    state.entities = [fish(CreatureType.ORCA, 'danger', 2150, 2000, 75)];
    const input = chooseAutopilotInput(state, createAutopilotMemory(), 1280, 720);
    expect(input.rightMouseDown).toBe(true);
    const ctx = context(input);
    const before = { x: state.player.x, y: state.player.y };
    playerControlSystem(state, ctx);
    skillsSystem(state, ctx);
    const landing = { x: state.player.x, y: state.player.y };
    expect(Math.hypot(landing.x - before.x, landing.y - before.y)).toBeGreaterThan(90);

    state.player.x = before.x; state.player.y = before.y; state.player.angle = 0;
    state.player.skillCooldown = 0;
    state.obstacles = [{ id: 'blocked-landing', type: 'ROCK', ...landing, radius: 45 }];
    expect(chooseAutopilotInput(state, createAutopilotMemory(), 1280, 720).rightMouseDown).toBe(false);
  });

  it.each([-12, 0, 12])('预测速度与真实移动一致，包括生态区、冲刺和状态计时器（%s）', timer => {
    const state = makeState();
    state.player.currentBiome = 'SHALLOWS';
    state.player.stats.speedMult = 1.7;
    state.player.speedBoostTimer = timer;
    const predicted = getPlayerSpeed(state, true);
    const x = state.player.x;
    const ctx = context({ mouse: { x: 840, y: 360 }, space: true,
      rightMouseDown: false, q: false, targetId: null });
    playerControlSystem(state, ctx);
    expect(state.player.x - x).toBeCloseTo(predicted, 6);
  });

  it('同类鱼没有普通碰撞伤害，不把它当成逃命威胁', () => {
    const state = makeState();
    state.entities = [fish(state.player.type as CreatureType, 'same', 2100, 2000, 100),
      fish(CreatureType.PLANKTON, 'food', 2400, 2000, 10)];
    const input = chooseAutopilotInput(state, createAutopilotMemory(), 1280, 720);
    expect(input.targetId).toBe('fish:food');
    expect(input.mouse.x).toBeGreaterThan(640);
    expect(input.mouse.y).toBeCloseTo(360, 3);
  });
});
