// Shared, mutable game state. Imported by every module.
export const VIEW = { w: 960, h: 540 };

// World bounds of the CURRENT stage. Updated by loadStage().
export const WORLD = { w: 1600, h: 720 };

export const GAME = {
  keys: {},          // pressed keys (set by input.js)
  pressed: {},       // one-frame "just pressed" edge
  camera: { x: 0, y: 0 },

  // run-wide
  corruption: 0,     // increments on every FIX — drives the incursion stages
  incursion: 0,      // 0 none / 1 UI+log anomalies / 2 deeper
  panelCorrupt: false, // 演出段階③: the debug panel itself gets corrupted
  stageIndex: 0,
  routes: [],        // per-stage decision summary, e.g. ['IGNORE', 'FIX/IGNORE']

  // per-stage live modifiers (bugs write these)
  gravityScale: 1,   // 1 = normal; gravity bug drops it (floaty)
  cameraUnclamped: false, // camera bug releases the vertical clamp (reveals secrets)

  // flow
  paused: false,     // true while the debug panel is open (gameplay frozen)
  won: false,
  startTime: 0,
  elapsed: 0,
};

// Reset everything for a fresh run from STAGE 0.
export function resetGame() {
  GAME.corruption = 0;
  GAME.incursion = 0;
  GAME.panelCorrupt = false;
  GAME.stageIndex = 0;
  GAME.routes = [];
  GAME.won = false;
  GAME.startTime = 0;
  GAME.elapsed = 0;
  resetStageModifiers();
}

// Reset only the per-stage live modifiers (called on each stage load).
export function resetStageModifiers() {
  GAME.gravityScale = 1;
  GAME.cameraUnclamped = false;
  GAME.paused = false;
  GAME.camera.x = 0;
  GAME.camera.y = 0;
}
