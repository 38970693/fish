/** Soft synthesized sounds. Gameplay emits events; this module owns audio and its lifecycle. */
import { gameEvents } from '../gameEngine';
import { GameStatus, type GameEvents } from '../types';
import { CUTE_MUSIC, CUTE_SFX, MUSIC_STEP_SECONDS, MUSIC_STEPS, synthesizeCuteNote, type SfxName } from './cuteScore';
export type { SfxName } from './cuteScore';

type AudioCtxCtor = typeof AudioContext;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = false;
let volume = 0.3;
let scene = GameStatus.MENU;
let timer: ReturnType<typeof setInterval> | null = null;
let nextStepTime = 0;
let musicStep = 0;
const musicVoices: { end: number; stop: () => void }[] = [];
const sfxVoices: { end: number; stop: () => void }[] = [];
const lastPlayed: Partial<Record<SfxName, number>> = {};
const MIN_INTERVAL: Record<SfxName, number> = {
  eat: 100, hurt: 220, pickup: 120, skill: 200, death: 650,
  building: 280, treasure: 450, levelup: 350, evolve: 700, reversal: 350, biome: 900,
};
const SFX_VOICE_LIMIT = 28;
const hidden = (): boolean => typeof document !== 'undefined' && document.hidden;
const musicalScene = (): boolean =>
  scene === GameStatus.PLAYING || scene === GameStatus.BATTLE_TEST || scene === GameStatus.SHOP || scene === GameStatus.EVOLVING;
const canPlayMusic = (): boolean => !!ctx && ctx.state === 'running' && !muted && !hidden() && musicalScene();

const pruneVoices = (voices: typeof musicVoices): void => {
  if (!ctx) return;
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= ctx.currentTime) voices.splice(i, 1);
};
const stopVoices = (voices: typeof musicVoices): void => {
  for (const voice of voices) voice.stop();
  voices.length = 0;
};
const stopMusic = (): void => {
  if (timer !== null) clearInterval(timer);
  timer = null;
  stopVoices(musicVoices);
};
const scheduleMusic = (): void => {
  if (!canPlayMusic() || !ctx || !musicBus) { stopMusic(); return; }
  pruneVoices(musicVoices);
  // A delayed timer skips missed notes instead of dumping them into one loud burst.
  if (nextStepTime < ctx.currentTime - MUSIC_STEP_SECONDS) {
    const missed = Math.ceil((ctx.currentTime - nextStepTime) / MUSIC_STEP_SECONDS);
    musicStep = (musicStep + missed) % MUSIC_STEPS;
    nextStepTime += missed * MUSIC_STEP_SECONDS;
  }
  while (nextStepTime < ctx.currentTime + 0.18) {
    for (const n of CUTE_MUSIC[musicStep]) {
      const start = Math.max(ctx.currentTime, nextStepTime) + n.delay;
      musicVoices.push({ end: start + n.duration + 0.025, stop: synthesizeCuteNote(ctx, musicBus, n, start) });
    }
    nextStepTime += MUSIC_STEP_SECONDS;
    musicStep = (musicStep + 1) % MUSIC_STEPS;
  }
};
const syncMusic = (): void => {
  if (!canPlayMusic()) { stopMusic(); return; }
  if (!ctx || !musicBus) return;
  musicBus.gain.setTargetAtTime(scene === GameStatus.SHOP || scene === GameStatus.EVOLVING ? 0.42 : 0.65, ctx.currentTime, 0.12);
  if (timer !== null) return;
  nextStepTime = ctx.currentTime + 0.045;
  scheduleMusic();
  timer = setInterval(scheduleMusic, 60);
};
const onVisibilityChange = (): void => {
  if (hidden()) stopVoices(sfxVoices);
  syncMusic();
};

/** Called from a user gesture; context creation/resume must respect browser autoplay rules. */
export const initAudio = (): void => {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { AudioContext?: AudioCtxCtor; webkitAudioContext?: AudioCtxCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return;
  try {
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      // Soft knee bounds overlapping rewards without flattening quieter bubble pops.
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12; compressor.knee.value = 12; compressor.ratio.value = 4;
      compressor.attack.value = 0.006; compressor.release.value = 0.18;
      master.connect(compressor); compressor.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0;
      musicBus.connect(master);
      ctx.onstatechange = syncMusic;
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (ctx.state === 'suspended') void ctx.resume().then(syncMusic).catch(() => {});
    else syncMusic();
  } catch {
    stopMusic(); stopVoices(sfxVoices);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (ctx) { ctx.onstatechange = null; void ctx.close().catch(() => {}); }
    ctx = null; master = null; musicBus = null;
  }
};

export const setAudioScene = (status: GameStatus): void => { scene = status; syncMusic(); };
export const setVolume = (v: number): void => {
  if (!Number.isFinite(v)) return;
  volume = Math.max(0, Math.min(1, v));
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.025);
};
export const getVolume = (): number => volume;
export const setMuted = (m: boolean): void => {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.025);
  if (muted) stopVoices(sfxVoices);
  syncMusic();
};
export const toggleMute = (): boolean => { setMuted(!muted); return muted; };
export const isMuted = (): boolean => muted;

/** Per-effect throttling and a voice budget keep busy feeding scenes comfortable. */
export const playSfx = (name: SfxName): void => {
  if (!ctx || !master || muted || hidden() || ctx.state !== 'running') return;
  const now = performance.now();
  if (now - (lastPlayed[name] ?? -Infinity) < MIN_INTERVAL[name]) return;
  pruneVoices(sfxVoices);
  const notes = CUTE_SFX[name];
  if (!notes) return;
  // Important cues may replace old pops rather than disappearing during a feeding burst.
  const priority = name === 'hurt' || name === 'death' || name === 'levelup' || name === 'evolve';
  if (sfxVoices.length + notes.length > SFX_VOICE_LIMIT) {
    if (!priority) return;
    while (sfxVoices.length + notes.length > SFX_VOICE_LIMIT) sfxVoices.shift()?.stop();
  }
  lastPlayed[name] = now;
  try {
    for (const n of notes) {
      const start = ctx.currentTime + n.delay;
      sfxVoices.push({ end: start + n.duration + 0.025, stop: synthesizeCuteNote(ctx, master, n, start) });
    }
  } catch { /* Audio failure must never interrupt gameplay. */ }
};

let subscribed = false;
const subscriptions: (() => void)[] = [];
export const subscribeAudio = (): void => {
  if (subscribed) return;
  subscribed = true;
  const on = <K extends keyof GameEvents>(event: K, name: SfxName, audible?: (p: GameEvents[K]) => boolean): void => {
    subscriptions.push(gameEvents.on(event, p => { if (!audible || audible(p)) playSfx(name); }));
  };
  // Off-screen AI battles must not sound like the player is continually hurt or defeated.
  on('eat', 'eat', p => p.attacker.id === 'player');
  on('hurt', 'hurt', p => p.target.id === 'player');
  on('death', 'death', p => p.victim.id === 'player');
  on('skill', 'skill'); on('levelup', 'levelup'); on('evolve', 'evolve');
  on('treasure', 'treasure'); on('pickup', 'pickup');
  on('reversal', 'reversal'); on('biome', 'biome'); on('building', 'building');
  subscriptions.push(gameEvents.on('questReward', p => playSfx(p.chapterComplete ? 'evolve' : 'treasure')));
};

/** Also used during hot reload to avoid orphaned loops and duplicate event sounds. */
export const __resetAudioForTest = (): void => {
  stopMusic(); stopVoices(sfxVoices);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (ctx) { ctx.onstatechange = null; void ctx.close().catch(() => {}); }
  ctx = null; master = null; musicBus = null;
  muted = false; volume = 0.3; scene = GameStatus.MENU; musicStep = 0; nextStepTime = 0;
  for (const key of Object.keys(lastPlayed) as SfxName[]) delete lastPlayed[key];
  for (const off of subscriptions.splice(0)) off();
  subscribed = false;
};
if (import.meta.hot) import.meta.hot.dispose(__resetAudioForTest);
