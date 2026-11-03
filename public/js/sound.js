// Tiny synthesized sound effects (no audio files). Browsers only allow audio
// after a user gesture, so the context is created on the first tap.
let ctx = null;
let muted = localStorage.getItem('domino.muted') === '1';

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

addEventListener('pointerdown', context, { once: true });

/** One enveloped oscillator note. `slide` glides the pitch to that frequency. */
function note(freq, { at = 0, dur = 0.15, type = 'sine', gain = 0.2, slide } = {}) {
  const c = ctx;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A short burst of noise, for the clack of a tile on the table. */
function clack(gain = 0.3) {
  const c = ctx;
  const len = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const g = c.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(filter).connect(g).connect(c.destination);
  src.start();
}

const sounds = {
  place: () => {
    clack();
    note(180, { dur: 0.09, type: 'triangle', gain: 0.25, slide: 90 });
  },
  pass: () => {
    note(220, { dur: 0.14, type: 'square', gain: 0.07, slide: 150 });
    note(160, { at: 0.16, dur: 0.2, type: 'square', gain: 0.07, slide: 100 });
  },
  turn: () => {
    note(660, { dur: 0.12, gain: 0.12 });
    note(880, { at: 0.09, dur: 0.18, gain: 0.12 });
  },
  react: () => note(520, { dur: 0.12, type: 'triangle', gain: 0.15, slide: 900 }),
  // Sad trombone: wah, wah, wah, waaah.
  mock: () => {
    [311, 294, 277].forEach((f, i) => note(f, { at: i * 0.28, dur: 0.26, type: 'sawtooth', gain: 0.08 }));
    note(262, { at: 0.84, dur: 0.8, type: 'sawtooth', gain: 0.08, slide: 196 });
  },
  // The rest of the table laughing: ha-ha-ha-ha-haaa.
  laugh: () => {
    [620, 580, 540, 500].forEach((f, i) => note(f, { at: i * 0.13, dur: 0.1, type: 'square', gain: 0.07, slide: f * 0.8 }));
    note(460, { at: 0.52, dur: 0.32, type: 'square', gain: 0.07, slide: 280 });
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => note(f, { at: i * 0.11, dur: 0.3, type: 'triangle', gain: 0.18 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => note(f, { at: i * 0.18, dur: 0.35, type: 'sawtooth', gain: 0.07 })),
  roundEnd: () => [440, 554].forEach((f, i) => note(f, { at: i * 0.12, dur: 0.25, type: 'triangle', gain: 0.15 })),
};

export function play(name) {
  if (muted || !context()) return;
  sounds[name]?.();
}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  localStorage.setItem('domino.muted', value ? '1' : '0');
}
