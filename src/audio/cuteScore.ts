/** Original music-box score and soft water-pop effects, shared by live and offline audio. */
export type SfxName =
  | 'eat' | 'hurt' | 'skill' | 'levelup' | 'evolve'
  | 'death' | 'treasure' | 'pickup' | 'reversal' | 'biome' | 'building';

export interface CuteNote {
  freq: number;
  toFreq?: number;
  duration: number;
  gain: number;
  delay: number;
  voice: 'bell' | 'bubble' | 'soft';
}

const note = (freq: number, duration = 0.24, gain = 0.22, delay = 0, voice: CuteNote['voice'] = 'bell', toFreq?: number): CuteNote =>
  ({ freq, duration, gain, delay, voice, toFreq });
const chime = (frequencies: number[], spacing = 0.11, gain = 0.2): CuteNote[] =>
  frequencies.map((freq, i) => note(freq, 0.36, gain, i * spacing));

export const CUTE_SFX: Record<SfxName, readonly CuteNote[]> = {
  eat: [note(440, 0.13, 0.27, 0, 'bubble', 660), note(784, 0.12, 0.09, 0.06, 'bubble', 523)],
  hurt: [note(392, 0.17, 0.25, 0, 'bubble', 262), note(330, 0.16, 0.13, 0.1, 'soft')],
  skill: [note(330, 0.24, 0.21, 0, 'bubble', 784), ...chime([784, 1046], 0.09, 0.13).map(n => ({ ...n, delay: n.delay + 0.16 }))],
  levelup: chime([523, 659, 784, 1046]),
  evolve: [...chime([392, 523, 659, 784, 1046, 1318], 0.12, 0.19), note(523, 0.9, 0.08, 0.38, 'soft')],
  death: [note(523, 0.26, 0.19, 0, 'soft'), note(392, 0.3, 0.17, 0.2, 'soft'), note(262, 0.56, 0.15, 0.43, 'bubble', 220)],
  treasure: chime([659, 1046, 784, 1318], 0.12, 0.18),
  pickup: [note(784, 0.22, 0.18), note(1046, 0.25, 0.12, 0.075)],
  reversal: chime([523, 784, 659, 1046], 0.1, 0.2),
  biome: [note(262, 0.65, 0.12, 0, 'soft'), note(392, 0.65, 0.1, 0.12, 'soft'), note(659, 0.42, 0.09, 0.3)],
  building: [note(523, 0.22, 0.16, 0, 'bubble', 659), note(784, 0.3, 0.14, 0.12)],
};

export const MUSIC_BPM = 88;
export const MUSIC_STEP_SECONDS = 60 / MUSIC_BPM / 2;
export const MUSIC_STEPS = 16 * 8;
export const MUSIC_LOOP_SECONDS = MUSIC_STEPS * MUSIC_STEP_SECONDS;
const frequency = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
// Four related phrases, with rests to leave room for water-pop gameplay sounds.
const phrases = [
  [72, -1, 76, 79, -1, 76, 74, -1], [72, 74, 76, -1, 79, -1, 81, 79],
  [76, -1, 74, 72, -1, 74, 76, -1], [79, 76, 74, -1, 72, -1, -1, -1],
];
const chords = [[48, 64, 67], [53, 65, 69], [55, 62, 67], [48, 64, 67]];
export const CUTE_MUSIC: readonly (readonly CuteNote[])[] = Array.from({ length: MUSIC_STEPS }, (_, step) => {
  const bar = Math.floor(step / 8), beat = step % 8;
  const notes: CuteNote[] = [];
  const pitch = phrases[bar % 4][beat];
  if (pitch >= 0) {
    const melody = pitch + (bar >= 8 && beat === 4 ? 12 : 0);
    notes.push(note(frequency(melody), 0.46, beat % 2 ? 0.09 : 0.12));
  }
  const chord = chords[Math.floor(bar / 4)];
  if (beat === 0) notes.push(note(frequency(chord[0]), 0.72, 0.12, 0, 'soft'));
  if (beat === 0 || beat === 4) {
    notes.push(note(frequency(chord[1]), 1.05, 0.035, 0, 'soft'));
    notes.push(note(frequency(chord[2]), 1.05, 0.028, 0.025, 'soft'));
  }
  if (beat === 6 && bar % 2 === 1) notes.push(note(frequency(chord[2] + 12), 0.25, 0.035, 0, 'bubble'));
  return notes;
});

/** Oscillators disconnect after finishing, including notes cancelled on mute. */
export const synthesizeCuteNote = (context: BaseAudioContext, destination: AudioNode, n: CuteNote, start: number): (() => void) => {
  const envelope = context.createGain();
  const attack = n.voice === 'soft' ? 0.025 : 0.009;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(n.gain, start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + n.duration);
  envelope.connect(destination);
  const partials = n.voice === 'bell' ? [[1, 1], [2, 0.13], [3, 0.025]] : [[1, 1]];
  let remaining = partials.length;
  const oscillators = partials.map(([multiple, strength]) => {
    const oscillator = context.createOscillator();
    const level = context.createGain();
    oscillator.type = n.voice === 'soft' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(n.freq * multiple, start);
    if (n.toFreq) oscillator.frequency.exponentialRampToValueAtTime(n.toFreq * multiple, start + n.duration * 0.8);
    level.gain.value = strength;
    oscillator.connect(level); level.connect(envelope);
    oscillator.onended = () => {
      oscillator.disconnect(); level.disconnect();
      if (--remaining === 0) envelope.disconnect();
    };
    oscillator.start(start); oscillator.stop(start + n.duration + 0.025);
    return oscillator;
  });
  return () => {
    // A short release prevents clicks and also cancels notes still in the lookahead queue.
    const now = context.currentTime;
    envelope.gain.cancelAndHoldAtTime(now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    for (const oscillator of oscillators) {
      try { oscillator.stop(now + 0.025); } catch { /* Already finished. */ }
    }
  };
};
