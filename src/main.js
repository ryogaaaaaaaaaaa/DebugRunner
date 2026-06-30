import { GAME, VIEW, WORLD, resetGame, resetStageModifiers } from "./state.js";
import { initInput, justPressed, clearPressed } from "./input.js";
import { buildStage, STAGE_COUNT } from "./stages.js";
import { makePlayer, resetPlayer, updatePlayer } from "./player.js";
import {
  log, clearLog, setStageLabel, showToast, hideToast,
  renderDebugPanel, openDebug, closeDebug,
  showClear, hideClear, emitMetaLine, glitchBuildLabel, setIncursionClass,
  showTitle, hideTitle,
} from "./ui.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const BUILD_LABEL = "BUILD v0.3.1 (TEST)";
const ENEMY_SPEED = 130; // px/s when a fixed enemy patrols

let stage, player;
let phase;            // 'title' | 'play' | 'cleared' | 'won'
let panelSel, panelAction;
let metaTimer, glitchTimer, glitchOn;

// expose a tiny debug handle (it IS a debug game) — handy for testing/tinkering
window.__DR = { GAME, get stage() { return stage; }, get player() { return player; } };

// ---------------- title ----------------
function toTitle() {
  phase = "title";
  stage = null;
  setIncursionClass(0);
  showTitle();
}

// ---------------- run / stage flow ----------------
function startRun() {
  hideTitle();
  resetGame();
  clearLog();
  hideClear();
  GAME.startTime = performance.now();
  log("[INFO] build v0.3.1 (TEST) loaded", "info");
  log("[INFO] tester session started", "info");
  loadStage(0);
}

function loadStage(index) {
  stage = buildStage(index);
  GAME.stageIndex = index;
  WORLD.w = stage.world.w;
  WORLD.h = stage.world.h;
  resetStageModifiers();
  player = makePlayer(stage.spawn);
  panelSel = 0; panelAction = "fix";
  phase = "play";
  metaTimer = 0; glitchTimer = 0; glitchOn = false;

  setStageLabel(stage.name);
  hideToast();
  closeDebug();
  updateIncursion();
  log(`[INFO] loading ${stage.name.toLowerCase()}...`, "info");
  clearPressed();
}

function detectedBugs() {
  return stage.bugs.filter((b) => b.state !== "dormant");
}

function updateIncursion() {
  // 演出段階②(UI/log異変) from STAGE 1, deepening (faster) by STAGE 2 / high corruption.
  let lvl = 0;
  if (GAME.stageIndex >= 2 || GAME.corruption >= 4) lvl = 2;
  else if (GAME.stageIndex >= 1 || GAME.corruption >= 2) lvl = 1;
  GAME.incursion = lvl;
  setIncursionClass(lvl);
}

// ---------------- update ----------------
function update(dt) {
  if (phase === "title") {
    if (justPressed("confirm") || justPressed("jump") || justPressed("retry")) startRun();
    return;
  }
  if (phase === "won") {
    if (justPressed("retry")) startRun();
    return;
  }
  if (phase === "cleared") {
    if (justPressed("confirm") || justPressed("right") || justPressed("jump")) advance();
    return;
  }

  GAME.elapsed = (performance.now() - GAME.startTime) / 1000;

  // debug panel toggle
  if (justPressed("debug")) {
    GAME.paused = !GAME.paused;
    if (GAME.paused) {
      openDebug();
      panelSel = 0;
      renderDebugPanel(detectedBugs(), panelSel, panelAction);
    } else {
      closeDebug();
    }
  }

  if (GAME.paused) { handlePanelInput(); return; }

  // gameplay — frozen enemies act as solid platforms; woken ones don't block.
  updateEnemies(dt);
  const solids = stage.platforms.concat(stage.enemies);
  const ev = updatePlayer(player, dt, solids, GAME.keys);
  if (ev === "respawn") log("[INFO] tester respawned", "info");

  // a woken (dangerous) enemy that touches the tester sends them back
  for (const e of stage.enemies) {
    if (e.dangerous && aabb(player, e)) {
      resetPlayer(player);
      log("[ERROR] guard_01 caught the tester", "err");
    }
  }

  // bug triggers (x-zone based)
  for (const b of stage.bugs) {
    if (b.state === "dormant" && player.x > b.triggerX) {
      b.activate(stage);
      showToast();
      log(`[WARN] ${b.id} ${b.code} detected`, "warn");
    }
  }

  updateCamera(dt);
  tickFades(dt);
  tickIncursion(dt);

  // goal?
  if (aabb(player, stage.goal)) onGoal();
}

function handlePanelInput() {
  const bugs = detectedBugs();
  if (!bugs.length) return;
  let changed = false;

  if (justPressed("jump")) { // up/down through the list (W/Up mapped to jump)
    panelSel = (panelSel + 1) % bugs.length;
    panelAction = "fix"; // each bug starts on FIX so selection is predictable
    changed = true;
  }
  if (justPressed("left") || justPressed("right")) {
    panelAction = panelAction === "fix" ? "ignore" : "fix";
    changed = true;
  }
  if (justPressed("confirm")) {
    const bug = bugs[panelSel];
    if (!bug.resolved) {
      if (panelAction === "fix") bug.fix(stage);
      else bug.ignore(stage);
      if (detectedBugs().every((b) => b.resolved)) hideToast();
      updateIncursion();
      changed = true;
    }
  }
  if (changed) renderDebugPanel(detectedBugs(), panelSel, panelAction);
}

function updateCamera(dt) {
  const cx = player.x + player.w / 2 - VIEW.w / 2;
  let cy = player.y + player.h / 2 - VIEW.h / 2;
  // camera bug: release the vertical clamp and drift up to reveal the secret
  if (GAME.cameraUnclamped) cy -= 200;
  const tx = clamp(cx, 0, WORLD.w - VIEW.w);
  const ty = clamp(cy, GAME.cameraUnclamped ? -40 : 0, WORLD.h - VIEW.h);
  const k = Math.min(1, dt * 8);
  GAME.camera.x += (tx - GAME.camera.x) * k;
  GAME.camera.y += (ty - GAME.camera.y) * k;
}

function updateEnemies(dt) {
  for (const e of stage.enemies) {
    if (!e.dangerous) continue; // frozen: stays put (and stays solid)
    e.x += e.dir * ENEMY_SPEED * dt;
    if (e.x <= e.x0) { e.x = e.x0; e.dir = 1; }
    if (e.x >= e.x1) { e.x = e.x1; e.dir = -1; }
  }
}

function tickFades(dt) {
  for (const pl of stage.platforms) {
    if (pl.fading) {
      pl.alpha = Math.max(0, (pl.alpha ?? 1) - dt * 0.6);
      if (pl.alpha === 0) pl.fading = false;
    }
  }
}

function tickIncursion(dt) {
  if (GAME.incursion < 1) return;
  // occasional unsettling log line
  metaTimer -= dt;
  if (metaTimer <= 0) { emitMetaLine(); metaTimer = 6 + Math.random() * 5; }
  // brief HUD build-label glitch
  glitchTimer -= dt;
  if (glitchTimer <= 0) {
    glitchOn = !glitchOn;
    glitchBuildLabel(BUILD_LABEL, glitchOn);
    glitchTimer = glitchOn ? 0.18 : 2.5 + Math.random() * 2.5;
  }
}

function onGoal() {
  const summary = stage.bugs
    .map((b) => `${b.id}: <b>${b.state.toUpperCase()}</b>`)
    .join("<br>");
  GAME.routes[GAME.stageIndex] = summary;
  log("[META] tester reached goal. build flagged for review.", "meta");

  if (GAME.stageIndex < STAGE_COUNT - 1) {
    phase = "cleared";
    showClear({
      title: "STAGE CLEAR",
      sub: stage.name,
      stats: `${summary}<br><br>corruption: <b>${GAME.corruption}</b> &nbsp; time: <b>${GAME.elapsed.toFixed(1)}s</b>`,
      buttonLabel: "CONTINUE  [→]",
    });
  } else {
    phase = "won";
    const all = GAME.routes.map((s, i) => `<div style="margin:4px 0">[stage ${i}]<br>${s}</div>`).join("");
    showClear({
      title: "BUILD STABLE?",
      sub: "ALL STAGES CLEAR",
      stats: `${all}<br>corruption: <b>${GAME.corruption}</b> &nbsp; time: <b>${GAME.elapsed.toFixed(1)}s</b><br><br><span style="color:#56e39f">the build is still watching.</span>`,
      buttonLabel: "RETRY  [R]",
    });
  }
}

function advance() {
  hideClear();
  loadStage(GAME.stageIndex + 1);
}

// ---------------- render ----------------
function render() {
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  drawBackground();
  if (!stage) return; // title screen: just the backdrop behind the overlay
  ctx.save();
  ctx.translate(-Math.round(GAME.camera.x), -Math.round(GAME.camera.y));
  drawPlatforms();
  drawEnemies();
  drawGoal();
  drawPlayer();
  ctx.restore();
  drawTriggerHint();
}

function drawEnemies() {
  for (const e of stage.enemies) {
    if (e.dangerous) {
      ctx.fillStyle = "#e35664";
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = "#0c0e12"; // eye looks toward travel direction
      ctx.fillRect(e.x + (e.dir > 0 ? e.w - 13 : 7), e.y + 12, 6, 6);
    } else {
      const j = (Math.sin(performance.now() / 80 + e.x) * 2) | 0;
      ctx.fillStyle = "rgba(227,86,100,0.22)";
      ctx.fillRect(e.x + j, e.y, e.w, e.h);
      ctx.strokeStyle = "#e35664"; ctx.setLineDash([4, 3]);
      ctx.strokeRect(e.x, e.y, e.w, e.h); ctx.setLineDash([]);
      ctx.fillStyle = "#7f8a96"; ctx.font = "9px 'Courier New', monospace";
      ctx.textAlign = "center"; ctx.fillText("idle", e.x + e.w / 2, e.y - 4); ctx.textAlign = "left";
    }
  }
}

function drawBackground() {
  ctx.fillStyle = "#0c0e12";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.strokeStyle = "#161b22";
  ctx.lineWidth = 1;
  const offX = -((GAME.camera.x * 0.4) % 48);
  for (let x = offX; x < VIEW.w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VIEW.h); ctx.stroke(); }
  const offY = -((GAME.camera.y * 0.4) % 48);
  for (let y = offY; y < VIEW.h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VIEW.w, y); ctx.stroke(); }
}

function drawPlatforms() {
  for (const pl of stage.platforms) {
    if (pl.id === "end_wall") continue; // invisible boundary
    const a = pl.alpha ?? 1;
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    if (pl.glitchy) {
      const j = (Math.sin(performance.now() / 60 + pl.x) * 3) | 0;
      ctx.fillStyle = pl.solid ? "#2a3340" : "rgba(227,86,100,0.25)";
      ctx.fillRect(pl.x + j, pl.y, pl.w, pl.h);
      ctx.strokeStyle = "#e35664"; ctx.setLineDash([6, 4]);
      ctx.strokeRect(pl.x, pl.y, pl.w, pl.h); ctx.setLineDash([]);
    } else {
      ctx.fillStyle = pl.id === "secret" ? "#23332b" : "#28303a";
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.strokeStyle = pl.id === "secret" ? "#56e39f55" : "#3a4552";
      ctx.strokeRect(pl.x + 0.5, pl.y + 0.5, pl.w - 1, pl.h - 1);
      if (pl.id === "secret") { // hint of a collectible on the secret ledge
        ctx.fillStyle = "#56e39f";
        ctx.fillRect(pl.x + pl.w / 2 - 5, pl.y - 14, 10, 10);
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawGoal() {
  const g = stage.goal;
  ctx.fillStyle = "#56e39f";
  ctx.fillRect(g.x, g.y, 4, g.h);
  ctx.beginPath();
  ctx.moveTo(g.x + 4, g.y);
  ctx.lineTo(g.x + 26, g.y + 12);
  ctx.lineTo(g.x + 4, g.y + 24);
  ctx.closePath();
  ctx.fill();
}

function drawPlayer() {
  const p = player;
  ctx.fillStyle = "#d7dde2";
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = "#0c0e12";
  const ex = p.facing > 0 ? p.x + p.w - 9 : p.x + 4;
  ctx.fillRect(ex, p.y + 8, 5, 5);
}

function drawTriggerHint() {
  if (GAME.paused || phase !== "play") return;
  const unresolved = detectedBugs().some((b) => !b.resolved);
  if (!unresolved) return;
  const sx = player.x + player.w / 2 - GAME.camera.x;
  const sy = player.y - GAME.camera.y - 14;
  ctx.fillStyle = "#e3c356";
  ctx.font = "12px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("[TAB] DEBUG", sx, sy);
  ctx.textAlign = "left";
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
  if (dt > 0.05) dt = 0.05;
  update(dt);
  render();
  clearPressed();
  requestAnimationFrame(frame);
}

document.getElementById("clear-retry").addEventListener("click", () => {
  if (phase === "cleared") advance();
  else startRun();
});
document.getElementById("title-start").addEventListener("click", () => {
  if (phase === "title") startRun();
});
initInput();
toTitle();
requestAnimationFrame(frame);
