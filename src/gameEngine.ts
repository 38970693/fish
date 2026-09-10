/**
 * 游戏引擎入口 —— 现在只做编排，不含任何具体玩法逻辑。
 *
 * 重构前：991 行的 updateGame，移动 / AI / 战斗 / 技能 / 道具 / 宝藏全挤在一个函数里。
 * 重构后：这里只负责
 *   1. 组装每帧上下文（鼠标、按键、屏幕尺寸、事件总线）
 *   2. 按顺序跑 systems/index.ts 里登记的系统
 *   3. 启动时做一次数据自检
 *
 * 对外导出保持与重构前完全一致，App.tsx / GameCanvas 无需改动。
 */

import { EventBus } from './core/EventBus';
import { runSystems } from './systems';
import { GameStatus } from './types';
import type { GameState, FrameContext, GameEvents } from './types';

import { createEntity } from './systems/spawn';
import { createObstacles, createBuildings, createPortals } from './systems/world';
import { createParticle } from './systems/combat';
import { getMapBoundaryRadius } from './systems/terrain';
import { validateCreatures, CREATURE_DATA } from './data/creatures';
import { SKILL_DATA } from './data/skills';
import { validateSkills } from './systems/skills';

export { createEntity, createObstacles, createBuildings, createPortals, createParticle, getMapBoundaryRadius };

/** 全局事件总线：音效、统计、成就等外部系统订阅它，不侵入玩法逻辑 */
export const gameEvents = new EventBus<GameEvents>();

/* ══════════════ 启动自检 ══════════════ */

let selfCheckDone = false;

/**
 * 把数据错误在启动第一帧就报出来。
 * 以前这类问题只能靠玩家发现（比如魔鬼鱼按右键毫无反应）。
 */
function runSelfCheck(): void {
  if (selfCheckDone) return;
  selfCheckDone = true;

  const creatureProblems = validateCreatures(Object.keys(SKILL_DATA));
  const skillProblems = validateSkills();
  const all = [...creatureProblems, ...skillProblems];

  if (all.length === 0) {
    console.info(
      `%c[欢乐鱼塘] 数据自检通过 · ${Object.keys(CREATURE_DATA).length} 种生物 · ${Object.keys(SKILL_DATA).length} 个技能`,
      'color:#4ade80'
    );
    return;
  }

  console.warn(`[欢乐鱼塘] 数据自检发现 ${all.length} 个问题：`);
  for (const p of all) console.warn(`  · ${p}`);
}

/* ══════════════ 主循环 ══════════════ */

/**
 * 推进一帧。签名与重构前保持一致，App.tsx 不需要改。
 */
export const updateGame = (
  state: GameState,
  mouse: { x: number; y: number },
  isSpacePressed: boolean,
  isMouseDown: boolean,
  isRightMouseDown: boolean,
  screenWidth: number,
  screenHeight: number,
  /** Q 键：释放流派技能（P1-3）。可选参数，老调用方不传也能跑 */
  isQPressed: boolean = false,
  /** E 键：交互确认（进商场换装）。可选参数，老调用方不传视为未按 */
  isInteractPressed: boolean = false
): GameState => {
  // 只在游玩状态下推进世界：菜单 / 进化选择 / 商场换装 / 胜负结算全部暂停
  if (state.status !== GameStatus.PLAYING && state.status !== GameStatus.BATTLE_TEST) return state;

  runSelfCheck();

  state.time++;

  const ctx: FrameContext = {
    mouse,
    input: {
      space: isSpacePressed,
      mouseDown: isMouseDown,
      rightMouseDown: isRightMouseDown,
      q: isQPressed,
      interact: isInteractPressed,
    },
    screen: { width: screenWidth, height: screenHeight },
    events: gameEvents,
    dt: 1,
  };

  runSystems(state, ctx);

  return state;
};

/**
 * 手动切换战队成员。
 * ⚠️ 战队系统尚未实现（见 开发路线图.md P2-6），这里保持返回 false 表示「没有可切换的成员」，
 *    调用方拿到 false 就不做后续处理，不会出错。
 */
export const manualSquadSwitch = (_state: GameState): boolean => false;
