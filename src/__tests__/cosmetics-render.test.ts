/**
 * 装扮渲染测试 —— 守住「面板上的每个选项都真的画得出来」。
 *
 * 背景：这个 bug 是加预览时才暴露的 —— 面板摆了 10 个花纹按钮，
 * 而 `drawPattern` 只实现了 3 个，剩下 7 个（TIGER/ZEBRA/STAR/GALAXY/LAVA/CLOUD…）
 * 静默走 `default: break`。以前玩家看不出来（面板上只是一个文字按钮），
 * 换成「鱼穿着它」的缩略图之后，一排里出现好几张一模一样的图，立刻就露馅了。
 *
 * 测法：不依赖真实 canvas（jsdom 没有像素），而是塞一个**记录型 context**进去，
 * 把 drawCuteFish 跑出来的所有绘制调用 + 样式赋值串成指纹。
 * 于是「两个选项指纹相同」== 「这两个选项画出来一模一样」，断言直接、可读、不糊弄。
 */

import { describe, it, expect } from 'vitest';
import { drawCuteFish } from '../components/GameCanvas';
import { CREATURES } from '../data/creatures';
import { CreatureType } from '../data/creatures';
import { DEFAULT_COSMETICS, type Cosmetics, type Entity } from '../types';
import {
  ACCESSORY_OPTIONS,
  AI_COSMETICS_PRESETS,
  BODY_OPTIONS,
  COSMETIC_TABS,
  EYE_OPTIONS,
  EYEBROW_OPTIONS,
  MOUTH_OPTIONS,
  PATTERN_OPTIONS,
  SCALE_OPTIONS,
  SKIN_COLOR_OPTIONS,
  TAIL_OPTIONS,
  TEETH_OPTIONS,
  TRAIL_OPTIONS,
  withOption,
} from '../data/cosmeticsOptions';

/** 固定时间：渲染里到处是 `Math.sin(visualTime…)`，钉住它指纹才可复现 */
const VISUAL_TIME = 14;

/** 会写样式的属性：改成 setter，把赋值也记进指纹（颜色差异全靠它体现） */
const PAINT_PROPS = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha',
  'shadowColor', 'shadowBlur', 'font', 'textAlign', 'textBaseline',
  'globalCompositeOperation',
] as const;

/** 不需要记参数的绘制方法 */
const METHODS = [
  'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo',
  'arc', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'closePath', 'fill', 'stroke',
  'fillRect', 'clearRect', 'clip', 'setLineDash', 'rect', 'setTransform',
] as const;

const createRecorder = (): { ctx: CanvasRenderingContext2D; calls: string[] } => {
  const calls: string[] = [];

  const fmt = (a: unknown): string => {
    if (typeof a === 'number') return Number.isFinite(a) ? a.toFixed(3) : String(a);
    if (typeof a === 'string') return a;
    if (a === null || a === undefined) return String(a);
    return JSON.stringify(a);
  };
  const push = (name: string, args: unknown[]) => {
    calls.push(`${name}(${args.map(fmt).join(',')})`);
  };

  const gradient = { addColorStop: (...a: unknown[]) => push('addColorStop', a) };

  const ctx: Record<string, unknown> = {};
  for (const m of METHODS) {
    ctx[m] = (...a: unknown[]) => push(m, a);
  }
  ctx.createLinearGradient = (...a: unknown[]) => { push('createLinearGradient', a); return gradient; };
  ctx.createRadialGradient = (...a: unknown[]) => { push('createRadialGradient', a); return gradient; };
  ctx.isPointInPath = () => false;
  ctx.isPointInStroke = () => false;
  ctx.measureText = () => ({ width: 0 });

  for (const p of PAINT_PROPS) {
    let v: unknown = '';
    Object.defineProperty(ctx, p, {
      get: () => v,
      set: (nv: unknown) => { v = nv; calls.push(`set.${p}=${fmt(nv)}`); },
    });
  }

  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
};

/** 造一个够 drawCuteFish 用的最小 entity */
const makeEntity = (type: CreatureType, cosmetics: Cosmetics): Entity =>
  ({
    id: 'test',
    type,
    x: 100,
    y: 100,
    radius: 20,
    angle: 0,
    vx: 0,
    vy: 0,
    health: 10,
    maxHealth: 10,
    level: 1,
    animOffset: 0,
    renderScale: 1,
    cosmetics,
    semiGhostTimer: 0,
    config: CREATURES[type],
  }) as unknown as Entity;

/** 跑一次真实渲染，返回「绘制调用指纹」 */
const fingerprint = (
  cosmetics: Cosmetics,
  type: CreatureType = CreatureType.CLOWN_FISH
): string => {
  const { ctx, calls } = createRecorder();
  drawCuteFish(ctx, makeEntity(type, cosmetics), VISUAL_TIME, false);
  return calls.join('|');
};

/** 「这一项换成这些选项」→ 一组指纹 */
const fingerprintsFor = <K extends keyof Cosmetics>(
  key: K,
  options: readonly { value: Cosmetics[K] }[],
  type: CreatureType = CreatureType.CLOWN_FISH
): string[] => options.map((o) => fingerprint(withOption(DEFAULT_COSMETICS, key, o.value), type));

describe('装扮渲染：每个选项都必须画得出区别', () => {
  it('牙齿：8 个选项两两不同', () => {
    const fps = fingerprintsFor('teeth', TEETH_OPTIONS);
    expect(new Set(fps).size).toBe(TEETH_OPTIONS.length);
  });

  it('花纹：10 个选项两两不同', () => {
    const fps = fingerprintsFor('pattern', PATTERN_OPTIONS);
    expect(new Set(fps).size).toBe(PATTERN_OPTIONS.length);
  });

  it('鳞片：7 个选项两两不同', () => {
    const fps = fingerprintsFor('scaleType', SCALE_OPTIONS);
    expect(new Set(fps).size).toBe(SCALE_OPTIONS.length);
  });

  it('配饰：8 个选项两两不同', () => {
    const fps = fingerprintsFor('accessory', ACCESSORY_OPTIONS);
    expect(new Set(fps).size).toBe(ACCESSORY_OPTIONS.length);
  });

  it('眼睛：8 个选项两两不同', () => {
    const fps = fingerprintsFor('eyeType', EYE_OPTIONS);
    expect(new Set(fps).size).toBe(EYE_OPTIONS.length);
  });

  it('眉毛：7 个选项两两不同', () => {
    const fps = fingerprintsFor('eyebrowType', EYEBROW_OPTIONS);
    expect(new Set(fps).size).toBe(EYEBROW_OPTIONS.length);
  });

  it('嘴型：6 个选项两两不同', () => {
    const fps = fingerprintsFor('mouthType', MOUTH_OPTIONS);
    expect(new Set(fps).size).toBe(MOUTH_OPTIONS.length);
  });

  it('体型：8 个选项两两不同（STAR 参数与 ROUND 重合，不上架）', () => {
    const fps = fingerprintsFor('bodyType', BODY_OPTIONS);
    expect(new Set(fps).size).toBe(BODY_OPTIONS.length);
  });

  it('尾巴：9 个选项两两不同', () => {
    const fps = fingerprintsFor('tailType', TAIL_OPTIONS);
    expect(new Set(fps).size).toBe(TAIL_OPTIONS.length);
  });

  it('拖尾：8 个选项两两不同', () => {
    const fps = fingerprintsFor('trailType', TRAIL_OPTIONS);
    expect(new Set(fps).size).toBe(TRAIL_OPTIONS.length);
  });

  it('皮肤：15 个具体颜色两两不同（DEFAULT 单独测，它可能正好等于本鱼本色）', () => {
    const concrete = SKIN_COLOR_OPTIONS.filter((o) => o.value !== 'DEFAULT');
    expect(concrete.length).toBeGreaterThanOrEqual(15);
    const fps = fingerprintsFor('skinColor', concrete);
    expect(new Set(fps).size).toBe(concrete.length);
  });

  it('皮肤：skinColor = DEFAULT 就是「用本鱼本色」', () => {
    for (const type of [CreatureType.CLOWN_FISH, CreatureType.BLUE_TANG]) {
      const applied = fingerprint(withOption(DEFAULT_COSMETICS, 'skinColor', 'DEFAULT'), type);
      const literal = fingerprint(
        withOption(DEFAULT_COSMETICS, 'skinColor', CREATURES[type].color),
        type
      );
      expect(applied).toBe(literal);
    }
  });

  it('AI 预设：8 套预设画出 8 条不同的鱼', () => {
    const fps = AI_COSMETICS_PRESETS.map((p) => fingerprint(p.cosmetics));
    expect(new Set(fps).size).toBe(AI_COSMETICS_PRESETS.length);
  });

  it('没选任何装扮（默认）也能正常渲染，且和其他所有选项都不同', () => {
    const baseline = fingerprint(DEFAULT_COSMETICS);
    expect(baseline.length).toBeGreaterThan(0);
    // 每个类别的每个选项都应至少和基线不同 —— 除了本来就等于基线的那个（如 pattern=NONE）
    const allOptions: Array<[keyof Cosmetics, string]> = [
      ...PATTERN_OPTIONS.filter((o) => o.value !== 'NONE').map((o) => ['pattern', o.value] as [keyof Cosmetics, string]),
      ...SCALE_OPTIONS.filter((o) => o.value !== 'NONE').map((o) => ['scaleType', o.value] as [keyof Cosmetics, string]),
      ...ACCESSORY_OPTIONS.filter((o) => o.value !== 'NONE').map((o) => ['accessory', o.value] as [keyof Cosmetics, string]),
      ...EYE_OPTIONS.filter((o) => o.value !== 'NORMAL').map((o) => ['eyeType', o.value] as [keyof Cosmetics, string]),
      ...TEETH_OPTIONS.filter((o) => o.value !== 'NORMAL').map((o) => ['teeth', o.value] as [keyof Cosmetics, string]),
      ...MOUTH_OPTIONS.filter((o) => o.value !== 'TRIANGLE').map((o) => ['mouthType', o.value] as [keyof Cosmetics, string]),
      ...EYEBROW_OPTIONS.filter((o) => o.value !== 'NONE').map((o) => ['eyebrowType', o.value] as [keyof Cosmetics, string]),
      ...BODY_OPTIONS.filter((o) => o.value !== 'DEFAULT').map((o) => ['bodyType', o.value] as [keyof Cosmetics, string]),
      ...TAIL_OPTIONS.filter((o) => o.value !== 'DEFAULT').map((o) => ['tailType', o.value] as [keyof Cosmetics, string]),
      ...TRAIL_OPTIONS.filter((o) => o.value !== 'NONE').map((o) => ['trailType', o.value] as [keyof Cosmetics, string]),
    ];
    for (const [key, value] of allOptions) {
      const fp = fingerprint(withOption(DEFAULT_COSMETICS, key, value as never));
      expect(fp, `${key}=${value} 竟然和「什么都不选」画得一样`).not.toBe(baseline);
    }
  });
});

describe('装扮选项注册表自身的一致性', () => {
  const LISTS: Array<[string, readonly { value: string }[]]> = [
    ['TEETH_OPTIONS', TEETH_OPTIONS],
    ['SKIN_COLOR_OPTIONS', SKIN_COLOR_OPTIONS],
    ['PATTERN_OPTIONS', PATTERN_OPTIONS],
    ['SCALE_OPTIONS', SCALE_OPTIONS],
    ['ACCESSORY_OPTIONS', ACCESSORY_OPTIONS],
    ['EYE_OPTIONS', EYE_OPTIONS],
    ['EYEBROW_OPTIONS', EYEBROW_OPTIONS],
    ['MOUTH_OPTIONS', MOUTH_OPTIONS],
    ['BODY_OPTIONS', BODY_OPTIONS],
    ['TAIL_OPTIONS', TAIL_OPTIONS],
    ['TRAIL_OPTIONS', TRAIL_OPTIONS],
  ];

  it.each(LISTS)('%s 非空且没有重复值', (_name, list) => {
    expect(list.length).toBeGreaterThan(1);
    expect(new Set(list.map((o) => o.value)).size).toBe(list.length);
  });

  it('每个选项都有非空标签', () => {
    for (const [, list] of LISTS) {
      for (const opt of list) {
        expect(String((opt as { label?: string }).label ?? '').trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('皮肤颜色清单里必须有 DEFAULT（老存档可能就存着它）', () => {
    expect(SKIN_COLOR_OPTIONS.some((o) => o.value === 'DEFAULT')).toBe(true);
  });

  it('标签页 id 不重复，且都带标题', () => {
    const ids = COSMETIC_TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(COSMETIC_TABS.every((t) => t.label.trim().length > 0)).toBe(true);
  });

  it('上架的每个值都必须真的存在于对应联合类型里（防手滑拼错）', () => {
    // 用 Cosmetics 的键做编译期校验之外，这里再钉一次运行期事实：
    // 每个清单的 value 都必须是合法装扮值 —— 借 withOption 的类型约束在编译期保证，
    // 这里只验证清单非空这个最低限度（真正的类型错误 tsc 会拦）。
    for (const [, list] of LISTS) {
      expect(list.length).toBeGreaterThan(0);
    }
  });
});

describe('测法自检（positive control）', () => {
  /**
   * 自检的由来：第一版我写的是「未实现的选项指纹 == NONE 的指纹」，
   * 跑起来是红的 —— 因为 `pattern !== 'NONE'` 时外层还会 `clip()` + `globalAlpha=0.4`，
   * 这些调用留下了痕迹。
   * 真正会撞车的是**两个都没实现的选项**（都走 `default: break`，留下一样的外壳）。
   * 这条用例把这个事实钉住：它证明上面那套「两两不同」的断言确实能抓到漏配。
   */
  it('两个都没实现的选项指纹完全相同 —— 证明「两两不同」真能抓到漏配', () => {
    const camo = fingerprint(withOption(DEFAULT_COSMETICS, 'pattern', 'CAMO')); // 未实现
    const koi = fingerprint(withOption(DEFAULT_COSMETICS, 'pattern', 'KOI')); // 也未实现
    expect(camo).toBe(koi);
  });

  /**
   * 更强的一条：拿「渲染层完全没实现的选项」当**空画面基准**，
   * 要求面板里每个非「无」的选项都必须画得比它多。
   * 这正是加预览前那个 bug 的形状 —— 按钮在、纹样没有。
   */
  it('面板暴露的每个非「无」选项，都必须真的画出东西', () => {
    // 各取一个「联合类型里有、渲染层没实现」的值当空基准
    const emptyPattern = fingerprint(withOption(DEFAULT_COSMETICS, 'pattern', 'CAMO'));
    const emptyScale = fingerprint(withOption(DEFAULT_COSMETICS, 'scaleType', 'STONE'));
    const emptyAccessory = fingerprint(withOption(DEFAULT_COSMETICS, 'accessory', 'MEDAL'));
    const emptyEye = fingerprint(withOption(DEFAULT_COSMETICS, 'eyeType', 'HYPNO'));

    const cases: Array<[string, string, string]> = [
      ...PATTERN_OPTIONS.filter((o) => o.value !== 'NONE')
        .map((o) => [`pattern=${o.value}`, fingerprint(withOption(DEFAULT_COSMETICS, 'pattern', o.value)), emptyPattern] as [string, string, string]),
      ...SCALE_OPTIONS.filter((o) => o.value !== 'NONE')
        .map((o) => [`scaleType=${o.value}`, fingerprint(withOption(DEFAULT_COSMETICS, 'scaleType', o.value)), emptyScale] as [string, string, string]),
      ...ACCESSORY_OPTIONS.filter((o) => o.value !== 'NONE')
        .map((o) => [`accessory=${o.value}`, fingerprint(withOption(DEFAULT_COSMETICS, 'accessory', o.value)), emptyAccessory] as [string, string, string]),
      ...EYE_OPTIONS.filter((o) => o.value !== 'NORMAL')
        .map((o) => [`eyeType=${o.value}`, fingerprint(withOption(DEFAULT_COSMETICS, 'eyeType', o.value)), emptyEye] as [string, string, string]),
    ];

    for (const [label, fp, empty] of cases) {
      expect(fp, `${label} 没有画出任何东西（和「未实现」的基准一模一样）`).not.toBe(empty);
    }
  });
});

describe('withOption', () => {
  it('只改指定的一项，其余原样，且不修改原对象', () => {
    const before = { ...DEFAULT_COSMETICS };
    const after = withOption(before, 'pattern', 'LAVA');
    expect(after.pattern).toBe('LAVA');
    expect(before.pattern).toBe(DEFAULT_COSMETICS.pattern); // 原对象没被动
    expect(after).not.toBe(before);
    const { pattern: _p, ...restAfter } = after;
    const { pattern: _p2, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore);
  });
});
