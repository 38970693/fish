import { ARENA_RULES, getArenaCircle, getArenaStandings } from '../data/arena';
import type { GameState } from '../types';
import { canPerceive } from './concealment';
import { canTraverseSegment } from '../core/obstacleGeometry';

export interface ArenaObjective {
  stage: number;
  title: string;
  detail: string;
  target?: { x: number; y: number };
  progress?: number;
}

/** Only one immediate instruction; danger overrides growth and score hunting. */
export const getArenaObjective = (state: GameState): ArenaObjective => {
  const { player, arena } = state;
  if (!arena) return { stage: 0, title: '', detail: '' };
  const circle = getArenaCircle(state);
  const distance = Math.hypot(player.x - arena.center.x, player.y - arena.center.y);
  const stage = circle.stage >= 3 ? 2 : player.level < 3 ? 0 : 1;
  if (distance > circle.radius - player.radius)
    return { stage, title: '先回安全区', detail: '圈外会持续掉血，沿箭头向内游', target: arena.center };
  if ((circle.warning || circle.shrinking) && distance > circle.targetRadius - player.radius - 35)
    return { stage, title: '提前进圈，保住生命', detail: '进入黄色虚线内，再继续争分', target: arena.center };
  const food = state.entities.filter(e => !e.arenaStats && e.health > 0
    && Math.hypot(e.x - arena.center.x, e.y - arena.center.y) < circle.radius - 30
    && canPerceive(player, e, (e.x - player.x) ** 2 + (e.y - player.y) ** 2)
    && canTraverseSegment(player, e, player.radius, state.obstacles))
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
  const growth = Math.max(0, player.weight - 15);
  if (stage === 0) return { stage, title: '吃磷虾，解锁技能',
    detail: `${Math.min(ARENA_RULES.growthPerLevel, Math.floor(growth))} / ${ARENA_RULES.growthPerLevel} 成长 · 到 Lv.3 解锁右键和 Q`,
    progress: Math.min(1, growth / ARENA_RULES.growthPerLevel), target: food };
  const rank = getArenaStandings(state).find(c => c.body === player)!.rank;
  if (stage === 2) return { stage, title: rank === 1 ? '守住第一名' : '决赛：争取第一名',
    detail: '最后存活直接获胜；到时按竞技分排名' };
  return { stage, title: '吃食物攒分，找机会淘汰对手',
    detail: '食物 +1 分 · 淘汰 +50 分 · 保持在安全区内', target: food };
};
