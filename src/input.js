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

// Programmatic equivalents of key down/up, used by on-screen touch buttons.
export function pressAction(action) {
  if (!GAME.keys[action]) GAME.pressed[action] = true; // rising edge
  GAME.keys[action] = true;
}
export function releaseAction(action) {
  GAME.keys[action] = false;
}

// Wires the on-screen control buttons. Returns true if a touch device.
export function bindTouchControls() {
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add("touch");

  const map = [
    ["tc-left", "left"], ["tc-right", "right"],
    ["tc-jump", "jump"], ["tc-debug", "debug"],
  ];
  for (const [id, action] of map) {
    const node = document.getElementById(id);
    if (!node) continue;
    const down = (e) => { e.preventDefault(); pressAction(action); node.classList.add("held"); };
    const up = (e) => { e.preventDefault(); releaseAction(action); node.classList.remove("held"); };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    node.addEventListener("pointerleave", up);
    node.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  return isTouch;
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
