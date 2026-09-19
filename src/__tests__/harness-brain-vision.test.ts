/**
 * **台架大脑的视野规则** —— `test/brainVision.ts` 的钉子。
 *
 * 为什么这条规则配得上一个独立用例（而不是藏在切片台架里）：
 * G1 放行条件的**每一条结论**都是「换一版台架大脑就翻」的读数
 * （§22.2 操作能改变结果 / §22.9 赢得快 ≠ 死得早 / §22.10 至少两种决策 /
 * §22.11 队员没有自保 / §22.12 跑得掉吗）。而这条规则此前是**裸字面量**
 * （`e.radius > p.radius * 1.05`），一个字都没被测过，所在的文件还进不了默认套件。
 *
 * 它钉住的是一个**会制造假现象**的性质：半径相差 ±5% 以内的对手，
 * 大脑**既不躲也不追** —— 「被同级鱼磨死」这句话里，有多少是游戏难、
 * 有多少是规则写死的，全看这条带子有多宽。
 *
 * 反向验证：把 `THREAT_RADIUS_MULT` 从 1.05 改成 1.2，下面第 2、3 条立刻变红。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  THREAT_RADIUS_MULT,
  PREY_RADIUS_MULT,
  classifyByRadius,
  isThreatByRadius,
  isPreyByRadius,
  radiusVerdictBands,
} from '../test/brainVision';
import { CREATURES, CreatureType } from '../data/creatures';

const EEL_R = CREATURES[CreatureType.ELECTRIC_EEL].baseRadius;

describe('台架大脑的视野规则（brainVision）', () => {
  it('三档：> 1.05× 是威胁、< 0.95× 是猎物、中间是盲带', () => {
    expect(THREAT_RADIUS_MULT).toBe(1.05);
    expect(PREY_RADIUS_MULT).toBe(0.95);

    // 自身半径 100 时：威胁要 > 105，猎物要 < 95
    expect(classifyByRadius(100, 106)).toBe('threat');
    expect(classifyByRadius(100, 105)).toBe('ignored');
    expect(classifyByRadius(100, 96)).toBe('ignored');
    expect(classifyByRadius(100, 94)).toBe('prey');

    // 两个便捷函数必须和总分类一致（它们就是 scan() 直接调的那两个）
    expect(isThreatByRadius(100, 106)).toBe(true);
    expect(isThreatByRadius(100, 105)).toBe(false);
    expect(isPreyByRadius(100, 94)).toBe(true);
    expect(isPreyByRadius(100, 96)).toBe(false);
  });

  it('**盲带真的存在且不为空** —— 这就是「同级鱼既不躲也不追」的来源', () => {
    const bands = radiusVerdictBands(100);
    // 盲带宽度 = 100×(1/0.95 − 1/1.05) ≈ 10.03px，**不是零**
    expect(bands.ignoredTo).toBeGreaterThan(bands.ignoredFrom);
    expect(bands.ignoredTo - bands.ignoredFrom).toBeCloseTo(10.03, 1);

    // 整条带子里的每一个半径，都必须是「看不见」
    for (const self of [bands.ignoredFrom, 100, bands.ignoredTo]) {
      expect(classifyByRadius(self, 100), `自身半径 ${self} 时不该看得见同级的 100`).toBe(
        'ignored'
      );
    }
  });

  it(`电鳗（半径 ${EEL_R}）：玩家 < 28.6 是威胁，28.6~31.6 之间看不见，> 31.6 变成猎物`, () => {
    const b = radiusVerdictBands(EEL_R);
    expect(b.threatBelow).toBeCloseTo(28.57, 2);
    expect(b.preyAbove).toBeCloseTo(31.58, 2);

    expect(classifyByRadius(28.5, EEL_R)).toBe('threat');
    expect(classifyByRadius(29, EEL_R)).toBe('ignored');
    expect(classifyByRadius(30, EEL_R)).toBe('ignored');
    expect(classifyByRadius(31.5, EEL_R)).toBe('ignored');
    expect(classifyByRadius(31.6, EEL_R)).toBe('prey');
  });

  it('玩家开局半径 17（小丑鱼 t1）：电鳗是威胁，大脑会躲开它', () => {
    const clown = CREATURES[CreatureType.CLOWN_FISH];
    const startRadius = clown.baseRadius + clown.tier * 2; // initialState 的算法
    expect(startRadius).toBe(17);
    expect(classifyByRadius(startRadius, EEL_R)).toBe('threat');
  });

  it('玩家长大之后电鳗会掉进「猎物」—— 大脑**主动朝能打死它的鱼游过去**', () => {
    // 进化解锁 t3 后半径按 baseRadius 起算，随便挑一条 t3 / t4 的鱼都会超过 31.6
    for (const t of [CreatureType.STINGRAY, CreatureType.GREAT_WHITE]) {
      const r = CREATURES[t].baseRadius;
      expect(r, `${t} 的半径应当已经超过电鳗的「猎物线」`).toBeGreaterThan(31.6);
      expect(classifyByRadius(r, EEL_R), `${t}（半径 ${r}）眼里电鳗应当是猎物`).toBe('prey');
    }
  });

  it('**逐字等价于原来的裸表达式** —— 这次抽取没有改变台架的任何一次判定', () => {
    // 这是这次重构唯一真正要证的事：`scan()` 从 `e.radius > p.radius * 1.05`
    // 换成 `isThreatByRadius(...)` 之后，**历史读数必须仍然可比**。
    // 所以拿原表达式当金标准，在实用半径域上穷举比对。
    //
    // ⚠️ 不要在这个循环里逐次 `expect()`：40 万次断言会把用例拖到几十秒，
    //    而它本该是**秒级**的钉子。收集分歧、最后断言一次即可。
    const mismatches: string[] = [];
    let checked = 0;
    for (let self = 0.5; self <= 200; self += 0.5) {
      for (let other = 0.5; other <= 200; other += 0.5) {
        const threat = other > self * 1.05;
        const prey = other < self * 0.95;
        const expected = threat ? 'threat' : prey ? 'prey' : 'ignored';
        if (
          classifyByRadius(self, other) !== expected ||
          isThreatByRadius(self, other) !== threat ||
          isPreyByRadius(self, other) !== prey
        ) {
          if (mismatches.length < 10) mismatches.push(`self=${self} other=${other}`);
        }
        checked += 1;
      }
    }
    expect(mismatches, '抽取后的判定必须与裸表达式逐字一致').toEqual([]);
    expect(checked, '穷举应当真的跑过一遍').toBeGreaterThan(150000);
  });

  it('可以换**参数**跑变体（不是再抄一份规则）', () => {
    // v4 变体：只打明显比自己小的（猎物门槛 0.95 → 0.75），威胁侧一点不动 ——
    // 一次只改一个轴，否则分不清是哪个在起作用。
    const v4 = { threatMult: THREAT_RADIUS_MULT, preyMult: 0.75 };

    expect(classifyByRadius(100, 80, v4), '0.75× 之后 80 不再是猎物').toBe('ignored');
    expect(classifyByRadius(100, 80), '默认参数下它仍然算猎物').toBe('prey');
    expect(classifyByRadius(100, 74, v4)).toBe('prey');

    expect(classifyByRadius(100, 106, v4), '威胁侧必须原样').toBe('threat');
    expect(classifyByRadius(100, 105, v4)).toBe('ignored');

    const bands = radiusVerdictBands(100, v4);
    expect(bands.ignoredFrom).toBeCloseTo(95.24, 1);
    expect(bands.ignoredTo).toBeCloseTo(133.33, 1);
  });

  it('退化输入按原样落下去（不加兜底）—— NaN 落盲带、半径 0 看谁都是威胁', () => {
    // 这些是**大脑的真实行为**，不是「合理」的行为。如实钉住，免得有人后来
    // 顺手加个 `if (radius <= 0) return 'ignored'` 把台架读数改掉。
    expect(classifyByRadius(Number.NaN, 30)).toBe('ignored');
    expect(classifyByRadius(30, Number.NaN)).toBe('ignored');
    expect(classifyByRadius(0, 30)).toBe('threat');
    expect(classifyByRadius(30, 0)).toBe('prey');
    expect(classifyByRadius(-5, 30)).toBe('threat');
    // 实际不会发生：playerControl.ts 已经把 ≤0 / 非有限的玩家半径归一到 10
  });

  it('切片台架**不许**把这条规则再抄回去（两份真值 = 改了规则测试还绿着）', () => {
    const harness = resolve(dirname(fileURLToPath(import.meta.url)), 'g1-playtest-slice.test.ts');
    const src = readFileSync(harness, 'utf8');

    expect(src, '台架应当调用 brainVision 的判定，而不是自己再写一遍').toContain(
      'isThreatByRadius('
    );
    expect(src, '台架里不该再出现裸的半径倍数 —— 规则只允许有一份').not.toMatch(
      /radius\s*[<>]\s*[a-zA-Z_.]*radius\s*\*\s*0?\.9[05]/
    );
  });
});
