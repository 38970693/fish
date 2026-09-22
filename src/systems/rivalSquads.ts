import { rivalSquadConfig, type RivalSquadConfig } from '../data/rivalSquads';
import { MAX_ENTITIES } from '../data/world';
import type { Entity, FeedingDrop, GameState, PlayerState, RivalSquadState } from '../types';
import { dist2, turnToward } from '../core/math';
import { createEntity } from './spawn';
import { isPlayerFaction } from './factions';
import { isPositionValid } from './terrain';

export const getRivalMembers = (state: GameState, squad: RivalSquadState): Entity[] => {
  const ids = new Set(squad.memberIds);
  return state.entities.filter((entity) => ids.has(entity.id) && entity.health > 0);
};

const isSpawnClear = (state: GameState, x: number, y: number): boolean => {
  if (!isPositionValid(x, y, 60)) return false;
  return !state.obstacles.some((item) => item.featureState !== 'BROKEN' && Math.hypot(x - item.x, y - item.y) < item.radius + 45);
};

const findDeploymentCenter = (state: GameState, config: RivalSquadConfig): { x: number; y: number } | null => {
  const event = state.feedingEvent;
  if (!event || event.x === null || event.y === null) return null;
  const away = Math.atan2(event.y - state.player.y, event.x - state.player.x);
  for (let attempt = 0; attempt < config.SPAWN_ATTEMPTS; attempt += 1) {
    const angle = away + (Math.random() - 0.5) * Math.PI;
    const x = event.x + Math.cos(angle) * config.SPAWN_DISTANCE;
    const y = event.y + Math.sin(angle) * config.SPAWN_DISTANCE;
    if (isSpawnClear(state, x, y)) return { x, y };
  }
  return null;
};

const deploymentSlots = (squad: RivalSquadState, liveCount: number, config: RivalSquadConfig): number => {
  const missing = config.MEMBER_COUNT - liveCount;
  if (squad.deployments === 0) return missing;
  return Math.min(missing, Math.floor(squad.resource / config.REINFORCE_COST));
};

const deployMembers = (state: GameState, squad: RivalSquadState): void => {
  const config = rivalSquadConfig(squad);
  const center = findDeploymentCenter(state, config);
  if (!center) return;
  const live = getRivalMembers(state, squad);
  const count = Math.min(deploymentSlots(squad, live.length, config), MAX_ENTITIES - state.entities.length);
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / Math.max(1, count);
    const member = createEntity(
      config.MEMBER_TYPE,
      center.x + Math.cos(angle) * config.SPAWN_SPREAD,
      center.y + Math.sin(angle) * config.SPAWN_SPREAD
    );
    member.ownerId = squad.id;
    // 覆盖投食预告期，避免刚从视野外进入就被背景生态消耗；正式投食时保护自然结束。
    member.semiGhostTimer = config.DEPLOY_PROTECTION_FRAMES;
    member.cosmetics = { ...member.cosmetics, skinColor: config.SKIN_COLOR, pattern: 'STRIPES' };
    if (i === 0) {
      member.speechBubble = { text: config.NAME, timer: 90, color: config.SPEECH_COLOR };
    }
    state.entities.push(member);
    squad.memberIds.push(member.id);
  }
  if (count <= 0) return;
  if (squad.deployments > 0) squad.resource -= count * config.REINFORCE_COST;
  squad.deployments += 1;
  squad.homeX = center.x;
  squad.homeY = center.y;
  squad.status = 'APPROACHING';
};

const updateClaimedResource = (state: GameState, squad: RivalSquadState): boolean => {
  const event = state.feedingEvent;
  if (!event?.id) return false;
  const isNewEvent = squad.activeEventId !== event.id;
  if (isNewEvent) {
    squad.activeEventId = event.id;
    squad.claimedSeen = 0;
  }
  const claimed = event.claims[squad.id] ?? 0;
  const gained = Math.max(0, claimed - squad.claimedSeen);
  squad.resource += gained;
  squad.claimedSeen = claimed;
  return isNewEvent;
};

const nearestDrop = (member: Entity, drops: FeedingDrop[]): FeedingDrop | null => {
  let nearest: FeedingDrop | null = null;
  let nearestDistance = Infinity;
  for (const drop of drops) {
    const distance = dist2(member, drop);
    if (distance < nearestDistance) {
      nearest = drop;
      nearestDistance = distance;
    }
  }
  return nearest;
};

const moveToward = (member: Entity, x: number, y: number, stopAt: number, config: RivalSquadConfig): void => {
  const dx = x - member.x;
  const dy = y - member.y;
  if (Math.hypot(dx, dy) <= stopAt) return;
  member.angle = turnToward(member.angle, Math.atan2(dy, dx), 0.22);
  const speed = member.speed * config.APPROACH_SPEED_MULT;
  member.vx = Math.cos(member.angle) * speed;
  member.vy = Math.sin(member.angle) * speed;
  member.x += member.vx;
  member.y += member.vy;
};

const shouldRetreat = (members: Entity[], squad: RivalSquadState, config: RivalSquadConfig): boolean => {
  if (squad.deployments === 0 || members.length === 0) return false;
  const averageHealth = members.reduce((sum, member) => sum + member.health / member.maxHealth, 0) / members.length;
  return members.length <= config.RETREAT_MEMBER_COUNT || averageHealth <= config.RETREAT_HEALTH_RATIO;
};

const moveScavengers = (state: GameState, squad: RivalSquadState, members: Entity[], config: RivalSquadConfig): void => {
  const event = state.feedingEvent!;
  squad.status = event.phase === 'WARNING' ? 'APPROACHING' : 'CONTESTING';
  for (const member of members) {
    const drop = nearestDrop(member, event.drops);
    if (drop) moveToward(member, drop.x, drop.y, member.radius + drop.radius - 1, config);
    else if (event.x !== null && event.y !== null) moveToward(member, event.x, event.y, config.EVENT_STOP_DISTANCE, config);
  }
};

const findAmbushPoint = (state: GameState, config: RivalSquadConfig): { x: number; y: number } | null => {
  const event = state.feedingEvent;
  if (!event || event.x === null || event.y === null) return null;
  const nearbyCover = state.obstacles
    .filter((cover) => cover.featureState !== 'BROKEN' && Math.hypot(cover.x - event.x!, cover.y - event.y!) <= config.AMBUSH_DISTANCE + 220)
    .sort((a, b) => Math.hypot(a.x - event.x!, a.y - event.y!) - Math.hypot(b.x - event.x!, b.y - event.y!))[0];
  if (nearbyCover) {
    const angle = Math.atan2(nearbyCover.y - event.y, nearbyCover.x - event.x);
    const x = nearbyCover.x + Math.cos(angle) * (nearbyCover.radius + 45);
    const y = nearbyCover.y + Math.sin(angle) * (nearbyCover.radius + 45);
    if (isSpawnClear(state, x, y)) return { x, y };
  }
  const playerAngle = Math.atan2(state.player.y - event.y, state.player.x - event.x);
  return {
    x: event.x + Math.cos(playerAngle + Math.PI / 2) * config.AMBUSH_DISTANCE,
    y: event.y + Math.sin(playerAngle + Math.PI / 2) * config.AMBUSH_DISTANCE,
  };
};

const pickAmbushTarget = (state: GameState, members: Entity[], config: RivalSquadConfig): Entity | PlayerState | null => {
  if (members.length === 0) return null;
  const playerFaction: Array<Entity | PlayerState> = [
    state.player,
    ...state.entities.filter((entity) => entity.health > 0 && isPlayerFaction(entity)),
  ];
  let selected: Entity | PlayerState | null = null;
  let selectedDistance = Infinity;
  for (const target of playerFaction) {
    const wounded = target.health / target.maxHealth <= config.WOUNDED_TARGET_RATIO;
    const isolated = playerFaction.every((ally) =>
      ally === target || Math.hypot(ally.x - target.x, ally.y - target.y) > config.ISOLATION_DISTANCE
    );
    if (!wounded && !isolated) continue;
    const distance = Math.min(...members.map((member) => Math.hypot(member.x - target.x, member.y - target.y)));
    if (distance <= config.TARGET_RANGE && distance < selectedDistance) {
      selected = target;
      selectedDistance = distance;
    }
  }
  return selected;
};

const moveAmbushers = (state: GameState, squad: RivalSquadState, members: Entity[], config: RivalSquadConfig): void => {
  // 预告期只占位，给玩家看见敌队并决定是否参战；投食真正开始后才扑击破绽。
  const target = state.feedingEvent?.phase === 'WARNING' ? null : pickAmbushTarget(state, members, config);
  if (target) {
    squad.status = 'CONTESTING';
    members.forEach((member) => moveToward(member, target.x, target.y, member.radius + target.radius - 2, config));
    return;
  }
  squad.status = 'APPROACHING';
  const point = findAmbushPoint(state, config);
  if (!point) return;
  members.forEach((member) => moveToward(member, point.x, point.y, config.EVENT_STOP_DISTANCE, config));
};

const moveToEvent = (state: GameState, squad: RivalSquadState, members: Entity[]): void => {
  const config = rivalSquadConfig(squad);
  if (shouldRetreat(members, squad, config)) {
    squad.status = 'RETREATING';
    return;
  }
  if (squad.kind === 'AMBUSHER') moveAmbushers(state, squad, members, config);
  else moveScavengers(state, squad, members, config);
};

const moveToSafety = (squad: RivalSquadState, members: Entity[]): void => {
  const config = rivalSquadConfig(squad);
  if (squad.homeX === null || squad.homeY === null || members.length === 0) {
    squad.status = 'RECOVERING';
    squad.recoverTimer = config.RECOVER_FRAMES;
    return;
  }
  members.forEach((member) => moveToward(member, squad.homeX!, squad.homeY!, config.RETREAT_STOP_DISTANCE, config));
  const arrived = members.every(
    (member) => Math.hypot(member.x - squad.homeX!, member.y - squad.homeY!) <= config.RETREAT_STOP_DISTANCE
  );
  if (arrived) {
    squad.status = 'RECOVERING';
    squad.recoverTimer = config.RECOVER_FRAMES;
  }
};

export const rivalSquadsSystem = (state: GameState): void => {
  if (!state.run || !state.rivalSquads || !state.feedingEvent) return;
  const active = ['WARNING', 'DROPPING', 'LINGERING'].includes(state.feedingEvent.phase);
  for (const squad of state.rivalSquads) {
    const config = rivalSquadConfig(squad);
    const isNewEvent = updateClaimedResource(state, squad);
    if (squad.recoverTimer > 0) squad.recoverTimer -= 1;
    let members = getRivalMembers(state, squad);
    // 一整段投食冷却已提供休整时间；新预告出现时，中断仍未走完的返程，避免错过整场争夺。
    if (active && isNewEvent && (squad.status === 'RETREATING' || squad.status === 'RECOVERING')) {
      if (members.length < config.MEMBER_COUNT) {
        deployMembers(state, squad);
        members = getRivalMembers(state, squad);
      }
      if (members.length > 0) {
        squad.status = 'APPROACHING';
        squad.recoverTimer = 0;
      }
    }
    if (active && squad.status === 'DORMANT' && members.length < config.MEMBER_COUNT) {
      deployMembers(state, squad);
      members = getRivalMembers(state, squad);
    }
    if (active && squad.status === 'RECOVERING' && squad.recoverTimer <= 0) {
      if (members.length < config.MEMBER_COUNT) {
        deployMembers(state, squad);
        members = getRivalMembers(state, squad);
      }
      // 没攒够补员资源也要带着现有成员重新参战，不能永久卡在恢复状态。
      if (members.length > 0) squad.status = 'APPROACHING';
    }
    if (active && squad.status !== 'RETREATING' && squad.status !== 'RECOVERING') {
      moveToEvent(state, squad, members);
    } else if (squad.status === 'RETREATING' || (!active && ['APPROACHING', 'CONTESTING'].includes(squad.status))) {
      squad.status = 'RETREATING';
      moveToSafety(squad, members);
    }
  }
};
