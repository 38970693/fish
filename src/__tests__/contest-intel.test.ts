import { describe, expect, it } from 'vitest';
import { AMBUSHER_SQUAD_ID, SCAVENGER_SQUAD_ID } from '../data/rivalSquads';
import { createInitialState } from '../factories/initialState';
import { getContestIntel } from '../systems/contestIntel';
import { rivalSquadsSystem } from '../systems/rivalSquads';

const makeContest = () => {
  const state = createInitialState({ mode: 'RIVALS', skipWorldGen: true });
  Object.assign(state.feedingEvent!, {
    id: 'event-intel', phase: 'WARNING', timer: 480,
    x: state.player.x + 650, y: state.player.y,
  });
  return state;
};

describe('FQ-09 争夺情报', () => {
  it('投食预告会列出两支敌队的名称、人数和策略', () => {
    const state = makeContest();
    rivalSquadsSystem(state);

    const intel = getContestIntel(state);

    expect(intel.squads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: SCAVENGER_SQUAD_ID, name: '抢食帮', alive: 4, tactic: '抢食' }),
      expect.objectContaining({ id: AMBUSHER_SQUAD_ID, name: '伏击帮', alive: 3, tactic: '伏击' }),
    ]));
    expect(intel.level).toBe('WATCH');
  });

  it('伏击帮开始扑击且靠近玩家时显示高危险', () => {
    const state = makeContest();
    rivalSquadsSystem(state);
    const ambusher = state.entities.find((entity) => entity.ownerId === AMBUSHER_SQUAD_ID)!;
    ambusher.x = state.player.x + 220;
    ambusher.y = state.player.y;
    state.player.health = state.player.maxHealth * 0.4;
    state.feedingEvent!.phase = 'DROPPING';
    rivalSquadsSystem(state);

    const intel = getContestIntel(state);

    expect(intel.level).toBe('DANGER');
    expect(intel.nearestEnemyDistance).toBeLessThan(240);
  });

  it('事件结束且敌队撤离后不再显示争夺警报', () => {
    const state = makeContest();
    rivalSquadsSystem(state);
    state.feedingEvent!.phase = 'COOLDOWN';

    expect(getContestIntel(state).level).toBe('CALM');
  });
});
