import { GAME, WORLD } from "./state.js";

const SPEED = 270;        // px/s horizontal
const GRAVITY = 2100;     // px/s^2
const JUMP_V = -790;      // initial jump velocity (peak ~150px)
const MAX_FALL = 1200;

export function makePlayer(spawn) {
  return {
    x: spawn.x, y: spawn.y,
    w: 26, h: 38,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1,
    spawn: { ...spawn },
    glitch: 0, // visual flicker timer
  };
}

export function resetPlayer(p) {
  p.x = p.spawn.x; p.y = p.spawn.y;
  p.vx = 0; p.vy = 0; p.onGround = false;
}

// dt in seconds. `platforms` is the live array (solid flags respected).
export function updatePlayer(p, dt, platforms, keys) {
  // --- horizontal ---
  let dir = 0;
  if (keys.left) dir -= 1;
  if (keys.right) dir += 1;
  p.vx = dir * SPEED;
  if (dir !== 0) p.facing = dir;

  // --- gravity (scaled live by the gravity bug) ---
  p.vy = Math.min(p.vy + GRAVITY * GAME.gravityScale * dt, MAX_FALL);

  // --- jump ---
  if (keys.jump && p.onGround) {
    p.vy = JUMP_V;
    p.onGround = false;
  }

  // --- integrate + resolve per axis (simple swept AABB) ---
  p.x += p.vx * dt;
  resolveAxis(p, platforms, "x");
  p.y += p.vy * dt;
  p.onGround = false;
  resolveAxis(p, platforms, "y");

  // --- fell out of the world: respawn (no death screen in the slice) ---
  if (p.y > WORLD.h + 120) {
    resetPlayer(p);
    return "respawn";
  }
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
      if (p.vy > 0) { p.y = pl.y - p.h; p.onGround = true; }
      else if (p.vy < 0) { p.y = pl.y + pl.h; }
      p.vy = 0;
    }
  }
}
