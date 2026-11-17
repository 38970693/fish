import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import { CREATURES, CreatureType } from '../data/creatures';
import { TREASURE_CONFIG } from '../data/world';
import { createInitialState } from '../factories/initialState';
import { combatSystem, dealDamage } from '../systems/combat';
import { updateTreasures } from '../systems/events';
import { chooseAutopilotEvolution, chooseAutopilotInput, createAutopilotMemory } from '../systems/playerAutopilot';
import { applyEvolutionChoice, progressionSystem } from '../systems/progression';
import { skillsSystem } from '../systems/skills';
import { createEntity } from '../systems/spawn';
import { resolveFeedingPickups } from '../systems/feedingEvents';
import { itemsSystem } from '../systems/items';
import { awardPlayerGrowth } from '../systems/playerGrowth';
import { GameStatus, type FrameContext, type GameEvents } from '../types';

const context = (): FrameContext => ({
  mouse: { x: 840, y: 360 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 }, events: new EventBus<GameEvents>(), dt: 1,
});
afterEach(() => vi.restoreAllMocks());

describe('玩家体型跳变回归', () => {
  it('队友击杀巨怪不会让小鱼瞬间获得数倍体型，通关状态不被进化覆盖', () => {
    const state = createInitialState({ skipWorldGen: true, mode: 'LEGACY' });
    state.status = GameStatus.PLAYING;
    const p = state.player;
    const ally = createEntity(CreatureType.GREAT_WHITE, p.x + 1000, p.y);
    ally.id = 'ally'; ally.ownerId = 'player'; ally.semiGhostTimer = 0;
    const boss = createEntity(CreatureType.KRAKEN, p.x + 2000, p.y);
    boss.id = 'boss'; boss.semiGhostTimer = 0;
    state.entities = [ally, boss];
    const radius = p.radius;
    dealDamage(boss, boss.health + 1, ally);
    combatSystem(state, context());
    progressionSystem(state, context());
    expect(p.radius).toBeLessThanOrEqual(radius + 10);
    expect(p.weight).toBe(45);
    expect(p.level).toBe(5);
    expect(state.status).toBe(GameStatus.VICTORY);
  });

  it('长时间获得经验以及后续进化不会把等级全部叠加成无限体型', () => {
    const state = createInitialState({ skipWorldGen: true, mode: 'LEGACY' });
    const p = state.player;
    for (let i = 0; i < 100; i++) awardPlayerGrowth(state, context(), 20);
    expect(p.weight).toBe(2015);
    expect(p.radius).toBeLessThanOrEqual(CREATURES[CreatureType.CLOWN_FISH].baseRadius * 1.6);
    state.status = GameStatus.EVOLVING;
    applyEvolutionChoice(state, CreatureType.GREAT_WHITE);
    expect(p.config).toBe(CREATURES[CreatureType.GREAT_WHITE]);
    expect(p.radius).toBeLessThanOrEqual(p.config.baseRadius * 1.6);
  });

  it('挂机击败霸主后只提示并继续，首领奖励不会造成连跳三阶', () => {
    const state = createInitialState({ skipWorldGen: true, mode: 'LEGACY' });
    state.status = GameStatus.PLAYING; state.autopilotEnabled = true;
    const p = state.player;
    const boss = createEntity(CreatureType.KRAKEN, p.x + 2000, p.y);
    boss.id = 'boss'; boss.semiGhostTimer = 0;
    state.entities = [boss];
    const ctx = context();
    dealDamage(boss, boss.health + 1, p);
    combatSystem(state, ctx);
    expect(state.status).toBe(GameStatus.PLAYING);
    expect(state.labels.some(label => label.text.includes('继续巡游'))).toBe(true);
    expect(state.score).toBeGreaterThanOrEqual(boss.config.weightValue);
    const tiers = [p.config.tier];
    for (let frame = 0; frame < 4; frame++) {
      progressionSystem(state, ctx);
      if ((state.status as GameStatus) === GameStatus.EVOLVING) {
        const choice = chooseAutopilotEvolution(state);
        if (choice) applyEvolutionChoice(state, choice);
        tiers.push(p.config.tier);
      }
    }
    expect(tiers).toEqual([1, 2]);
    expect(state.status).toBe(GameStatus.PLAYING);
    expect(p.radius).toBeLessThanOrEqual(p.config.baseRadius * 1.6);
  });

  it.each([GameStatus.VICTORY, GameStatus.GAME_OVER, GameStatus.SHOP, GameStatus.MENU])(
    '待进化时仍保留 %s 状态，不擅自启动进化', status => {
      const state = createInitialState({ skipWorldGen: true, mode: 'LEGACY' });
      state.status = status; state.player.evolutionPoints = 715;
      progressionSystem(state, context());
      expect(state.status).toBe(status);
      expect(state.evolveOptions ?? []).toHaveLength(0);
    },
  );

  it('小鱼拾取一份大餐后再捕食，不会在几个挂机帧内连续进化成巨兽', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = createInitialState({ skipWorldGen: true, mode: 'LEGACY' });
    state.status = GameStatus.PLAYING;
    const p = state.player;
    const initialRadius = p.radius;
    const ctx = context();
    state.treasures = [{ id: 'feast', x: p.x, y: p.y, radius: 60, type: 'FEAST',
      effect: 'EXP', rewardValue: TREASURE_CONFIG.FEAST_REWARD, status: 'ACTIVE', timer: 600 }];
    updateTreasures(state, ctx);
    expect(p.level).toBe(Math.floor(p.weight / 10) + 1);
    expect(p.radius).toBe(initialRadius + 4);
    const prey = createEntity(CreatureType.PLANKTON, p.x + 3, p.y);
    prey.id = 'food'; prey.semiGhostTimer = 0;
    state.entities = [prey];
    combatSystem(state, ctx);
    const trace = [{ type: p.type, level: p.level, radius: p.radius, weight: p.weight }];
    for (let frame = 0; frame < 4; frame += 1) {
      progressionSystem(state, ctx);
      if ((state.status as GameStatus) !== GameStatus.EVOLVING) continue;
      const choice = chooseAutopilotEvolution(state);
      if (choice) applyEvolutionChoice(state, choice);
      trace.push({ type: p.type, level: p.level, radius: p.radius, weight: p.weight });
    }
    expect(trace).toHaveLength(2);
    expect(p.config.tier).toBe(2);
    expect(p.radius).toBeLessThanOrEqual(initialRadius * 3);
  });

  it('高技能等级的挂机河豚膨胀只放大外观，不会变成无限大的鱼', () => {
    const state = createInitialState({ skipWorldGen: true, startType: CreatureType.PUFFER_FISH });
    state.status = GameStatus.PLAYING;
    const p = state.player;
    p.level = 4; p.skillLevel = 100; p.skillCooldown = 0;
    p.shieldTimer = 0; p.invulnerableTimer = 0;
    const danger = createEntity(CreatureType.ORCA, p.x + 100, p.y);
    danger.id = 'danger'; danger.semiGhostTimer = 0;
    state.entities = [danger];
    const input = chooseAutopilotInput(state, createAutopilotMemory(), 1280, 720);
    expect(input.rightMouseDown).toBe(true);
    const ctx = context();
    ctx.input.rightMouseDown = input.rightMouseDown;
    const radius = p.radius;
    skillsSystem(state, ctx);
    expect(p.renderScale).toBeGreaterThan(1);
    expect(p.renderScale).toBeLessThanOrEqual(2);
    expect(p.radius).toBe(radius);
    expect(p.config).toBe(CREATURES[CreatureType.PUFFER_FISH]);
  });

  it('投食奖励在拾取时结算等级和体型，不积压到下一次吃鱼', () => {
    const state = createInitialState({ skipWorldGen: true, mode: 'RIVALS' });
    const p = state.player;
    const radius = p.radius;
    const level = p.level;
    state.feedingEvent!.drops = [{ id: 'drop', x: p.x, y: p.y, radius: 12, value: 25 }];
    resolveFeedingPickups(state, context());
    expect(p.level).toBe(Math.floor(p.weight / 10) + 1);
    expect(p.radius).toBe(radius + (p.level - level) * 2);
    const weight = p.weight;
    resolveFeedingPickups(state, context());
    expect(p.weight).toBe(weight);
  });

  it('贝壳依旧提供两级和五点半径，拾取只结算一次', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const state = createInitialState({ skipWorldGen: true });
    state.time = 1;
    const p = state.player;
    const before = { level: p.level, radius: p.radius, weight: p.weight, points: p.evolutionPoints };
    state.powerUps = [{ id: 'shell', x: p.x, y: p.y, radius: 30, type: 'SHELL' }];
    itemsSystem(state, context());
    expect(p.level).toBe(before.level + 2);
    expect(p.radius).toBe(before.radius + 5);
    expect(p.weight).toBe(before.weight + 20);
    expect(p.evolutionPoints).toBe(before.points);
    itemsSystem(state, context());
    expect(p.weight).toBe(before.weight + 20);
  });
});
