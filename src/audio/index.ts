/**
 * 音效系统（P1-4）—— 用 WebAudio 现场合成，不依赖任何音频文件。
 *
 * 设计原则：**逻辑层完全不知道音效存在**。
 * 玩法代码只负责 `ctx.events.emit('eat', ...)`，这里订阅事件发声。
 * 好处是将来换成真实音频素材、加背景音乐、做静音开关，都不用碰一个字的玩法逻辑。
 *
 * 用法：
 *   import { initAudio, subscribeAudio, toggleMute, isMuted } from './audio';
 *   subscribeAudio();          // 模块加载时订阅一次
 *   initAudio();               // 在用户手势里调用（浏览器要求）
 *   toggleMute();              // 静音开关
 */

import { gameEvents } from '../gameEngine';
import type { GameEvents } from '../types';

export type SfxName =
  | 'eat' | 'hurt' | 'skill' | 'levelup' | 'evolve'
  | 'death' | 'treasure' | 'pickup' | 'reversal' | 'biome' | 'building';

/* ══════════════ 音频上下文 ══════════════ */

type AudioCtxCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let volume = 0.3;
/** 同名音效的最小间隔（毫秒），防止一帧内几十次判定糊成噪音 */
const MIN_INTERVAL: Partial<Record<SfxName, number>> = {
  eat: 70,
  hurt: 120,
  pickup: 90,
  skill: 160,
  death: 140,
  building: 200,
};
const lastPlayed: Partial<Record<SfxName, number>> = {};

const getAudioCtor = (): AudioCtxCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtxCtor; webkitAudioContext?: AudioCtxCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};

/** 必须在用户手势里调用（点击「开始游戏」），否则浏览器会拒绝创建/恢复音频上下文 */
export const initAudio = (): void => {
  const Ctor = getAudioCtor();
  if (!Ctor) return;
  try {
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
    }
    // 标签页切走再切回来时上下文会被挂起
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
    master = null;
  }
};

export const setVolume = (v: number): void => {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = muted ? 0 : volume;
};

export const getVolume = (): number => volume;

export const setMuted = (m: boolean): void => {
  muted = m;
  if (master) master.gain.value = muted ? 0 : volume;
};

export const toggleMute = (): boolean => {
  setMuted(!muted);
  return muted;
};

export const isMuted = (): boolean => muted;

/* ══════════════ 合成基元 ══════════════ */

interface ToneOptions {
  freq: number;
  /** 结束频率，做滑音；不填就是固定音高 */
  toFreq?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

const tone = (o: ToneOptions): void => {
  if (!ctx || !master || muted) return;
  const now = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, now);
  if (o.toFreq && o.toFreq !== o.freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.toFreq), now + o.duration);
  }

  // ADSR 简化为「瞬间起音 + 指数衰减」，避免爆音
  const peak = o.gain ?? 0.3;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(peak, now + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, now + o.duration);

  osc.connect(env);
  env.connect(master);
  osc.start(now);
  osc.stop(now + o.duration + 0.02);
};

/** 白噪声：撞击 / 水花这类打击感全靠它 */
const noise = (duration: number, gain = 0.2, delay = 0): void => {
  if (!ctx || !master || muted) return;
  const now = ctx.currentTime + delay;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, Math.max(1, frames), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // 越靠后越轻，天然形成衰减
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const env = ctx.createGain();
  env.gain.value = gain;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;

  src.connect(filter);
  filter.connect(env);
  env.connect(master);
  src.start(now);
};

/* ══════════════ 音效表 ══════════════ */

const SFX: Record<SfxName, () => void> = {
  // 吃到东西：低音「咕咚」+ 一小撮水花
  eat: () => {
    tone({ freq: 320, toFreq: 180, duration: 0.14, type: 'square', gain: 0.22 });
    noise(0.1, 0.12, 0.02);
  },
  // 受伤：向下的锯齿，听起来就疼
  hurt: () => {
    tone({ freq: 420, toFreq: 120, duration: 0.22, type: 'sawtooth', gain: 0.18 });
    noise(0.12, 0.1);
  },
  // 放技能：向上滑音，有「蓄力释放」的感觉
  skill: () => {
    tone({ freq: 260, toFreq: 720, duration: 0.24, type: 'triangle', gain: 0.2 });
  },
  // 升级：三音上行琶音
  levelup: () => {
    [523, 659, 784].forEach((f, i) =>
      tone({ freq: f, duration: 0.16, type: 'triangle', gain: 0.22, delay: i * 0.07 })
    );
  },
  // 进化：五音琶音 + 尾部亮音
  evolve: () => {
    [392, 523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, duration: 0.18, type: 'triangle', gain: 0.2, delay: i * 0.08 })
    );
  },
  // 死亡：向下长音
  death: () => {
    tone({ freq: 300, toFreq: 70, duration: 0.45, type: 'sawtooth', gain: 0.2 });
    noise(0.3, 0.14, 0.05);
  },
  // 宝藏出现：叮咚两声
  treasure: () => {
    tone({ freq: 880, duration: 0.18, type: 'sine', gain: 0.24 });
    tone({ freq: 1174, duration: 0.22, type: 'sine', gain: 0.2, delay: 0.14 });
  },
  // 拾取：清脆一声
  pickup: () => {
    tone({ freq: 1046, toFreq: 1568, duration: 0.12, type: 'sine', gain: 0.18 });
  },
  // 逆转反杀：小号角式上行，玩家的高光时刻
  reversal: () => {
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, duration: 0.2, type: 'square', gain: 0.16, delay: i * 0.06 })
    );
  },
  // 切换生态区：柔和扫频
  biome: () => {
    tone({ freq: 180, toFreq: 520, duration: 0.5, type: 'sine', gain: 0.14 });
  },
  // 建筑互动：闷闷的一声
  building: () => {
    tone({ freq: 200, toFreq: 300, duration: 0.16, type: 'triangle', gain: 0.18 });
  },
};

/** 播放音效（带节流，同名音效短时间内只响一次） */
export const playSfx = (name: SfxName): void => {
  if (!ctx || muted) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const gap = MIN_INTERVAL[name] ?? 0;
  const last = lastPlayed[name] ?? -Infinity;
  if (now - last < gap) return;
  lastPlayed[name] = now;

  try {
    SFX[name]?.();
  } catch {
    // 音频出问题绝不能影响玩法，静默吞掉
  }
};

/* ══════════════ 事件订阅 ══════════════ */

let subscribed = false;

/**
 * 把游戏事件接到音效上。整个项目只调用一次。
 * 想加新音效：在 SFX 里加一条，然后在这里多订阅一个事件，玩法代码不用动。
 */
export const subscribeAudio = (): void => {
  if (subscribed) return;
  subscribed = true;

  const on = <K extends keyof GameEvents>(evt: K, fn: (p: GameEvents[K]) => void): void => {
    gameEvents.on(evt, fn);
  };

  on('eat', () => playSfx('eat'));
  on('hurt', () => playSfx('hurt'));
  on('skill', () => playSfx('skill'));
  on('levelup', () => playSfx('levelup'));
  on('evolve', () => playSfx('evolve'));
  on('death', () => playSfx('death'));
  on('treasure', () => playSfx('treasure'));
  on('pickup', () => playSfx('pickup'));
  on('reversal', () => playSfx('reversal'));
  on('biome', () => playSfx('biome'));
  on('building', () => playSfx('building'));
};

/** 测试用：把内部状态清掉，避免用例之间互相污染 */
export const __resetAudioForTest = (): void => {
  ctx = null;
  master = null;
  muted = false;
  subscribed = false;
};
