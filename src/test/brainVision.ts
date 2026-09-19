/**
 * **台架大脑的「视野」规则** —— 一个实体在它眼里是威胁、猎物，还是**根本不存在**。
 *
 * 抽出来单独放，是因为这条规则现在**扛着 G1 放行条件的全部结论**：
 * §22.2（操作能改变结果）/ §22.9（赢得快 ≠ 死得早）/ §22.10（至少两种决策）/
 * §22.11（队员没有自保）/ §22.12（跑得掉吗）—— 每一条都是「换一版大脑就翻」的那种读数。
 * 而它此前**一个字都没有被测过**，藏在 `g1-playtest-slice.test.ts` 里，
 * 而那个文件进不了默认套件（跑一次 10 分钟）。
 *
 * ⚠️ 为什么是「抽出来」而不是「在测试里再写一份」：
 *    照抄一份的话，改了台架的规则、测试还绿着 —— 那正是这个仓库反复吃亏的「两份真值」
 *    （见 `progression.ts` 里 `applyEvolutionChoice` 抽出来的同一段理由）。
 *
 * ── 规则本身（`g1-playtest-slice.ts` 的 `scan()` 一直如此）──
 *
 *   其他半径 > 自身半径 × 1.05  →  threat  （掉头就跑 + 开加速）
 *   其他半径 < 自身半径 × 0.95  →  prey    （主动扑上去）
 *   中间那 **±5% 的一条带**     →  ignored （**既不躲、也不追，当它不存在**）
 *
 * ⚠️ 这条带子的后果比看起来严重，它直接制造了两个假的「游戏现象」：
 *    1. **「被同级鱼磨死」可能是台架自己的性质**。玩家半径和对手相差 5% 以内时，
 *       大脑对它是**完全无反应**的 —— 不会躲。所以「同级鱼能磨死玩家」这件事
 *       有一部分是**规则写死的**，不能拿来当「电鳗数值太凶」的证据。
 *    2. **反过来更危险**：玩家长大后，本来能咬死它的鱼会**掉进 prey**，
 *       于是大脑**主动朝凶手游过去**。`ELECTRIC_EEL` 半径 30，玩家半径一旦 > 31.6
 *       它就变成猎物 —— 「去打电鳗」是大脑自己选的。
 *
 * 这就是为什么「跑得掉吗 / 是被磨死的吗」这类结论**必须先说清大脑看见了什么**，
 * 否则报出来的百分比量的是台架，不是游戏。
 */

/** 判定为「威胁」的半径倍数 —— 严格大于 */
export const THREAT_RADIUS_MULT = 1.05;

/** 判定为「猎物」的半径倍数 —— 严格小于 */
export const PREY_RADIUS_MULT = 0.95;

/**
 * 大脑的「视野参数」—— 允许台架跑**变体**，而不用把规则再抄一份。
 *
 * 为什么需要它：§22.2 定下的规矩是「**换个合理的大脑参数重跑，结论还在不在**；
 * 不在，就别拿它判放行」。而 §22.13 又量出这条规则本身在制造假现象
 * （49% 的玩家死亡，凶手是大脑**主动扑上去**的猎物）。
 * 于是必须能换一版「更谨慎的猎物选择」重跑 —— 但换的是**参数**，不是规则副本。
 */
export interface BrainTuning {
  threatMult: number;
  preyMult: number;
}

/** 台架一直用的那套（±5% 盲带） */
export const DEFAULT_BRAIN_TUNING: BrainTuning = {
  threatMult: THREAT_RADIUS_MULT,
  preyMult: PREY_RADIUS_MULT,
};

/**
 * 一个实体相对自身的分类。
 *
 * `selfRadius` 是**观察者**的半径（玩家 / 队员），`otherRadius` 是被看的那个。
 *
 * ⚠️ 这里是原表达式 `other > self * 1.05` / `other < self * 0.95` 的**逐字转写**，
 *    **故意不加任何「非法输入」兜底**。加兜底会让这个函数与台架原来的行为分叉，
 *    而台架的读数是要跟历史运行对比的 —— 一个「永远不会发生」的分支，
 *    恰恰是事后最难查的那种不一致。
 *    退化输入（半径 0 / 负数 / NaN）就按原样落下去：NaN 两边比较都是 false → 盲带；
 *    半径 0 则「看谁都是威胁」。这是**大脑的真实行为**，如实记录即可
 *    （实际不会发生：`playerControl.ts` 已经把 ≤0 / 非有限的玩家半径归一到 10）。
 */
export type RadiusVerdict = 'threat' | 'prey' | 'ignored';

export const classifyByRadius = (
  selfRadius: number,
  otherRadius: number,
  tuning: BrainTuning = DEFAULT_BRAIN_TUNING
): RadiusVerdict => {
  if (otherRadius > selfRadius * tuning.threatMult) return 'threat';
  if (otherRadius < selfRadius * tuning.preyMult) return 'prey';
  return 'ignored';
};

export const isThreatByRadius = (
  selfRadius: number,
  otherRadius: number,
  tuning?: BrainTuning
): boolean => classifyByRadius(selfRadius, otherRadius, tuning) === 'threat';

export const isPreyByRadius = (
  selfRadius: number,
  otherRadius: number,
  tuning?: BrainTuning
): boolean => classifyByRadius(selfRadius, otherRadius, tuning) === 'prey';

/**
 * 给定自身半径与一个**固定半径**的对手，算出它在哪一段里是 threat / ignored / prey。
 *
 * 存在的理由：报告里要写「电鳗（半径 30）对玩家而言，半径 < 28.6 是威胁、
 * 28.6~31.6 之间看不见、> 31.6 变成猎物」这种话，而手算这三个数很容易错一位，
 * 错一位整段结论就反了。用函数算，测试也钉在函数上。
 */
export const radiusVerdictBands = (
  otherRadius: number,
  tuning: BrainTuning = DEFAULT_BRAIN_TUNING
): { threatBelow: number; ignoredFrom: number; ignoredTo: number; preyAbove: number } => ({
  /** 自身半径小于这个值 → 对方是威胁 */
  threatBelow: otherRadius / tuning.threatMult,
  /** 自身半径落在这个闭区间 → 对方既不是威胁也不是猎物（看不见） */
  ignoredFrom: otherRadius / tuning.threatMult,
  ignoredTo: otherRadius / tuning.preyMult,
  /** 自身半径大于这个值 → 对方变成猎物 */
  preyAbove: otherRadius / tuning.preyMult,
});
