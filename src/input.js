import { GAME } from "./state.js";

// Maps several physical keys to logical actions.
const MAP = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  Space: "jump", ArrowUp: "jump", KeyW: "jump",
  Tab: "debug",
  Enter: "confirm",
  KeyR: "retry",
};

export function initInput() {
  window.addEventListener("keydown", (e) => {
    const action = MAP[e.code];
    if (!action) return;
    // Tab/Space scroll the page by default — stop that.
    if (e.code === "Tab" || e.code === "Space") e.preventDefault();
    if (!GAME.keys[action]) GAME.pressed[action] = true; // rising edge
    GAME.keys[action] = true;
  });

  window.addEventListener("keyup", (e) => {
    const action = MAP[e.code];
    if (!action) return;
    GAME.keys[action] = false;
  });
}

// Returns true once per physical press. Call from the game loop.
export function justPressed(action) {
  if (GAME.pressed[action]) {
    GAME.pressed[action] = false;
    return true;
  }
  return false;
}

export function clearPressed() {
  GAME.pressed = {};
}
