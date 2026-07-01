import { GAME } from "./state.js";

// Procedural WebAudio — no asset files. All sounds are synthesized so the
// build stays tiny and asset-free. Respects GAME.muted.
let ctx = null;
let master = null;
let noiseBuf = null;

export function ensureAudio() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    // small noise buffer for percussive/glitch sounds
    const len = Math.floor(ctx.sampleRate * 0.4);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

function tone({ freq = 440, type = "square", dur = 0.09, gain = 0.3, slideTo = null, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.12, gain = 0.3, hp = 0, lp = 20000, delay = 0 }) {
  if (!ctx || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = src;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp; node.connect(f); node = f; }
  if (lp < 20000) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; node.connect(f); node = f; }
  node.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

// One entry point. Names map to short synth recipes.
export function sfx(name) {
  if (GAME.muted || !ctx) return;
  switch (name) {
    case "jump":     tone({ freq: 480, type: "square", slideTo: 760, dur: 0.11, gain: 0.22 }); break;
    case "land":     noise({ dur: 0.07, gain: 0.18, lp: 1600 }); break;
    case "detect":   tone({ freq: 900, type: "square", dur: 0.07, gain: 0.2 }); tone({ freq: 620, type: "square", dur: 0.1, gain: 0.2, delay: 0.09 }); break;
    case "fix":      tone({ freq: 660, type: "triangle", slideTo: 330, dur: 0.18, gain: 0.24 }); break;
    case "ignore":   tone({ freq: 160, type: "sawtooth", dur: 0.14, gain: 0.22 }); break;
    case "collect":  tone({ freq: 660, type: "square", dur: 0.06, gain: 0.2 }); tone({ freq: 990, type: "square", dur: 0.09, gain: 0.2, delay: 0.06 }); break;
    case "solidify": tone({ freq: 120, type: "sawtooth", slideTo: 300, dur: 0.25, gain: 0.2 }); noise({ dur: 0.2, gain: 0.1, hp: 800 }); break;
    case "hit":      noise({ dur: 0.22, gain: 0.35, hp: 300 }); tone({ freq: 200, type: "sawtooth", slideTo: 60, dur: 0.22, gain: 0.2 }); break;
    case "respawn":  tone({ freq: 300, type: "triangle", slideTo: 500, dur: 0.14, gain: 0.18 }); break;
    case "glitch":   noise({ dur: 0.05, gain: 0.14, hp: 1200 }); break;
    case "stinger":  tone({ freq: 440, type: "sawtooth", dur: 0.5, gain: 0.16 }); tone({ freq: 466, type: "sawtooth", dur: 0.5, gain: 0.16 }); tone({ freq: 233, type: "sawtooth", dur: 0.6, gain: 0.14 }); break;
    case "patch":    noise({ dur: 0.9, gain: 0.22, lp: 3000 }); tone({ freq: 520, type: "sawtooth", slideTo: 40, dur: 0.9, gain: 0.2 }); break;
    case "select":   tone({ freq: 700, type: "square", dur: 0.03, gain: 0.12 }); break;
    case "tap":      tone({ freq: 220, type: "square", dur: 0.05, gain: 0.2 }); noise({ dur: 0.04, gain: 0.12, lp: 2200 }); break;
    case "ding":     tone({ freq: 880, type: "square", dur: 0.06, gain: 0.2 }); tone({ freq: 1320, type: "square", dur: 0.14, gain: 0.2, delay: 0.06 }); break;
    case "tonk":     tone({ freq: 150, type: "square", slideTo: 90, dur: 0.16, gain: 0.2 }); break;
    default: break;
  }
}
