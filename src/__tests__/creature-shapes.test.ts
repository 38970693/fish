/**
 * 生物形状渲染测试 —— 守住「水母像水母、蟹像蟹」。
 *
 * 姊妹篇是 cosmetics-render.test.ts（装扮指纹），这里换一个维度：
 * **形状模板**。每个 shape 用同一个生物（小丑鱼）+ 同一份默认装扮渲染，
 * 断言所有形状两两不同 —— 如果两个形状撞指纹，说明某个模板退化成了
 * 「换了个名字的椭圆」。
 *
 * 同时钉住向后兼容：config 没有 shape 字段 == shape 'FISH'（旧调用点零变化），
 * 以及非鱼形的公约：不吃装扮尾巴、表面嘴响应嘴型装扮。
 */

import { describe, it, expect } from 'vitest';
import { drawCuteFish } from '../components/GameCanvas';
import { CREATURES, CREATURE_DATA, validateCreatures, SPAWN_POOL_BY_TIER, CreatureType } from '../data/creatures';
import { SKILL_DATA } from '../data/skills';
import { SHAPE_DATA, type CreatureShapeId } from '../data/creatureShapes';
import { DEFAULT_COSMETICS, type Cosmetics, type Entity } from '../types';

const VISUAL_TIME = 14;

const PAINT_PROPS = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha',
  'shadowColor', 'shadowBlur', 'font', 'textAlign', 'textBaseline',
  'globalCompositeOperation',
] as const;

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
  for (const m of METHODS) ctx[m] = (...a: unknown[]) => push(m, a);
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

const makeEntity = (type: CreatureType, cosmetics: Cosmetics, shape?: string): Entity =>
  ({
    id: 'test',
    type,
    x: 100,
    y: 100,
    radius: 30,
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
    lureActive: false,
    config: shape === undefined
      ? { ...CREATURES[type], shape: undefined } // 模拟手工构造的旧 config：没有 shape 字段
      : { ...CREATURES[type], shape },
  }) as unknown as Entity;

const fingerprint = (entity: Entity): string => {
  const { ctx, calls } = createRecorder();
  drawCuteFish(ctx, entity, VISUAL_TIME, false);
  return calls.join('|');
};

const shapeFingerprint = (shape: string, cosmetics: Cosmetics = DEFAULT_COSMETICS): string =>
  fingerprint(makeEntity('CLOWN_FISH', cosmetics, shape));

describe('形状渲染：每个模板都必须画得出区别', () => {
  const allShapes = Object.keys(SHAPE_DATA) as CreatureShapeId[];

  it('形状注册表覆盖全部 20 个模板', () => {
    expect(allShapes.length).toBe(20);
  });

  it('所有形状两两不同（撞指纹 = 有模板退化成了普通椭圆）', () => {
    const fps = allShapes.map((s) => shapeFingerprint(s));
    expect(new Set(fps).size).toBe(allShapes.length);
  });

  it('向后兼容：config 没有 shape 字段 == shape FISH（旧调用点零变化）', () => {
    const legacy = fingerprint(makeEntity('CLOWN_FISH', DEFAULT_COSMETICS, undefined));
    expect(legacy).toBe(shapeFingerprint('FISH'));
  });

  it('每种生物认领的形状都真实存在（validateCreatures 校验 shape 引用）', () => {
    const problems = validateCreatures(Object.keys(SKILL_DATA));
    expect(problems).toEqual([]);
    // 双保险：逐条检查 config.shape 都在注册表里
    for (const config of Object.values(CREATURES)) {
      expect(SHAPE_DATA, `${config.type} 的形状 ${config.shape} 未注册`).toHaveProperty(config.shape ?? 'FISH');
    }
  });

  it('深海新物种进了正确的生成池', () => {
    expect(SPAWN_POOL_BY_TIER[2]).toContain('VAMPIRE_SQUID');
    expect(SPAWN_POOL_BY_TIER[3]).toContain('OARFISH');
    expect(SPAWN_POOL_BY_TIER[3]).toContain('GOBLIN_SHARK');
  });

  it('非鱼形公约：装扮尾巴被忽略（水母配扇尾 == 水母默认）', () => {
    const withFan = shapeFingerprint('JELLY', { ...DEFAULT_COSMETICS, tailType: 'FAN' });
    const plain = shapeFingerprint('JELLY');
    expect(withFan).toBe(plain);
    // 对照组：鱼形确实吃装扮尾巴
    const fishFan = fingerprint(makeEntity('CLOWN_FISH', { ...DEFAULT_COSMETICS, tailType: 'FAN' }, 'FISH'));
    const fishPlain = fingerprint(makeEntity('CLOWN_FISH', DEFAULT_COSMETICS, 'FISH'));
    expect(fishFan).not.toBe(fishPlain);
  });

  it('非鱼形公约：表面嘴响应嘴型装扮', () => {
    const smile = shapeFingerprint('CRAB', { ...DEFAULT_COSMETICS, mouthType: 'CURVE' });
    const tri = shapeFingerprint('CRAB', { ...DEFAULT_COSMETICS, mouthType: 'TRIANGLE' });
    expect(smile).not.toBe(tri);
  });

  it('灯笼鱼的灯泡响应 lureActive（诱饵状态发光更凶）', () => {
    const base = makeEntity('ANGLER_FISH', DEFAULT_COSMETICS, 'ANGLER');
    const lit = { ...base, lureActive: true } as Entity;
    expect(fingerprint(lit)).not.toBe(fingerprint(base));
  });
});

describe('生物数据自身的形状分派', () => {
  it('每种非 FISH 生物都有专属形状；传统鱼只有小丑鱼/蓝唐王/金龙鱼', () => {
    const fishShaped = Object.values(CREATURE_DATA)
      .filter((s) => ((s as { shape?: string }).shape ?? 'FISH') === 'FISH')
      .map((s) => (s as { name: string }).name);
    // PLANKTON 有专属画法（圆饼干）但 shape 走 FISH 缺省；MASCOT 同理
    expect(fishShaped.sort()).toEqual(['蓝唐王鱼', '金龙鱼', '磷虾', '新春吉祥物', '小丑鱼'].sort());
  });
});
