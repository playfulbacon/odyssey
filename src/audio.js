// Tiny synth. No assets, no dependencies — just enough feedback to make the
// mechanics readable by ear.

let ac = null;
let muted = false;

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume();
}

export function setMuted(v) { muted = v; }
export function isMuted() { return muted; }

function tone(freq, dur, type = 'square', gain = 0.05, slide = 0) {
  if (muted || !ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, gain = 0.06) {
  if (muted || !ac) return;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource();
  const g = ac.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(g).connect(ac.destination);
  src.start();
}

export const sfx = {
  paddle: () => tone(190, 0.05, 'square', 0.035),
  boost: () => tone(300, 0.13, 'sawtooth', 0.035, 420),
  shield: () => tone(520, 0.05, 'square', 0.03),
  collect: (step = 0) => tone(620 * Math.pow(1.06, Math.min(step, 14)), 0.11, 'triangle', 0.06),
  crack: () => tone(240, 0.09, 'sawtooth', 0.05, -110),
  destroy: () => { tone(160, 0.22, 'sawtooth', 0.06, -110); noise(0.18, 0.05); },
  die: () => { tone(150, 0.4, 'sawtooth', 0.07, -110); noise(0.3, 0.07); },
  launch: () => { tone(300, 0.09, 'triangle', 0.05); setTimeout(() => tone(480, 0.14, 'triangle', 0.05), 90); },
  charge: () => tone(420, 0.04, 'sine', 0.02),
  clear: () => [0, 110, 220, 360].forEach((d, i) => setTimeout(() => tone(440 * Math.pow(1.26, i), 0.2, 'triangle', 0.05), d)),
  over: () => [0, 160, 340].forEach((d, i) => setTimeout(() => tone(330 / Math.pow(1.3, i), 0.3, 'sawtooth', 0.05), d)),
  ui: () => tone(420, 0.035, 'square', 0.025),
};
