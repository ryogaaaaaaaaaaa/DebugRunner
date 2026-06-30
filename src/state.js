// Shared, mutable game state. Imported by every module.
export const VIEW = { w: 960, h: 540 };
export const WORLD = { w: 1600, h: 720 };

export const GAME = {
  keys: {},          // pressed keys (set by input.js)
  pressed: {},       // one-frame "just pressed" edge
  camera: { x: 0, y: 0 },
  corruption: 0,     // increments on every FIX (drives later incursion stages)
  route: null,       // 'FIX' | 'IGNORE' — which solution the player committed to
  paused: false,     // true while the debug panel is open (gameplay frozen)
  won: false,
  startTime: 0,
  elapsed: 0,
};

export function resetGame() {
  GAME.corruption = 0;
  GAME.route = null;
  GAME.paused = false;
  GAME.won = false;
  GAME.startTime = 0;
  GAME.elapsed = 0;
  GAME.camera.x = 0;
  GAME.camera.y = 0;
}
