// Juice + spectacle FX — screen shake, hitstop, flash, particles, and
// "the game is breaking" post effects (tear / invert). Self-contained; operates
// on the 2D canvas context. No assets.
export const FX = {
  shakeT: 0, shakeDur: 1, shakeMag: 0,
  hitstopT: 0,
  flashT: 0, flashDur: 1, flashColor: "#ffffff", flashMax: 0.5,
  particles: [],
  glitch: null, // { type:'tear'|'invert', t, dur, intensity }
};

export function shake(mag, dur = 0.25) {
  if (mag >= FX.shakeMag || FX.shakeT <= 0) { FX.shakeMag = mag; FX.shakeDur = dur; FX.shakeT = dur; }
}
export function hitstop(dur = 0.05) { FX.hitstopT = Math.max(FX.hitstopT, dur); }
export function flash(dur = 0.18, color = "#ffffff", max = 0.5) { FX.flashT = dur; FX.flashDur = dur; FX.flashColor = color; FX.flashMax = max; }
export function glitch(type = "tear", dur = 0.35, intensity = 1) { FX.glitch = { type, t: 0, dur, intensity }; }

// particles in WORLD space
export function burst(x, y, opts = {}) {
  const n = opts.n ?? 10;
  const color = opts.color ?? "#d7dde2";
  const spd = opts.spd ?? 220;
  const life = opts.life ?? 0.5;
  const grav = opts.grav ?? 900;
  const up = opts.up ?? 0;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = spd * (0.3 + Math.random() * 0.7);
    FX.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - up,
      life: life * (0.6 + Math.random() * 0.6),
      max: life,
      color: Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color,
      size: opts.size ?? (2 + Math.random() * 3),
      grav,
    });
  }
}

export function updateFX(dt) {
  if (FX.shakeT > 0) FX.shakeT -= dt;
  if (FX.hitstopT > 0) FX.hitstopT -= dt;
  if (FX.flashT > 0) FX.flashT -= dt;
  if (FX.glitch) { FX.glitch.t += dt; if (FX.glitch.t >= FX.glitch.dur) FX.glitch = null; }
  const ps = FX.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) { ps.splice(i, 1); continue; }
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function frozen() { return FX.hitstopT > 0; }

export function shakeOffset() {
  if (FX.shakeT <= 0) return { x: 0, y: 0 };
  const k = (FX.shakeT / FX.shakeDur) * FX.shakeMag;
  return { x: (Math.random() * 2 - 1) * k, y: (Math.random() * 2 - 1) * k };
}

// draw particles — call INSIDE the world (camera) transform
export function drawParticles(ctx) {
  for (const p of FX.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// post effects over the whole canvas — call at the very end (screen space)
export function postFX(ctx, w, h) {
  const g = FX.glitch;
  if (g) {
    const cv = ctx.canvas;
    const p = 1 - g.t / g.dur; // fades out
    if (g.type === "tear") {
      const bands = 5;
      for (let i = 0; i < bands; i++) {
        const by = Math.random() * h;
        const bh = 6 + Math.random() * 26;
        const dx = (Math.random() * 2 - 1) * 46 * g.intensity * p;
        try { ctx.drawImage(cv, 0, by, w, bh, dx, by, w, bh); } catch (e) {}
      }
    } else if (g.type === "invert") {
      ctx.save();
      ctx.globalCompositeOperation = "difference";
      ctx.globalAlpha = 0.85 * p * g.intensity;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
  if (FX.flashT > 0) {
    ctx.save();
    ctx.globalAlpha = (FX.flashT / FX.flashDur) * FX.flashMax;
    ctx.fillStyle = FX.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

export function resetFX() {
  FX.shakeT = 0; FX.hitstopT = 0; FX.flashT = 0; FX.glitch = null; FX.particles.length = 0;
}
