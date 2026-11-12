// Tiny synthesized sound effects, plus the odd recorded clip. Browsers only allow audio
// after a user gesture, so the context is created on the first tap.
let ctx = null;
let muted = localStorage.getItem('domino.muted') === '1';

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state !== 'running') ctx.resume(); // iOS also has 'interrupted', after backgrounding
  return ctx;
}

// A touch only counts as permission when it ends, and iOS can suspend audio again
// later, so every gesture tries to unlock it.
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(type, context, { capture: true, passive: true });

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

/** A short burst of noise, for a tile or card hitting the table. */
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
  // Dominoes mixed face down on the table: a long, uneven rattle.
  shuffle: () => {
    for (let ms = 0; ms < 1000; ms += 35 + Math.random() * 60) setTimeout(() => clack(0.06 + Math.random() * 0.1), ms);
  },
  // A deck riffled: a quick flutter of cards.
  riffle: () => {
    for (let ms = 0; ms < 320; ms += 8 + Math.random() * 8) setTimeout(() => clack(0.03 + Math.random() * 0.05), ms);
  },
  // A tile or card landing in your hand.
  deal: () => clack(0.12),
  // A die rattling on the board.
  dice: () => [0, 90, 190, 320, 480].forEach((ms) => setTimeout(() => clack(0.18), ms)),
  call: () => note(440, { dur: 0.16, type: 'triangle', gain: 0.16, slide: 620 }),
  // A shout: two rising blasts.
  truco: () => {
    note(330, { dur: 0.14, type: 'sawtooth', gain: 0.12, slide: 500 });
    note(440, { at: 0.14, dur: 0.3, type: 'sawtooth', gain: 0.12, slide: 880 });
  },
  // A card snatched off the table.
  grab: () => {
    clack(0.22);
    note(520, { dur: 0.08, type: 'triangle', gain: 0.12, slide: 900 });
  },
  // A pig's grunt, for a stolen cochina: oink oink.
  oink: () => [0, 0.2].forEach((at) => note(300, { at, dur: 0.14, type: 'sawtooth', gain: 0.1, slide: 170 })),
  flor: () => [784, 988, 1175, 1568].forEach((f, i) => note(f, { at: i * 0.08, dur: 0.22, gain: 0.12 })),
  pass: () => sounds.no(),
  no: () => {
    note(220, { dur: 0.14, type: 'square', gain: 0.07, slide: 150 });
    note(160, { at: 0.16, dur: 0.2, type: 'square', gain: 0.07, slide: 100 });
  },
  turn: () => {
    note(660, { dur: 0.12, gain: 0.12 });
    note(880, { at: 0.09, dur: 0.18, gain: 0.12 });
  },
  react: () => note(520, { dur: 0.12, type: 'triangle', gain: 0.15, slide: 900 }),
  // The big reaction popping over the table: a whoosh up into a chord.
  crowd: () => {
    note(220, { dur: 0.3, type: 'triangle', gain: 0.16, slide: 880 });
    [523, 659, 784].forEach((f, i) => note(f, { at: 0.22 + i * 0.05, dur: 0.4, type: 'triangle', gain: 0.1 }));
  },
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
  score: () => [880, 1320].forEach((f, i) => note(f, { at: i * 0.07, dur: 0.14, type: 'triangle', gain: 0.13 })),
  roundEnd: () => [440, 554].forEach((f, i) => note(f, { at: i * 0.12, dur: 0.25, type: 'triangle', gain: 0.15 })),
};

export function play(name) {
  if (muted || !context()) return;
  sounds[name]?.();
}

// Recorded clips, fetched the first time they play.
const clips = {};
const playing = new Set(); // a clip asked for again while it plays (a crowd growing) doesn't talk over itself

export async function playClip(name) {
  if (muted || !context() || playing.has(name)) return;
  playing.add(name);
  clips[name] ??= fetch(`/sounds/${name}.mp3`)
    .then((res) => res.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data));
  try {
    const src = ctx.createBufferSource();
    src.buffer = await clips[name];
    src.onended = () => playing.delete(name);
    src.connect(ctx.destination);
    src.start();
  } catch (err) {
    playing.delete(name);
    delete clips[name]; // try fetching again next time
    throw err;
  }
}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  localStorage.setItem('domino.muted', value ? '1' : '0');
}
