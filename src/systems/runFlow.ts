/**
 * 「鱼群争霸」对局流程系统（G0 / FQ-02）
 *
 * 职责很窄，就三件：
 *   ① 推进阶段时钟（只在正常游玩中走）
 *   ② 阶段切换时发事件 + 给一句飘字（开发期对照试玩时能看出走到哪个阶段了）
 *   ③ 维护「练习局」标记（无敌 / 手动续命 → 不进正式排行）
 *
 * ⚠️ **旧模式整段空转**：`state.run` 缺省就 `return`，一行都不执行。
 *    这是「两种模式共用引擎、差异集中配置」的落点 —— 不是复制一套循环。
 *
 * ⚠️ 时钟只在 PLAYING 推进：进化面板、商店、结算界面期间世界是冻结的
 *    （`updateGame` 非 PLAYING 直接 return），时钟要是照走，
 *    玩家一挂机看面板就会「时间流逝但什么都没发生」，阶段节奏失真。
 *
 * ⚠️ 注册位置在 `systems/index.ts` 的**最前面**：阶段决定本帧的目标与压力等级，
 *    后续 G2/G4 的争夺事件导演和塘主逻辑都要读当前阶段，必须比它们先更新。
 */

import { getRunPhase, RUN_PHASE_DATA } from '../data/runRules';
import { GameStatus } from '../types';
import type { GameState, FrameContext } from '../types';

/**
 * 标记练习局 —— 无敌模式或手动续命这类「非正式」对局，不计入正式排行。
 *
 * 幂等：已标记过就直接返回，不重复推飘字（`isGodMode` 每帧都为真，会被高频调用）。
 * 旧模式没有 `run`，整体空转 → 旧规则（手动复活照样记榜）完整保留。
 */
export const markRunPractice = (state: GameState, reason: string): void => {
  const run = state.run;
  if (!run || run.practice) return;

  run.practice = true;
  run.practiceReason = reason;
  state.labels.push({
    x: state.player.x,
    y: state.player.y - 70,
    text: `练习局 · ${reason} · 不计入排行`,
    color: '#facc15',
    timer: 150,
  });
};

/** 对局流程：阶段时钟 + 阶段切换提示 + 练习标记 */
export const runFlowSystem = (state: GameState, ctx: FrameContext): void => {
  const run = state.run;
  if (!run) return; // 旧模式：零开销

  if (state.status !== GameStatus.PLAYING) return; // 面板/结算期间不推进节奏

  run.clock += 1;

  // 粘性：开过一次无敌，整局都算练习（关掉无敌也不会「洗白」）
  if (state.player.isGodMode) markRunPractice(state, '无敌模式');

  const phase = getRunPhase(run.clock);
  if (phase === run.phase) return;

  run.phase = phase;
  const cfg = RUN_PHASE_DATA[phase];
  ctx.events.emit('runPhase', { phase, name: cfg.name, clock: run.clock });
  state.labels.push({
    x: state.player.x,
    y: state.player.y - 90,
    text: `${cfg.name} · ${cfg.goal}`,
    color: cfg.color,
    timer: 150,
  });
};
