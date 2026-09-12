/**
 * 系统注册表 —— 整个引擎的装配清单。
 *
 * 想加一个新玩法（比如天气、任务、成就），标准姿势是：
 *   1. 在 systems/ 下新建一个文件，导出 `xxxSystem(state, ctx)`
 *   2. 在下面的 SYSTEMS 列表里挑个位置插一行
 * 不用再往那个 991 行的巨型函数里塞代码。
 *
 * 数组顺序 = 执行顺序。每个系统都被 safe() 包裹，
 * 单个系统崩了只会被摘除，不会把整个游戏循环带走。
 */

import { safe } from '../core/errors';
import type { GameState, FrameContext } from '../types';

import { spawnSystem } from './spawn';
import { playerControlSystem } from './playerControl';
import { skillsSystem } from './skills';
import { concealmentSystem } from './concealment';
import { aiSystem } from './ai';
import { squadSystem } from './squad';
import { worldSystem } from './world';
import { itemsSystem } from './items';
import { combatSystem } from './combat';
import { eventsSystem } from './events';
import { pondEventSystem } from './pondEvents';
import { progressionSystem } from './progression';
import { achievementsSystem } from './achievements';

export interface SystemEntry {
  name: string;
  fn: (state: GameState, ctx: FrameContext) => void;
}

/**
 * 执行顺序说明：
 *   spawn       补货
 *   control     玩家先动（技能要基于最新朝向）
 *   skills      放技能
 *   concealment 结算隐蔽状态（水草掩体 / 隐身技能）—— **必须在 ai 之前**，
 *               否则 AI 当帧读到的是上一帧的 `inCover`，钻草丛那一帧会被追打
 *   ai          鱼群思考
 *   squad       战队：把俘虏落地成实体 + 成员跟随（必须紧接 ai 之后，且 ai 会跳过战队成员）
 *   world       统一处理边界 / 障碍 / 生态 / 建筑 / 传送门（放在移动之后，避免被移动覆盖）
 *   items       道具与鱼雷
 *   combat      碰撞结算（放在移动之后才准）
 *   events      宝藏 / 陨石 / 喷泉
 *   pondEvent   塘专属事件（珊瑚产卵夜 / 星光鱼群潮）
 *   cleanup     死亡判定 / 进化 / 粒子回收 / 相机
 */
export const SYSTEMS: SystemEntry[] = [
  { name: 'spawn', fn: safe('spawn', spawnSystem) },
  { name: 'playerControl', fn: safe('playerControl', playerControlSystem) },
  { name: 'skills', fn: safe('skills', skillsSystem) },
  { name: 'concealment', fn: safe('concealment', concealmentSystem) },
  { name: 'ai', fn: safe('ai', aiSystem) },
  { name: 'squad', fn: safe('squad', squadSystem) },
  { name: 'world', fn: safe('world', worldSystem) },
  { name: 'items', fn: safe('items', itemsSystem) },
  { name: 'combat', fn: safe('combat', combatSystem) },
  { name: 'events', fn: safe('events', eventsSystem) },
  { name: 'pondEvent', fn: safe('pondEvent', pondEventSystem) },
  { name: 'achievements', fn: safe('achievements', achievementsSystem) },
  { name: 'progression', fn: safe('progression', progressionSystem) },
];

/** 动态插入系统：给 mod / 实验性玩法留的口子 */
export function registerSystem(
  name: string,
  fn: (state: GameState, ctx: FrameContext) => void,
  at?: number
): void {
  const entry: SystemEntry = { name, fn: safe(name, fn) };
  if (at === undefined || at >= SYSTEMS.length) SYSTEMS.push(entry);
  else SYSTEMS.splice(Math.max(0, at), 0, entry);
}

/** 顺序执行所有系统 */
export function runSystems(state: GameState, ctx: FrameContext): void {
  for (const system of SYSTEMS) {
    system.fn(state, ctx);
  }
}

export { spawnSystem, playerControlSystem, skillsSystem, concealmentSystem, aiSystem, squadSystem, worldSystem, itemsSystem, combatSystem, eventsSystem, pondEventSystem, achievementsSystem, progressionSystem };
