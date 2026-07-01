import { GAME, WORLD } from "./state.js";
import { sfx } from "./audio.js";
import { shake, burst } from "./fx.js";

const SPEED = 270;        // px/s horizontal
const GRAVITY = 2100;     // px/s^2
const JUMP_V = -790;      // initial jump velocity (peak ~150px)
const MAX_FALL = 1200;
const COYOTE = 0.10;      // grace after leaving a ledge
const BUFFER = 0.12;      // grace if jump pressed just before landing

export function makePlayer(spawn) {
  return {
    x: spawn.x, y: spawn.y,
    w: 26, h: 38,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1,
    spawn: { ...spawn },
    glitch: 0,
    coyote: 0,
    buffer: 0,
    groundId: null, // id of the platform currently stood on (for checkpoints)
  };
}

export function resetPlayer(p, at) {
  const s = at || p.spawn;
  p.x = s.x; p.y = s.y;
  p.vx = 0; p.vy = 0; p.onGround = false;
  p.coyote = 0; p.buffer = 0;
}

// dt in seconds. `platforms` is the live solids array. jumpPressed = rising edge.
export function updatePlayer(p, dt, platforms, keys, jumpPressed) {
  // --- horizontal ---
  let dir = 0;
  if (keys.left) dir -= 1;
  if (keys.right) dir += 1;
  p.vx = dir * SPEED;
  if (dir !== 0) p.facing = dir;

  // --- gravity (scaled live by the gravity bug) ---
  p.vy = Math.min(p.vy + GRAVITY * GAME.gravityScale * dt, MAX_FALL);

  // --- jump with coyote time + input buffer (edge-based: no auto-bhop) ---
  if (jumpPressed) p.buffer = BUFFER;
  else p.buffer = Math.max(0, p.buffer - dt);
  if (p.coyote > 0) p.coyote -= dt;
  if (p.buffer > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = JUMP_V;
    p.onGround = false;
    p.coyote = 0; p.buffer = 0;
    p.squash = -0.5; // stretch up
    sfx("jump");
    burst(p.x + p.w / 2, p.y + p.h, { n: 5, color: "#3a4552", spd: 90, life: 0.3, grav: 500 });
  }
  if (p.squash) p.squash *= Math.max(0, 1 - dt * 10);

  const wasGround = p.onGround;

  // --- integrate + resolve per axis (simple swept AABB) ---
  p.x += p.vx * dt;
  resolveAxis(p, platforms, "x");
  p.y += p.vy * dt;
  p.onGround = false;
  p.groundId = null;
  resolveAxis(p, platforms, "y");

  if (p.onGround) {
    p.coyote = COYOTE;
    if (!wasGround) {
      sfx("land");
      const impact = Math.min(1, Math.abs(p.landVy || 0) / 900);
      p.squash = 0.5 * (0.5 + impact);
      if (impact > 0.25) shake(3 * impact, 0.06);
      burst(p.x + p.w / 2, p.y + p.h, { n: 3 + (impact * 6) | 0, color: "#3a4552", spd: 120, life: 0.35, grav: 700 });
    }
  }
  p.landVy = p.vy; // remember fall speed for next-frame land impact

  // --- fell out of the world: caller respawns ---
  if (p.y > WORLD.h + 120) return "respawn";
  return null;
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolveAxis(p, platforms, axis) {
  for (const pl of platforms) {
    if (!pl.solid) continue;
    if (!aabb(p, pl)) continue;
    if (axis === "x") {
      if (p.vx > 0) p.x = pl.x - p.w;
      else if (p.vx < 0) p.x = pl.x + pl.w;
      p.vx = 0;
    } else {
      if (p.vy > 0) { p.y = pl.y - p.h; p.onGround = true; p.groundId = pl.id; }
      else if (p.vy < 0) { p.y = pl.y + pl.h; }
      p.vy = 0;
    }
  }
}
