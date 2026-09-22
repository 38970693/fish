import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import {
  AMBUSHER_SQUAD_CONFIG,
  AMBUSHER_SQUAD_ID,
  RIVAL_SQUAD_CONFIG,
  SCAVENGER_SQUAD_ID,
} from '../data/rivalSquads';
import { CreatureType } from '../data/creatures';
import { RIVALS_SPAWN_CONFIG } from '../data/world';
import { createInitialState } from '../factories/initialState';
import { resolveFeedingPickups } from '../systems/feedingEvents';
import { getRivalMembers, rivalSquadsSystem } from '../systems/rivalSquads';
import { createEntity, spawnSystem } from '../systems/spawn';
import { canHarm } from '../systems/factions';
import type { FrameContext, GameEvents } from '../types';

const makeCtx = (): FrameContext => ({
  mouse: { x: 0, y: 0 },
  input: { space: false, mouseDown: false, rightMouseDown: false, q: false, interact: false },
  screen: { width: 1280, height: 720 },
  events: new EventBus<GameEvents>(),
  dt: 1,
});

const makeContest = () => {
  const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
  Object.assign(state.feedingEvent!, {
    id: 'event-1', phase: 'WARNING', timer: 480,
    x: state.player.x + 650, y: state.player.y,
  });
  return state;
};

describe('FQ-08 抢食帮', () => {
  it('RIVALS 初始化稳定队名，LEGACY 不创建敌队状态', () => {
    const rivals = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    const legacy = createInitialState({ mode: 'LEGACY', skipWorldGen: true });
    expect(rivals.rivalSquads).toHaveLength(2);
    expect(rivals.rivalSquads![0]).toMatchObject({
      id: SCAVENGER_SQUAD_ID, name: '抢食帮', status: 'DORMANT',
    });
    expect(rivals.rivalSquads![1]).toMatchObject({
      id: AMBUSHER_SQUAD_ID, name: '伏击帮', kind: 'AMBUSHER', status: 'DORMANT',
    });
    expect(legacy.rivalSquads).toBeUndefined();
  });

  it('伏击帮在事件外围集结，不会像抢食帮一样直接冲向食物中心', () => {
    const state = makeContest();
    rivalSquadsSystem(state);
    const squad = state.rivalSquads!.find((item) => item.id === AMBUSHER_SQUAD_ID)!;
    const members = getRivalMembers(state, squad);

    expect(members).toHaveLength(AMBUSHER_SQUAD_CONFIG.MEMBER_COUNT);
    for (let i = 0; i < 120; i += 1) rivalSquadsSystem(state);

    expect(getRivalMembers(state, squad).every((member) =>
      Math.hypot(member.x - state.feedingEvent!.x!, member.y - state.feedingEvent!.y!)
        >= AMBUSHER_SQUAD_CONFIG.AMBUSH_DISTANCE - 90
    )).toBe(true);
  });

  it('伏击帮只扑向残血或落单玩家阵营目标，满血抱团时继续埋伏', () => {
    const state = makeContest();
    const ally = createEntity(CreatureType.CLOWN_FISH, state.player.x + 25, state.player.y);
    ally.ownerId = 'player';
    state.entities.push(ally);
    rivalSquadsSystem(state);
    const squad = state.rivalSquads!.find((item) => item.id === AMBUSHER_SQUAD_ID)!;
    const member = getRivalMembers(state, squad)[0];
    member.x = state.player.x + 300;
    member.y = state.player.y;
    const groupedBefore = Math.hypot(member.x - state.player.x, member.y - state.player.y);

    rivalSquadsSystem(state);
    const groupedAfter = Math.hypot(member.x - state.player.x, member.y - state.player.y);
    expect(groupedAfter).not.toBe(groupedBefore);
    expect(squad.status).toBe('APPROACHING');

    state.player.health = state.player.maxHealth * 0.4;
    state.feedingEvent!.phase = 'DROPPING';
    for (let i = 0; i < 30; i += 1) rivalSquadsSystem(state);
    const woundedAfter = Math.hypot(member.x - state.player.x, member.y - state.player.y);
    expect(woundedAfter).toBeLessThan(groupedAfter);
    expect(squad.status).toBe('CONTESTING');
  });

  it('两支敌队互为敌对阵营，但各自队内不会误伤', () => {
    const state = makeContest();
    rivalSquadsSystem(state);
    const scavengers = getRivalMembers(state, state.rivalSquads![0]);
    const ambushers = getRivalMembers(state, state.rivalSquads![1]);

    expect(canHarm(scavengers[0], scavengers[1])).toBe(false);
    expect(canHarm(ambushers[0], ambushers[1])).toBe(false);
    expect(canHarm(scavengers[0], ambushers[0])).toBe(true);
    const wild = createEntity(CreatureType.CRAB, scavengers[0].x, scavengers[0].y);
    expect(canHarm(wild, scavengers[0])).toBe(false);
    expect(canHarm(scavengers[0], wild)).toBe(false);
  });

  it('预告开始后从事件外侧部署四名成员，成员共享队伍阵营 ID', () => {
    const state = makeContest();
    rivalSquadsSystem(state);

    const squad = state.rivalSquads![0];
    const members = getRivalMembers(state, squad);
    expect(members).toHaveLength(RIVAL_SQUAD_CONFIG.MEMBER_COUNT);
    expect(members.every((member) => member.ownerId === SCAVENGER_SQUAD_ID)).toBe(true);
    expect(members.every((member) => member.cosmetics.skinColor === '#f97316')).toBe(true);
    expect(members.every((member) => (member.semiGhostTimer ?? 0) > 0)).toBe(true);
    expect(members.filter((member) => member.speechBubble?.text === RIVAL_SQUAD_CONFIG.NAME)).toHaveLength(1);
    expect(squad.status).toBe('APPROACHING');
  });

  it('赴事件时持续接近争夺区，有食物时优先奔向最近食物', () => {
    const state = makeContest();
    rivalSquadsSystem(state);
    const squad = state.rivalSquads![0];
    const member = getRivalMembers(state, squad)[0];
    state.feedingEvent!.phase = 'DROPPING';
    state.feedingEvent!.drops = [{
      id: 'bait', x: state.feedingEvent!.x!, y: state.feedingEvent!.y!, radius: 12, value: 8,
    }];
    const before = Math.hypot(member.x - state.feedingEvent!.x!, member.y - state.feedingEvent!.y!);

    for (let i = 0; i < 60; i += 1) rivalSquadsSystem(state);

    const after = Math.hypot(member.x - state.feedingEvent!.x!, member.y - state.feedingEvent!.y!);
    expect(after).toBeLessThan(before);
    expect(squad.status).toBe('CONTESTING');
  });

  it('抢到食物会治疗成员，并把阵营收益存入有限补员资源', () => {
    const state = makeContest();
    rivalSquadsSystem(state);
    const squad = state.rivalSquads![0];
    const member = getRivalMembers(state, squad)[0];
    member.health = 1;
    state.feedingEvent!.phase = 'DROPPING';
    state.feedingEvent!.drops = [{ id: 'food', x: member.x, y: member.y, radius: 12, value: 8 }];

    resolveFeedingPickups(state, makeCtx());
    rivalSquadsSystem(state);

    expect(member.health).toBeGreaterThan(1);
    expect(squad.resource).toBe(8);
    expect(state.feedingEvent!.claims[SCAVENGER_SQUAD_ID]).toBe(8);
  });

  it('队伍残血后停止争抢并撤回部署点', () => {
    const state = makeContest();
    rivalSquadsSystem(state);
    const squad = state.rivalSquads![0];
    const members = getRivalMembers(state, squad);
    for (const member of members) member.health = member.maxHealth * 0.1;

    rivalSquadsSystem(state);

    expect(squad.status).toBe('RETREATING');
  });

  it('减员后不会凭空补满，只能消费抢到的有限资源补员', () => {
    const state = makeContest();
    rivalSquadsSystem(state);
    const squad = state.rivalSquads![0];
    getRivalMembers(state, squad)[0].health = 0;
    squad.status = 'RECOVERING';
    squad.recoverTimer = 0;

    rivalSquadsSystem(state);
    expect(getRivalMembers(state, squad)).toHaveLength(3);

    squad.status = 'RECOVERING';
    squad.recoverTimer = 0;
    squad.resource = RIVAL_SQUAD_CONFIG.REINFORCE_COST;
    rivalSquadsSystem(state);
    expect(getRivalMembers(state, squad)).toHaveLength(4);
    expect(squad.resource).toBe(0);
  });

  it('完整撤回并恢复后，会在下一场投食重新入场', () => {
    const state = makeContest();
    rivalSquadsSystem(state);
    const squad = state.rivalSquads![0];
    const members = getRivalMembers(state, squad);
    members.forEach((member) => {
      member.x = squad.homeX!;
      member.y = squad.homeY!;
    });
    state.feedingEvent!.phase = 'COOLDOWN';
    rivalSquadsSystem(state);
    expect(squad.status).toBe('RECOVERING');

    squad.recoverTimer = 0;
    Object.assign(state.feedingEvent!, {
      id: 'event-2', phase: 'WARNING', timer: 480,
      x: state.player.x - 650, y: state.player.y,
    });
    rivalSquadsSystem(state);

    expect(squad.status).toBe('APPROACHING');
    expect(getRivalMembers(state, squad)).toHaveLength(RIVAL_SQUAD_CONFIG.MEMBER_COUNT);
  });

  it('下一场预告会召回仍在返程的健康成员', () => {
    const state = makeContest();
    rivalSquadsSystem(state);
    const squad = state.rivalSquads![0];
    squad.status = 'RETREATING';
    squad.recoverTimer = RIVAL_SQUAD_CONFIG.RECOVER_FRAMES;
    Object.assign(state.feedingEvent!, {
      id: 'event-2', phase: 'WARNING', timer: 480,
      x: state.player.x - 650, y: state.player.y,
    });

    rivalSquadsSystem(state);

    expect(squad.status).toBe('APPROACHING');
    expect(squad.recoverTimer).toBe(0);
    expect(getRivalMembers(state, squad)).toHaveLength(RIVAL_SQUAD_CONFIG.MEMBER_COUNT);
  });

  it('背景生成会为事件和敌队保留实体槽位', () => {
    const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
    state.feedingEvent!.timer = RIVALS_SPAWN_CONFIG.RESERVE_LEAD_FRAMES;
    for (let i = 0; i < 400; i += 1) spawnSystem(state, makeCtx());
    expect(state.entities).toHaveLength(300 - RIVALS_SPAWN_CONFIG.RESERVED_EVENT_SLOTS);
  });
});
