import { CreatureType } from './creatures';
import type { RivalSquadState } from '../types';

export const SCAVENGER_SQUAD_ID = 'rival-scavengers';
export const AMBUSHER_SQUAD_ID = 'rival-ambushers';

export interface RivalSquadConfig {
  NAME: string;
  MEMBER_COUNT: number;
  MEMBER_TYPE: CreatureType;
  SPAWN_DISTANCE: number;
  SPAWN_SPREAD: number;
  SPAWN_ATTEMPTS: number;
  APPROACH_SPEED_MULT: number;
  EVENT_STOP_DISTANCE: number;
  RETREAT_DISTANCE: number;
  RETREAT_STOP_DISTANCE: number;
  RETREAT_HEALTH_RATIO: number;
  RETREAT_MEMBER_COUNT: number;
  RECOVER_FRAMES: number;
  REINFORCE_COST: number;
  DEPLOY_PROTECTION_FRAMES: number;
  SKIN_COLOR: string;
  SPEECH_COLOR: string;
  AMBUSH_DISTANCE: number;
  TARGET_RANGE: number;
  WOUNDED_TARGET_RATIO: number;
  ISOLATION_DISTANCE: number;
}

const common = {
  SPAWN_DISTANCE: 620,
  SPAWN_SPREAD: 55,
  SPAWN_ATTEMPTS: 18,
  RETREAT_DISTANCE: 760,
  RETREAT_STOP_DISTANCE: 90,
  RECOVER_FRAMES: 10 * 60,
  REINFORCE_COST: 16,
  DEPLOY_PROTECTION_FRAMES: 8 * 60,
  TARGET_RANGE: 0,
  WOUNDED_TARGET_RATIO: 0,
  ISOLATION_DISTANCE: 0,
} as const;

export const RIVAL_SQUAD_CONFIG: RivalSquadConfig = {
  ...common,
  NAME: '抢食帮',
  MEMBER_COUNT: 4,
  MEMBER_TYPE: CreatureType.BLUE_TANG,
  APPROACH_SPEED_MULT: 1.65,
  EVENT_STOP_DISTANCE: 90,
  RETREAT_HEALTH_RATIO: 0.35,
  RETREAT_MEMBER_COUNT: 1,
  SKIN_COLOR: '#f97316',
  SPEECH_COLOR: '#fb923c',
  AMBUSH_DISTANCE: 0,
};

export const AMBUSHER_SQUAD_CONFIG: RivalSquadConfig = {
  ...common,
  NAME: '伏击帮',
  MEMBER_COUNT: 3,
  MEMBER_TYPE: CreatureType.SQUID,
  APPROACH_SPEED_MULT: 1.35,
  EVENT_STOP_DISTANCE: 44,
  RETREAT_HEALTH_RATIO: 0.42,
  RETREAT_MEMBER_COUNT: 1,
  SKIN_COLOR: '#7c3aed',
  SPEECH_COLOR: '#c4b5fd',
  AMBUSH_DISTANCE: 330,
  TARGET_RANGE: 720,
  WOUNDED_TARGET_RATIO: 0.55,
  ISOLATION_DISTANCE: 180,
};

export const rivalSquadConfig = (squad: RivalSquadState): RivalSquadConfig =>
  squad.kind === 'AMBUSHER' ? AMBUSHER_SQUAD_CONFIG : RIVAL_SQUAD_CONFIG;

const makeSquad = (id: string, kind: RivalSquadState['kind'], config: RivalSquadConfig): RivalSquadState => ({
  id,
  name: config.NAME,
  kind,
  status: 'DORMANT',
  memberIds: [],
  resource: 0,
  claimedSeen: 0,
  activeEventId: null,
  recoverTimer: 0,
  deployments: 0,
  homeX: null,
  homeY: null,
});

export const createRivalSquads = (): RivalSquadState[] => [
  makeSquad(SCAVENGER_SQUAD_ID, 'SCAVENGER', RIVAL_SQUAD_CONFIG),
  makeSquad(AMBUSHER_SQUAD_ID, 'AMBUSHER', AMBUSHER_SQUAD_CONFIG),
];
