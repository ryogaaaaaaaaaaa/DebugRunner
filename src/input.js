import { GAME } from "./state.js";
import { ensureAudio } from "./audio.js";

// Maps several physical keys to logical actions.
const MAP = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  Space: "jump", ArrowUp: "jump", KeyW: "jump",
  ArrowDown: "down", KeyS: "down",
  Tab: "debug",
  Enter: "confirm",
  KeyR: "retry",
  Escape: "pause",
  KeyM: "mute",
};

export function initInput() {
  window.addEventListener("keydown", (e) => {
    ensureAudio(); // first key gesture unlocks the audio context
    const action = MAP[e.code];
    if (!action) return;
    // Tab/Space/Arrows scroll the page by default — stop that.
    if (["Tab", "Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
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
    ["tc-jump", "jump"], ["tc-debug", "debug"], ["tc-pause", "pause"],
  ];
  for (const [id, action] of map) {
    const node = document.getElementById(id);
    if (!node) continue;
    const down = (e) => { e.preventDefault(); ensureAudio(); pressAction(action); node.classList.add("held"); };
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
