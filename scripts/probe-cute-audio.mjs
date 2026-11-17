import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await mkdir('previews', { recursive: true });
try {
  // Observe real browser nodes, without replacing the actual audio implementation.
  await page.addInitScript(() => {
    window.__AUDIO_REVIEW__ = { created: 0, active: 0, peakActive: 0, contexts: [], buses: [] };
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args); window.__AUDIO_REVIEW__.contexts.push(this);
      }
      createOscillator() {
        const osc = super.createOscillator(), stats = window.__AUDIO_REVIEW__;
        stats.created++; stats.active++; stats.peakActive = Math.max(stats.peakActive, stats.active);
        osc.addEventListener('ended', () => stats.active--);
        return osc;
      }
      createGain() {
        const gain = super.createGain(); window.__AUDIO_REVIEW__.buses.push(gain); return gain;
      }
    };
  });
  await page.goto('http://localhost:3000/?renderer=canvas&world=endless&worldSeed=42');
  if (await page.evaluate(() => window.__AUDIO_REVIEW__.contexts.length)) throw new Error('Audio created before user gesture');
  await page.getByRole('button', { name: '驶入无限海域' }).click();
  await page.waitForFunction(() => window.__AUDIO_REVIEW__.created > 0);
  await page.evaluate(() => { const s = window.__FISH_DEBUG__.state(); s.player.isGodMode = true; s.entities = []; });
  await page.getByRole('button', { name: '关闭音乐与音效', exact: true }).click();
  await page.waitForTimeout(300);
  const muted = await page.evaluate(() => ({ count: window.__AUDIO_REVIEW__.created, active: window.__AUDIO_REVIEW__.active }));
  await page.waitForTimeout(650);
  if (muted.active !== 0 || await page.evaluate(() => window.__AUDIO_REVIEW__.created) !== muted.count) throw new Error('Mute failed to stop music');
  await page.getByRole('button', { name: '开启音乐与音效', exact: true }).click();
  await page.waitForFunction(n => window.__AUDIO_REVIEW__.created > n, muted.count);
  const effectNodes = await page.evaluate(async () => {
    // Vite may attach a hot-reload timestamp: import the same singleton the App loaded.
    const source = await fetch('/src/App.tsx').then(r => r.text());
    const audioPath = source.match(/from "(\/src\/audio\/index\.ts[^"]*)"/)[1];
    const { playSfx } = await import(audioPath);
    const before = window.__AUDIO_REVIEW__.created;
    for (let i = 0; i < 200; i++) playSfx('eat');
    playSfx('evolve'); playSfx('hurt');
    return window.__AUDIO_REVIEW__.created - before;
  });
  if (effectNodes !== 23) throw new Error(`Expected one eat, one evolve and one hurt cue, got ${effectNodes} oscillator nodes`);
  await page.getByRole('button', { name: '返回主界面', exact: true }).click();
  await page.waitForTimeout(1500);
  const stopped = await page.evaluate(() => ({ count: window.__AUDIO_REVIEW__.created, active: window.__AUDIO_REVIEW__.active, contexts: window.__AUDIO_REVIEW__.contexts.length, peak: window.__AUDIO_REVIEW__.peakActive }));
  await page.waitForTimeout(600);
  if (stopped.active !== 0 || await page.evaluate(() => window.__AUDIO_REVIEW__.created) !== stopped.count) throw new Error('Music leaked into menu');
  if (stopped.contexts !== 1) throw new Error('Duplicate audio context');
  console.log('Real browser start / mute / resume / menu / node cleanup:', stopped);

  const rendered = await page.evaluate(async () => {
    const score = await import('/src/audio/cuteScore.ts');
    const sampleRate = 22050;
    const render = async (mode) => {
      const names = ['eat', 'pickup', 'hurt', 'skill', 'levelup', 'evolve', 'treasure', 'building', 'biome', 'reversal', 'death'];
      const duration = mode === 'music' ? score.MUSIC_LOOP_SECONDS + 1.2 : mode === 'sfx' ? names.length * 1.65 + 1.2 : 7;
      const context = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);
      const master = context.createGain(); master.gain.value = 0.3;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -12; compressor.knee.value = 12; compressor.ratio.value = 4;
      compressor.attack.value = 0.006; compressor.release.value = 0.18;
      master.connect(compressor); compressor.connect(context.destination);
      const bus = context.createGain(); bus.gain.value = 0.65; bus.connect(master);
      if (mode !== 'sfx') {
        for (let step = 0; step < score.MUSIC_STEPS; step++) {
          const start = 0.05 + step * score.MUSIC_STEP_SECONDS;
          if (start >= duration - 1) break;
          for (const n of score.CUTE_MUSIC[step]) score.synthesizeCuteNote(context, bus, n, start + n.delay);
        }
      }
      if (mode === 'sfx') names.forEach((name, i) => {
        for (const n of score.CUTE_SFX[name]) score.synthesizeCuteNote(context, master, n, 0.1 + i * 1.65 + n.delay);
      });
      if (mode === 'stress') for (let i = 0; i < 30; i++) {
        for (const n of score.CUTE_SFX.eat) score.synthesizeCuteNote(context, master, n, 0.1 + i * 0.1 + n.delay);
        if (i % 4 === 0) for (const n of score.CUTE_SFX.levelup) score.synthesizeCuteNote(context, master, n, 0.1 + i * 0.1 + n.delay);
      }
      const buffer = await context.startRendering();
      const samples = buffer.getChannelData(0);
      let peak = 0, energy = 0, maxDelta = 0;
      const wav = new ArrayBuffer(44 + samples.length * 2), view = new DataView(wav);
      const label = (at, text) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
      label(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); label(8, 'WAVE'); label(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      label(36, 'data'); view.setUint32(40, samples.length * 2, true);
      for (let i = 0; i < samples.length; i++) {
        const value = samples[i];
        peak = Math.max(peak, Math.abs(value)); energy += value * value;
        if (i) maxDelta = Math.max(maxDelta, Math.abs(value - samples[i - 1]));
        view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(value * 32767))), true);
      }
      const bytes = new Uint8Array(wav); let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { mode, base64: btoa(binary), peak, rms: Math.sqrt(energy / samples.length), maxDelta, duration };
    };
    return [await render('music'), await render('sfx'), await render('stress')];
  });
  for (const item of rendered) {
    if (!Number.isFinite(item.peak) || item.peak < 0.005 || item.peak > 0.9 || item.maxDelta > 0.2) throw new Error(`Audio amplitude invalid: ${item.mode}`);
    await writeFile(`previews/cute-${item.mode}.wav`, Buffer.from(item.base64, 'base64'));
    console.log(item.mode, { peak: item.peak.toFixed(4), rms: item.rms.toFixed(4), maxDelta: item.maxDelta.toFixed(4), duration: item.duration.toFixed(2) });
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
