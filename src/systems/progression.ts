/**
 * 进度与收尾系统 —— 死亡判定、进化检查、粒子与飘字回收、相机跟随。
 *
 * 放在每帧最后执行，负责「打扫战场」。
 */

import { EVOLUTION_THRESHOLDS } from '../data/world';
import { pickEvolveOptions } from '../data/creatures';
import { recordRun } from './leaderboard';
import { GameStatus } from '../types';
import type { GameState, FrameContext } from '../types';
import { tryPossessOnDeath } from './squad';

export const progressionSystem = (state: GameState, ctx: FrameContext): void => {
  const player = state.player;

  /* ── 1. 粒子推进与回收 ── */
  for (const p of state.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.02;
  }
  if (state.particles.some((p) => p.life <= 0)) {
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  /* ── 2. 飘字回收（重构前只 push 不清理，会无限堆积） ── */
  for (const l of state.labels) {
    if (l.timer === undefined) l.timer = 60;
    l.timer -= 1;
  }
  if (state.labels.some((l) => (l.timer ?? 0) <= 0)) {
    state.labels = state.labels.filter((l) => (l.timer ?? 0) > 0);
  }

  /* ── 3. 死亡判定 ── */
  // 无敌模式是绝对承诺：万一将来又出现绕过统一伤害入口的路径，也绝不在这里判死。
  // （主因是沼泽腐蚀绕过 dealDamage，已修；这道闸是「无敌还会失败」的兜底。）
  if (player.isGodMode && player.health <= 0) {
    player.health = 1; // 血条不显示负数，也不会掉进下面的死亡分支
  }
  if (player.health <= 0 && state.status === GameStatus.PLAYING) {
    // 亡语机制（提示词 #234 / #245）：只要队里还有人，就夺舍半径最大的成员继续游戏，
    // 而不是直接结算。没有成员可夺舍了，才干净地切到 GAME_OVER（#294）。
    if (tryPossessOnDeath(state)) {
      // 夺舍不发作废的死亡音效/事件：旧身体是没了，但玩家还活着
      state.labels.push({
        x: player.x,
        y: player.y - 60,
        text: '亡语 · 夺舍！',
        color: '#22d3ee',
        timer: 90,
      });
      for (let i = 0; i < 20; i += 1) {
        state.particles.push({
          id: `possess-${state.time}-${i}`,
          x: player.x,
          y: player.y,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          life: 1,
          maxLife: 1,
          color: '#22d3ee',
          size: Math.random() * 3 + 2,
        });
      }
      return;
    }

    state.status = GameStatus.GAME_OVER;
    recordRun(state); // 本地排行榜：死亡即落榜（同一局复活再死会原地刷新，不会重复）
    ctx.events.emit('death', { victim: player });
    return;
  }

  /* ── 4. 进化检查 ── */
  const nextThreshold = EVOLUTION_THRESHOLDS.find((t) => t.tier === player.config.tier + 1);
  // `status !== EVOLVING` 是幂等门闸：已经在进化界面里就别再抽一次 —— 否则系统被重复调用时
  // 候选会被重新洗牌、'evolve' 事件也会重复发（成就重复计数）。有它，本次抽取才是「一局一次」。
  if (
    nextThreshold &&
    player.evolutionPoints >= nextThreshold.weight &&
    state.status !== GameStatus.EVOLVING
  ) {
    // ⚠️ 进化候选**只在这里抽一次**，存成快照给 UI 渲染。
    //    候选要洗牌、还依赖当时的吃鱼历史，如果放 UI 渲染期现算，100ms 一次的状态同步
    //    会让候选每秒变脸 10 次（2026-09-13 用户反馈「后面两个选项一直在变化」）。见 types.ts。
    state.evolveOptions = pickEvolveOptions({
      nextTier: player.config.tier + 1,
      eatenHistory: player.eatenHistory,
      currentBiome: player.currentBiome,
      fallbackBiome: player.config.nativeBiome,
    });
    state.status = GameStatus.EVOLVING;
    ctx.events.emit('evolve', { entity: player });
    return;
  }

  /* ── 5. 相机平滑跟随 ── */
  state.camera.x += (player.x - state.camera.x) * 0.1;
  state.camera.y += (player.y - state.camera.y) * 0.1;
};
