import { GAME, VIEW, WORLD, resetGame } from "./state.js";
import { initInput, justPressed, clearPressed } from "./input.js";
import { makeLevel } from "./level.js";
import { makePlayer, resetPlayer, updatePlayer } from "./player.js";
import { makeBugRegistry } from "./bugs.js";
import {
  log, clearLog, showToast, hideToast,
  renderDebugPanel, openDebug, closeDebug,
  showClear, hideClear,
} from "./ui.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

let level, player, bugs, activeBug, panelSel, toastShown;

function start() {
  resetGame();
  clearLog();
  hideToast();
  closeDebug();
  hideClear();

  level = makeLevel();
  player = makePlayer(level.spawn);
  bugs = makeBugRegistry(level);
  activeBug = null;
  panelSel = "fix";
  toastShown = false;

  log("[INFO] build v0.3.1 (TEST) loaded", "info");
  log("[INFO] tester session started", "info");
  GAME.startTime = performance.now();
  clearPressed();
}

// ---------------- update ----------------
function update(dt) {
  if (GAME.won) {
    if (justPressed("retry")) start();
    return;
  }

  GAME.elapsed = (performance.now() - GAME.startTime) / 1000;

  // --- debug panel toggle ---
  if (justPressed("debug")) {
    GAME.paused = !GAME.paused;
    if (GAME.paused) {
      openDebug();
      if (activeBug) renderDebugPanel(activeBug, panelSel);
    } else {
      closeDebug();
    }
  }

  if (GAME.paused) {
    handlePanelInput();
    return; // gameplay frozen while panel is open
  }

  // --- gameplay ---
  const ev = updatePlayer(player, dt, level.platforms, GAME.keys);
  if (ev === "respawn") log("[INFO] tester respawned", "info");

  // bug trigger
  const newBug = bugs.checkTriggers(player, level);
  if (newBug) {
    activeBug = newBug;
    showToast();
    toastShown = true;
    log("[WARN] BUG#01 PLATFORM_COLLISION detected", "warn");
  }

  // camera follows player, clamped to the world
  GAME.camera.x = clamp(player.x + player.w / 2 - VIEW.w / 2, 0, WORLD.w - VIEW.w);
  GAME.camera.y = clamp(player.y + player.h / 2 - VIEW.h / 2, 0, WORLD.h - VIEW.h);

  // tick fading side-effect block
  for (const pl of level.platforms) {
    if (pl.fading && pl.alpha === undefined) pl.alpha = 1;
    if (pl.fading) pl.alpha = Math.max(0, (pl.alpha ?? 1) - dt * 0.6);
  }

  // goal reached?
  if (aabb(player, level.goal)) {
    GAME.won = true;
    log("[META] tester reached goal. build flagged for review.", "meta");
    showClear();
  }
}

function handlePanelInput() {
  if (!activeBug) return;
  if (activeBug.resolved) return; // locked after a decision

  if (justPressed("left") || justPressed("right")) {
    panelSel = panelSel === "fix" ? "ignore" : "fix";
    renderDebugPanel(activeBug, panelSel);
  }
  if (justPressed("confirm")) {
    if (panelSel === "fix") activeBug.fix();
    else activeBug.ignore();
    hideToast();
    renderDebugPanel(activeBug, panelSel);
  }
}

// ---------------- render ----------------
function render() {
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  drawBackground();

  ctx.save();
  ctx.translate(-Math.round(GAME.camera.x), -Math.round(GAME.camera.y));

  drawPlatforms();
  drawGoal();
  drawPlayer();

  ctx.restore();

  drawTriggerHint();
}

function drawBackground() {
  ctx.fillStyle = "#0c0e12";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  // parallax grid — the "test build" world look
  ctx.strokeStyle = "#161b22";
  ctx.lineWidth = 1;
  const off = -((GAME.camera.x * 0.4) % 48);
  for (let x = off; x < VIEW.w; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VIEW.h); ctx.stroke();
  }
  const offY = -((GAME.camera.y * 0.4) % 48);
  for (let y = offY; y < VIEW.h; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VIEW.w, y); ctx.stroke();
  }
}

function drawPlatforms() {
  for (const pl of level.platforms) {
    const a = pl.alpha ?? 1;
    if (a <= 0) continue;
    ctx.globalAlpha = a;

    if (pl.glitchy) {
      // glitch flicker for buggy / breaking platforms
      const j = (Math.sin(performance.now() / 60 + pl.x) * 3) | 0;
      ctx.fillStyle = pl.solid ? "#2a3340" : "rgba(227,86,100,0.25)";
      ctx.fillRect(pl.x + j, pl.y, pl.w, pl.h);
      ctx.strokeStyle = "#e35664";
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = "#28303a";
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.strokeStyle = "#3a4552";
      ctx.strokeRect(pl.x + 0.5, pl.y + 0.5, pl.w - 1, pl.h - 1);
    }
    ctx.globalAlpha = 1;
  }
}

function drawGoal() {
  const g = level.goal;
  ctx.fillStyle = "#56e39f";
  ctx.fillRect(g.x, g.y, 4, g.h);
  ctx.beginPath();
  ctx.moveTo(g.x + 4, g.y);
  ctx.lineTo(g.x + 4 + 22, g.y + 12);
  ctx.lineTo(g.x + 4, g.y + 24);
  ctx.closePath();
  ctx.fill();
}

function drawPlayer() {
  const p = player;
  ctx.fillStyle = "#d7dde2";
  ctx.fillRect(p.x, p.y, p.w, p.h);
  // eye (facing)
  ctx.fillStyle = "#0c0e12";
  const ex = p.facing > 0 ? p.x + p.w - 9 : p.x + 4;
  ctx.fillRect(ex, p.y + 8, 5, 5);
}

function drawTriggerHint() {
  // small floating "[TAB]" prompt over the bug while unresolved
  if (activeBug && !activeBug.resolved && !GAME.paused) {
    const buggy = level.platforms.find((p) => p.id === "buggy");
    const sx = buggy.x + buggy.w / 2 - GAME.camera.x;
    const sy = buggy.y - GAME.camera.y - 16;
    if (sx > 0 && sx < VIEW.w) {
      ctx.fillStyle = "#e3c356";
      ctx.font = "12px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("[TAB] DEBUG", sx, sy);
      ctx.textAlign = "left";
    }
  }
}

// ---------------- helpers ----------------
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------------- loop ----------------
let last = 0;
function frame(now) {
  if (!last) last = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp big hitches
  update(dt);
  render();
  clearPressed(); // one-frame edge model: consume all "just pressed" each frame
  requestAnimationFrame(frame);
}

document.getElementById("clear-retry").addEventListener("click", start);
initInput();
start();
requestAnimationFrame(frame);
