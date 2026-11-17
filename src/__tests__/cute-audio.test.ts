import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetAudioForTest, getVolume, initAudio, playSfx, setAudioScene, setMuted, setVolume, subscribeAudio } from '../audio';
import { gameEvents } from '../gameEngine';
import { GameStatus, type Entity } from '../types';

const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelAndHoldAtTime: vi.fn() });
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: param() });
const oscillatorNode = () => ({ ...node(), type: 'sine', frequency: param(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null });
class AudioContextMock {
  static instances: AudioContextMock[] = [];
  state = 'running';
  destination = node();
  onstatechange: (() => void) | null = null;
  clockOverride: number | null = null;
  get currentTime() { return this.clockOverride ?? Date.now() / 1000; }
  oscillators: ReturnType<typeof oscillatorNode>[] = [];
  gains: ReturnType<typeof node>[] = [];
  constructor() { AudioContextMock.instances.push(this); }
  createGain() { const n = node(); this.gains.push(n); return n; }
  createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; }
  createOscillator() {
    const n = oscillatorNode();
    this.oscillators.push(n); return n;
  }
  resume = vi.fn(async () => { this.state = 'running'; this.onstatechange?.(); });
  close = vi.fn(async () => { this.state = 'closed'; });
}
const context = () => AudioContextMock.instances[0];

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  AudioContextMock.instances = [];
  vi.stubGlobal('AudioContext', AudioContextMock);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  __resetAudioForTest();
});
afterEach(() => {
  __resetAudioForTest(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('萌系音乐与音效的生命周期', () => {
  it('不在菜单自动播放；开始、商店、结算与重开只维持一条音乐循环', () => {
    initAudio(); expect(context().oscillators).toHaveLength(0);
    setAudioScene(GameStatus.PLAYING);
    expect(context().oscillators.length).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) { setAudioScene(GameStatus.SHOP); initAudio(); }
    expect(AudioContextMock.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1500);
    const count = context().oscillators.length;
    setAudioScene(GameStatus.GAME_OVER);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(context().oscillators).toHaveLength(count);
    setAudioScene(GameStatus.PLAYING); expect(vi.getTimerCount()).toBe(1);
  });

  it('静音取消已排队的音乐和音效，恢复后不会叠加循环', () => {
    initAudio(); setAudioScene(GameStatus.PLAYING); playSfx('evolve');
    const count = context().oscillators.length;
    setMuted(true);
    expect(context().oscillators.every(o => o.stop.mock.calls.length === 2)).toBe(true);
    vi.advanceTimersByTime(3000); playSfx('eat');
    expect(context().oscillators).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
    setMuted(false); expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(600); // The melody has rests; resuming need not immediately play a note.
    expect(context().oscillators.length).toBeGreaterThan(count);
  });

  it('切换后台停止发声，回来继续；音频设备挂起时也停止排队', () => {
    initAudio(); setAudioScene(GameStatus.PLAYING);
    const visible = vi.spyOn(document, 'hidden', 'get');
    visible.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
    const count = context().oscillators.length;
    playSfx('eat'); vi.advanceTimersByTime(3000);
    expect(context().oscillators).toHaveLength(count);
    visible.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(1);
    context().state = 'suspended'; context().onstatechange?.();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('定时器卡顿后跳过漏掉的节拍，避免一次补几十个音符', () => {
    initAudio(); setAudioScene(GameStatus.PLAYING);
    const before = context().oscillators.length;
    context().clockOverride = 90;
    vi.advanceTimersByTime(60);
    expect(context().oscillators.length - before).toBeLessThanOrEqual(12);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('世界里其他鱼的受伤死亡不会盖过玩家提示，重复订阅不重复发声', () => {
    initAudio(); subscribeAudio(); subscribeAudio();
    const npc = { id: 'other-fish' } as Entity, player = { id: 'player' } as Entity;
    gameEvents.emit('hurt', { target: npc, amount: 1 }); gameEvents.emit('death', { victim: npc });
    gameEvents.emit('eat', { attacker: npc, victim: npc, x: 0, y: 0, isBackAttack: false });
    expect(context().oscillators).toHaveLength(0);
    gameEvents.emit('hurt', { target: player, amount: 1 });
    expect(context().oscillators).toHaveLength(2);
    __resetAudioForTest(); expect(gameEvents.listenerCount('hurt')).toBe(0);
  });

  it('连续进食被节流，音量保持有限值，声音结束后释放节点', () => {
    initAudio();
    for (let i = 0; i < 100; i++) playSfx('eat');
    expect(context().oscillators).toHaveLength(2);
    for (const oscillator of context().oscillators) {
      expect(['sine', 'triangle']).toContain(oscillator.type);
      oscillator.onended?.(); expect(oscillator.disconnect).toHaveBeenCalled();
    }
    setVolume(10); expect(getVolume()).toBe(1);
    setVolume(Number.NaN); expect(getVolume()).toBe(1);
    setVolume(-1); expect(getVolume()).toBe(0);
  });

  it('没有 Web Audio 设备也能安全开始游戏与静音', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => { initAudio(); setAudioScene(GameStatus.PLAYING); playSfx('eat'); setMuted(true); }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
