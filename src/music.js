// ---------------------------------------------------------------------------
// MIKAN's theme — ONE melody for the whole game, degrading with the build
// (Production Design 柱4). Pure WebAudio, no assets.
//
// Intensity 0..3:
//   0 clean      — the tune as mei hummed it
//   1 detune     — slightly off, you can't quite say why
//   2 decay      — notes drop out, tempo wobbles
//   3 fragments  — wrong octaves, waveform glitches, the bass loses its grip
//
// Sync hooks (called from main.js):
//   musicSilence(sec)  — fake crash: the song dies, a thin tinnitus remains
//   musicKeyDrop()     — HUD-lie reveal: the whole key drops a semitone, stays
//   musicWholeOnce()   — ending: the theme comes back whole, once (E1/E3)
//   stopMusic()        — E5 CLEAN BUILD: no song left to play
// ---------------------------------------------------------------------------
import { GAME } from "./state.js";
import { audioCtx, audioMaster } from "./audio.js";

const BPM = 88;
const BEAT = 60 / BPM;
const LOOP_BEATS = 16;

// Am | F | C | G — wistful and hummable. [beat, midi, durBeats]
const MELODY = [
  [0, 69, 0.5], [0.5, 71, 0.5], [1, 72, 1], [2, 76, 1.5], [3.5, 74, 0.5],
  [4, 72, 1], [5, 71, 0.5], [5.5, 69, 0.5], [6, 71, 2],
  [8, 69, 0.5], [8.5, 71, 0.5], [9, 72, 1], [10, 76, 1], [11, 79, 1],
  [12, 77, 1], [13, 76, 0.5], [13.5, 74, 0.5], [14, 72, 2],
];
const BASS = [[0, 45, 3.5], [4, 41, 3.5], [8, 48, 3.5], [12, 43, 3.5]];

const DETUNE = [0, 8, 25, 60];      // cents of random drift per intensity
const DROP = [0, 0.08, 0.22, 0.45]; // probability a note just... doesn't play
const WOBBLE = [0, 0, 0.02, 0.06];  // tempo instability

export const MUSIC = {
  playing: false, intensity: 0, transpose: 0,
  suspendUntil: 0, forceClean: false,
  step: 0, nextTime: 0,
};
let gainNode = null;
let timer = null;

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function ensureGain(ctx) {
  if (!gainNode) {
    gainNode = ctx.createGain();
    gainNode.gain.value = 0.12; // ambient — never fights the SFX
    gainNode.connect(audioMaster() || ctx.destination);
  }
}

function note(ctx, when, midi, durBeats, { type = "triangle", gain = 0.16, i = 0 } = {}) {
  if (GAME.muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = i >= 3 && Math.random() < 0.3 ? "sawtooth" : type;
  o.frequency.value = midiHz(midi + MUSIC.transpose);
  o.detune.value = (Math.random() * 2 - 1) * DETUNE[i];
  const dur = Math.max(0.08, durBeats * BEAT * 0.92);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(gainNode);
  o.start(when); o.stop(when + dur + 0.05);
}

// lookahead scheduler on a half-beat grid
function tick() {
  const ctx = audioCtx();
  if (!ctx || !MUSIC.playing) return;
  ensureGain(ctx);
  if (MUSIC.nextTime < ctx.currentTime) MUSIC.nextTime = ctx.currentTime + 0.05;
  while (MUSIC.nextTime < ctx.currentTime + 0.35) {
    const when = MUSIC.nextTime;
    const i = MUSIC.forceClean ? 0 : MUSIC.intensity;
    const b = (MUSIC.step * 0.5) % LOOP_BEATS;
    if (when >= MUSIC.suspendUntil) {
      for (const [eb, m, d] of MELODY) {
        if (eb !== b) continue;
        if (Math.random() < DROP[i]) continue; // the note just doesn't come
        let midi = m;
        if (i >= 3 && Math.random() < 0.25) midi += Math.random() < 0.5 ? -12 : 12;
        note(ctx, when, midi, d, { type: "triangle", gain: 0.15, i });
      }
      for (const [eb, m, d] of BASS) {
        if (eb !== b) continue;
        if (i >= 3 && Math.random() < 0.3) continue; // the bass loses its grip
        note(ctx, when, m, d, { type: "square", gain: 0.06, i });
      }
    }
    MUSIC.step++;
    const wob = 1 + (Math.random() * 2 - 1) * WOBBLE[i];
    MUSIC.nextTime += 0.5 * BEAT * wob;
  }
}

export function startMusic() {
  const ctx = audioCtx();
  if (!ctx || MUSIC.playing) return;
  MUSIC.playing = true;
  MUSIC.step = 0;
  MUSIC.nextTime = 0;
  if (!timer) timer = setInterval(tick, 100);
}

export function stopMusic() {
  MUSIC.playing = false;
  MUSIC.forceClean = false;
}

export function setMusicIntensity(n) {
  MUSIC.intensity = Math.max(0, Math.min(3, n));
}

// fake crash: the song cuts out; only a thin tinnitus tone survives
export function musicSilence(sec = 2) {
  const ctx = audioCtx();
  if (!ctx) return;
  MUSIC.suspendUntil = ctx.currentTime + sec;
  if (GAME.muted) return;
  ensureGain(ctx);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine"; o.frequency.value = 5800;
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.028, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
  o.connect(g); g.connect(gainNode);
  o.start(t); o.stop(t + sec + 0.05);
}

// the HUD lie is exposed: the whole song drops a semitone and stays there
export function musicKeyDrop() {
  MUSIC.transpose = Math.max(-3, MUSIC.transpose - 1);
}

// ending: the theme returns whole, exactly once — as it was written
export function musicWholeOnce() {
  MUSIC.forceClean = true;
  MUSIC.transpose = 0;
}
