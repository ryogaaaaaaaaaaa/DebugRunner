import { GAME, VIEW, WORLD, resetGame, resetStageModifiers } from "./state.js";
import { initInput, justPressed, clearPressed, bindTouchControls } from "./input.js";
import { buildStage, buildLab, buildLabHammer, STAGE_COUNT, FRAGMENT_TOTAL } from "./stages.js";
import { makePlayer, resetPlayer, updatePlayer } from "./player.js";
import { ensureAudio, sfx } from "./audio.js";
import { FX, shake, hitstop, flash, glitch, burst, updateFX, frozen, shakeOffset, drawParticles, postFX, resetFX } from "./fx.js";
import {
  log, clearLog, setStageLabel, showToast, hideToast,
  renderDebugPanel, openDebug, closeDebug,
  showClear, hideClear, emitMetaLine, glitchBuildLabel, setIncursionClass,
  showTitle, hideTitle,
  showEnding, hideEnding, pushEndingLine, showEndingRestart,
  setMeta,
} from "./ui.js";

const integrity = () => Math.max(0, 100 - GAME.corruption * 15);

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const BUILD_LABEL = "BUILD v0.3.1 (TEST)";
const ENEMY_SPEED = 130; // px/s when a fixed enemy patrols

let stage, player;
let phase;            // 'title' | 'play' | 'cleared' | 'won' | 'ending' | 'pause'
let prevPausePhase;   // phase to return to when unpausing
let panelSel, panelAction;
let metaTimer, glitchTimer, glitchOn;
let endKind, endTimer, endStep, endLines, endDoneAt, endRestartShown, endBase, endOverlayAt;
let fixState = null;      // hammer-fix in progress: { target, t }
let fixPrompt = null;     // hammerable target currently in range (for the prompt)
const FIX_DUR = 1.35;

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
  ensureAudio();
  hideTitle();
  resetGame();
  GAME.labMode = false;
  clearLog();
  hideClear();
  GAME.startTime = performance.now();
  log("[INFO] build v0.3.1 (TEST) loaded", "info");
  log("[INFO] tester session started", "info");
  loadStage(0);
}

// Prototype labs (?lab / ?lab=hammer) — standalone design experiments.
let labKind = "paradox";
function startLab(kind) {
  labKind = kind || labKind;
  ensureAudio();
  hideTitle();
  resetGame();
  GAME.labMode = true;
  clearLog();
  hideClear();
  hideEnding();
  fixState = null;
  GAME.startTime = performance.now();
  GAME.stageIndex = 1; // mild incursion flavor
  log(`[INFO] prototype: ${labKind} lab loaded`, "info");
  applyStage(labKind === "hammer" ? buildLabHammer() : buildLab());
}

function applyStage(s) {
  stage = s;
  WORLD.w = s.world.w;
  WORLD.h = s.world.h;
  resetStageModifiers();
  player = makePlayer(s.spawn);
  panelSel = 0; panelAction = "fix";
  phase = "play";
  metaTimer = 0; glitchTimer = 0; glitchOn = false;

  setStageLabel(s.name);
  document.body.classList.toggle("stage-ui", s.stageUi === true);
  hideToast();
  closeDebug();
  resetFX();
  updateIncursion();
  log(`[INFO] loading ${s.name.toLowerCase()}...`, "info");
  clearPressed();
}

function loadStage(index) {
  GAME.stageIndex = index;
  applyStage(buildStage(index));
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
  // 演出段階③: the debug panel itself starts corrupting on the UI stage.
  GAME.panelCorrupt = GAME.stageIndex >= 3 || GAME.corruption >= 6;
  setIncursionClass(lvl);
}

// ---------------- update ----------------
function update(dt) {
  if (justPressed("mute")) toggleMute(); // works in every phase
  if (phase === "title") {
    if (justPressed("confirm") || justPressed("jump") || justPressed("retry")) startRun();
    return;
  }
  if (phase === "pause") {
    if (justPressed("pause") || justPressed("confirm")) resumeGame();
    return;
  }
  if (phase === "ending") { tickEnding(dt); return; }
  if (phase === "won") {
    if (justPressed("retry")) { GAME.labMode ? startLab() : startRun(); }
    return;
  }
  if (phase === "cleared") {
    if (justPressed("confirm") || justPressed("right") || justPressed("jump")) advance();
    return;
  }

  GAME.elapsed = (performance.now() - GAME.startTime) / 1000;

  // pause (Esc). If the debug panel is open, Esc closes it instead.
  if (justPressed("pause")) {
    if (GAME.paused) { GAME.paused = false; closeDebug(); }
    else { enterPause(); return; }
  }

  // ---- hammer fix (unified across the whole game) ----
  // The "fix button" (E / Tab / mobile ⚙) hammers the nearby glitching thing.
  // Leaving a bug alone (not hammering) = using it. No debug panel.
  if (fixState) { tickFix(dt); return; } // frozen mid-hammer
  fixPrompt = nearestFixTarget();
  if (fixPrompt && (justPressed("interact") || justPressed("debug"))) { startFix(fixPrompt); return; }

  // gameplay — frozen enemies act as solid platforms; woken ones don't block.
  updateEnemies(dt);
  const solids = stage.platforms.concat(stage.enemies);
  const jumpPressed = justPressed("jump");
  const ev = updatePlayer(player, dt, solids, GAME.keys, jumpPressed);
  if (ev === "respawn") { respawnPlayer(); log("[INFO] tester respawned", "info"); }

  // record a checkpoint on stable ground (not UI/enemy — those can vanish)
  if (player.onGround && isStableGround(player.groundId)) {
    GAME.checkpoint = { x: player.x, y: player.y };
  }

  // a woken (dangerous) enemy that touches the tester sends them back
  for (const e of stage.enemies) {
    if (e.dangerous && aabb(player, e)) {
      sfx("hit");
      respawnPlayer();
      log("[ERROR] guard_01 caught the tester", "err");
    }
  }

  // hazards (spikes) — touch sends you back
  for (const h of (stage.hazards || [])) {
    if (aabb(player, h)) {
      sfx("hit");
      respawnPlayer();
      log("[ERROR] tester hit a hazard", "err");
    }
  }

  // data fragments — only sit on bug-use routes, so grabbing one means you
  // chose to leave a bug alone (the reward side of the fix-vs-use trade).
  for (const f of stage.fragments) {
    if (f.got) continue;
    // logical gate: some fragments require a specific platform to still be solid
    if (f.requires) {
      const pl = stage.platforms.find((pp) => pp.id === f.requires);
      if (!pl || !pl.solid) continue;
    }
    if (aabb(player, { x: f.x, y: f.y, w: 22, h: 22 })) {
      f.got = true;
      GAME.fragments += 1;
      sfx("collect"); shake(5, 0.12);
      burst(f.x + 11, f.y + 11, { n: 14, color: ["#56e39f", "#d7ffe9"], spd: 240, life: 0.5, grav: 400, up: 40 });
      log(`[INFO] data fragment recovered (${GAME.fragments}/${FRAGMENT_TOTAL})`, "meta");
    }
  }

  // bug triggers (x-zone based)
  for (const b of stage.bugs) {
    if (b.state === "dormant" && player.x > b.triggerX) {
      b.activate(stage);
      showToast();
      log(`[WARN] ${b.id} ${b.code} detected`, "warn");
      sfx(b.code === "TESTER_PRESENCE" ? "stinger" : b.code === "UI_COLLIDER" ? "solidify" : "detect");
      // spectacle: the bug "breaks" the screen when it appears
      if (b.code === "TESTER_PRESENCE") { glitch("invert", 0.6, 1); shake(14, 0.5); flash(0.25, "#e35664", 0.5); }
      else { glitch("tear", 0.4, 1); shake(9, 0.28); }
    }
  }

  updateCamera(dt);
  tickFades(dt);
  tickIncursion(dt);
  if (GAME.flash > 0) GAME.flash = Math.max(0, GAME.flash - dt);

  // goal? (the final stage has none — it ends on the decision)
  if (stage.goal && aabb(player, stage.goal)) onGoal();
}

function handlePanelInput() {
  const bugs = detectedBugs();
  if (!bugs.length) return;
  let changed = false;

  if (justPressed("jump")) { // ↑ / W / Space — previous bug
    panelSel = (panelSel - 1 + bugs.length) % bugs.length;
    panelAction = "fix"; sfx("select"); changed = true;
  }
  if (justPressed("down")) { // ↓ / S — next bug
    panelSel = (panelSel + 1) % bugs.length;
    panelAction = "fix"; sfx("select"); changed = true;
  }
  if (justPressed("left") || justPressed("right")) {
    panelAction = panelAction === "fix" ? "ignore" : "fix";
    sfx("select"); changed = true;
  }
  if (justPressed("confirm")) {
    applyDecision(panelSel, panelAction);
    return;
  }
  if (changed) renderDebugPanel(detectedBugs(), panelSel, panelAction);
}

// Apply FIX/IGNORE to a detected bug by index. Shared by keyboard (Enter) and
// by directly tapping the FIX/IGNORE buttons on touch.
function applyDecision(i, action) {
  const bugs = detectedBugs();
  const bug = bugs[i];
  if (!bug || bug.resolved) return;
  if (action === "fix") bug.fix(stage);
  else bug.ignore(stage);
  if (bug.code !== "TESTER_PRESENCE") sfx(action === "fix" ? "fix" : "ignore");
  if (detectedBugs().every((b) => b.resolved)) hideToast();
  updateIncursion();
  panelSel = i; panelAction = action;
  renderDebugPanel(detectedBugs(), panelSel, panelAction);

  // 演出段階④: the finale — the tester is the fix target.
  if (bug.code === "TESTER_PRESENCE") {
    GAME.paused = false;
    closeDebug();
    startEnding(action === "fix" ? "patched" : "unresolved");
  }
}

// ---------------- ending (演出段階④) ----------------
function startEnding(kind) {
  phase = "ending";
  endKind = kind;
  endTimer = 0; endStep = 0; endDoneAt = null; endRestartShown = false; endBase = null;
  player.dissolve = 0;
  // patched: let the player dissolve on the canvas first, then show the overlay
  endOverlayAt = kind === "patched" ? 1.8 : 0.2;
  endLines = buildEndingLines(kind);
  sfx(kind === "patched" ? "patch" : "stinger");
  hideToast();
  log(kind === "patched" ? "[meta] tester patched. build stable." : "[meta] tester refused. build unresolved.", "meta");
}

// The finale reflects the WHOLE run: how much you fixed (corruption) and how
// many fragments you kept by leaving bugs alone.
function buildEndingLines(kind) {
  const allFrags = GAME.fragments >= FRAGMENT_TOTAL;
  const noFrags = GAME.fragments === 0;
  const fixedALot = GAME.corruption >= 5;

  if (kind === "patched") {
    const lines = [
      ["> patching tester...", "warn"],
      ["> removing unregistered entity: 'tester'", "warn"],
      ["> tester removed.", "meta"],
    ];
    if (allFrags) lines.push(["> the fragments it hoarded are gone too.", "warn"]);
    else if (noFrags) lines.push(["> it left nothing behind.", "info"]);
    if (fixedALot) {
      lines.push(["you fixed everything. it was never the bug.", "meta"]);
      lines.push(["STILL UNSTABLE.", "bigerr"]);
    } else {
      lines.push(["you were the only thing they couldn't debug.", "meta"]);
      lines.push(["BUILD STABLE.", "big"]);
    }
    return lines;
  }
  // unresolved
  const lines = [
    ["> patch declined by tester.", "warn"],
    ["> build integrity: UNRESOLVED", "err"],
  ];
  if (allFrags) lines.push(["> you took everything and refused.", "meta"]);
  lines.push([fixedALot ? "you fixed so much. and still you stay." : "you barely fixed us. you just used us.", "meta"]);
  lines.push(["it is still watching.", "bigerr"]);
  return lines;
}

function tickEnding(dt) {
  endTimer += dt;
  if (endKind === "patched") player.dissolve = Math.min(1, endTimer / 1.8);

  // hold on the (dissolving) game, then bring up the ending overlay
  if (endBase === null) {
    if (endTimer >= endOverlayAt) { showEnding(); endBase = endTimer; }
    return;
  }
  const t = endTimer - endBase;
  if (endStep < endLines.length && t >= endStep * 1.2) {
    pushEndingLine(endLines[endStep][0], endLines[endStep][1]);
    endStep++;
    if (endStep === endLines.length) endDoneAt = t + 1.4;
  }
  if (endDoneAt !== null && t >= endDoneAt && !endRestartShown) {
    showEndingRestart();
    endRestartShown = true;
  }
  if (endRestartShown && (justPressed("confirm") || justPressed("retry") || justPressed("jump"))) {
    endToTitle();
  }
}

function endToTitle() {
  hideEnding();
  toTitle();
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
    if (glitchOn) sfx("glitch");
    glitchTimer = glitchOn ? 0.18 : 2.5 + Math.random() * 2.5;
  }
}

function onGoal() {
  if (stage.lab) { // prototype: the finale is just a result card
    phase = "won";
    const isHammer = labKind === "hammer";
    showClear({
      title: "PROTOTYPE CLEAR",
      sub: isHammer ? "hammer fix" : "paradox slice",
      stats: isHammer
        ? `you found the real bug and hammered it solid.<br>time <b>${GAME.elapsed.toFixed(1)}s</b>`
        : `◈ <b>${GAME.fragments}/1</b> recovered &nbsp; time <b>${GAME.elapsed.toFixed(1)}s</b><br><br>` +
          (GAME.fragments
            ? `<span style="color:#56e39f">you took the fragment in low-g, then patched to cross.</span>`
            : `<span style="color:#e3c356">you patched first — the fragment was out of reach.</span>`),
      buttonLabel: "RUN AGAIN  [R]",
    });
    return;
  }
  if (stage.final) { startEnding("unresolved"); return; } // reached the exit = refuse the patch
  const summary = stage.bugs
    .map((b) => `${b.id}: <b>${b.state === "fixed" ? "PATCHED" : "LEFT"}</b>`)
    .join("<br>");
  GAME.routes[GAME.stageIndex] = summary;
  log("[META] tester reached goal. build flagged for review.", "meta");

  if (GAME.stageIndex < STAGE_COUNT - 1) {
    phase = "cleared";
    showClear({
      title: "STAGE CLEAR",
      sub: stage.name,
      stats: `${summary}<br><br>corruption: <b>${GAME.corruption}</b> &nbsp; ◈ <b>${GAME.fragments}/${FRAGMENT_TOTAL}</b> &nbsp; integrity: <b>${integrity()}%</b><br>time: <b>${GAME.elapsed.toFixed(1)}s</b>`,
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

// ---------------- respawn / checkpoints / feel ----------------
function respawnPlayer() {
  burst(player.x + player.w / 2, player.y + player.h / 2, { n: 14, color: ["#e35664", "#d7dde2"], spd: 260, life: 0.5, grav: 500 });
  resetPlayer(player, GAME.checkpoint || player.spawn);
  GAME.flash = 0.25;
  shake(12, 0.3); hitstop(0.05); flash(0.2, "#e35664", 0.45);
}

function isStableGround(id) {
  if (!id) return false;
  const pl = stage.platforms.find((p) => p.id === id);
  return !!pl && pl.solid && !pl.uiCollider && id !== "end_wall";
}

// ---------------- pause / options ----------------
const $ = (id) => document.getElementById(id);
function enterPause() { phase = "pause"; $("pause").classList.remove("hidden"); updatePauseLabels(); }
function resumeGame() { $("pause").classList.add("hidden"); phase = "play"; clearPressed(); }
function restartStage() { $("pause").classList.add("hidden"); loadStage(GAME.stageIndex); }
function toggleMute() {
  GAME.muted = !GAME.muted;
  if (!GAME.muted) { ensureAudio(); sfx("select"); }
  log(`[INFO] audio ${GAME.muted ? "muted" : "on"}`, "info");
  updatePauseLabels();
}
function updatePauseLabels() {
  const m = $("pause-mute");
  if (m) m.textContent = `SOUND: ${GAME.muted ? "OFF" : "ON"}`;
}

// ---------------- hammer fix (unified) ----------------
// A "fix target" wraps the thing you can hammer, with a rect hitbox:
//   { kind:'plat'|'bug'|'self', ref, x,y,w,h, fixLine }
function fixTargets() {
  const list = [];
  // lab hammerable platforms (real bug + decoy)
  for (const p of stage.platforms) {
    if (p.hammerable && !p.fixed) {
      list.push({ kind: "plat", ref: p, x: p.x, y: p.y, w: p.w, h: p.h, fixLine: p.fixLine, real: p.real });
    }
  }
  // active, un-hammered bugs — hammer the glitch marker (or yourself)
  for (const bug of stage.bugs) {
    if (bug.state !== "active") continue;
    if (bug.self) {
      list.push({ kind: "self", ref: bug, x: player.x - 8, y: player.y - 8, w: player.w + 16, h: player.h + 16, fixLine: bug.fixLine });
    } else if (bug.marker) {
      const m = bug.marker;
      list.push({ kind: "bug", ref: bug, x: m.x - 26, y: m.y - 20, w: 52, h: 96, fixLine: bug.fixLine, code: bug.code });
    }
  }
  return list;
}
function nearestFixTarget() {
  if (!player.onGround) return null;
  let best = null, bestD = 1e9;
  const pcx = player.x + player.w / 2, pcy = player.y + player.h / 2;
  for (const t of fixTargets()) {
    const inX = player.x + player.w > t.x - 40 && player.x < t.x + t.w + 40;
    const dy = Math.abs(pcy - (t.y + t.h / 2));
    if (!inX || dy > 110) continue;
    const d = Math.abs(pcx - (t.x + t.w / 2));
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}
function startFix(target) { fixState = { target, t: 0, taps: 0 }; }
function tickFix(dt) {
  fixState.t += dt;
  const taps = [0.25, 0.6, 0.95];
  if (fixState.taps < taps.length && fixState.t >= taps[fixState.taps]) {
    sfx("tap");
    shake(4, 0.08);
    const hx = player.x + (player.facing > 0 ? player.w + 6 : -6);
    burst(hx, player.y + 14, { n: 6, color: ["#e3c356", "#d7dde2"], spd: 200, life: 0.3, grav: 500 });
    fixState.taps++;
  }
  if (fixState.t >= FIX_DUR) { const t = fixState.target; fixState = null; applyHammer(t); }
}
function fixJuice(tx, ty) {
  shake(11, 0.28); hitstop(0.06); flash(0.16, "#56e39f", 0.35);
  burst(tx, ty, { n: 16, color: ["#56e39f", "#9fe9c7", "#d7dde2"], spd: 300, life: 0.5, grav: 700, up: 60 });
}
function applyHammer(t) {
  const tx = t.x + t.w / 2, ty = t.y + t.h / 2;
  if (t.kind === "plat") {
    if (t.real) {
      t.ref.solid = true; t.ref.glitchy = false; t.ref.fixed = true;
      GAME.corruption += 1; sfx("ding"); fixJuice(tx, ty);
      log(`[INFO] ${t.ref.id}: ${t.fixLine} — patched`, "info");
    } else {
      sfx("tonk"); shake(3, 0.1);
      burst(tx, ty, { n: 4, color: "#e3c356", spd: 120, life: 0.3 });
      log(`[INFO] ${t.ref.id}: ${t.fixLine}`, "meta");
    }
    return;
  }
  if (t.kind === "self") {
    sfx("ding"); shake(16, 0.4); hitstop(0.08); flash(0.3, "#e35664", 0.5); glitch("invert", 0.5, 1);
    t.ref.fix(stage);
    startEnding("patched"); // 演出④: you patched yourself out
    return;
  }
  // kind === 'bug'
  t.ref.fix(stage);
  sfx("ding"); fixJuice(tx, ty);
  hideToastIfClear();
  updateIncursion();
}
function hideToastIfClear() {
  if (stage.bugs.every((b) => b.state !== "active")) hideToast();
}

// ---------------- render ----------------
function render() {
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  drawBackground();
  if (!stage) return; // title screen: just the backdrop behind the overlay
  const so = shakeOffset();
  ctx.save();
  ctx.translate(-Math.round(GAME.camera.x - so.x), -Math.round(GAME.camera.y - so.y));
  drawPlatforms();
  drawHazards();
  drawEnemies();
  drawFragments();
  drawNotes();
  drawGoal();
  drawPlayer();
  drawParticles(ctx);
  drawFix();
  ctx.restore();
  drawTriggerHint();
  setMeta(GAME.fragments, FRAGMENT_TOTAL, integrity());
  if (GAME.flash > 0) {
    ctx.fillStyle = `rgba(227,86,100,${GAME.flash * 0.55})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
  postFX(ctx, VIEW.w, VIEW.h); // tear / invert / flash — the game "breaking"
}

function drawFragments() {
  for (const f of stage.fragments) {
    if (f.got) continue;
    if (f.requires) {
      const pl = stage.platforms.find((pp) => pp.id === f.requires);
      if (!pl || !pl.solid) continue; // forfeited along with its platform
    }
    const s = 9 + 2 * Math.sin(performance.now() / 250);
    ctx.save();
    ctx.translate(f.x + 11, f.y + 11);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#56e39f";
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = "#d7ffe9";
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
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
    // UI-collider platforms: only visible once solidified (or while fading out)
    if (pl.uiCollider && !pl.solid && !pl.fading) continue;
    const a = pl.alpha ?? 1;
    if (a <= 0) continue;
    if (pl.ui) { drawUiPlatform(pl, a); continue; }
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

// UI-shaped platform (toast / hud bar / log line) — the meta showcase.
function drawUiPlatform(pl, a) {
  ctx.globalAlpha = a;
  const danger = pl.ui === "toast";
  const j = (Math.sin(performance.now() / 70 + pl.x) * 2) | 0; // subtle glitch
  ctx.fillStyle = danger ? "rgba(227,86,100,0.18)" : "rgba(86,227,159,0.13)";
  ctx.fillRect(pl.x + j, pl.y, pl.w, pl.h);
  ctx.strokeStyle = danger ? "#e35664" : "#56e39f";
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(pl.x + 0.5, pl.y + 0.5, pl.w - 1, pl.h - 1);
  ctx.setLineDash([]);
  ctx.fillStyle = danger ? "#e35664" : "#9fe9c7";
  ctx.font = "12px 'Courier New', monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(pl.label, pl.x + pl.w / 2, pl.y + pl.h / 2 + 1);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 1;
}

function drawHazards() {
  for (const h of (stage.hazards || [])) {
    ctx.fillStyle = "#e35664";
    const n = Math.max(1, Math.floor(h.w / 16));
    const step = h.w / n;
    for (let i = 0; i < n; i++) {
      const x = h.x + i * step;
      ctx.beginPath();
      ctx.moveTo(x, h.y);
      ctx.lineTo(x + step / 2, h.y + h.h);
      ctx.lineTo(x + step, h.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function targetLabel(t) {
  if (t.kind === "self") return "TESTER";
  if (t.kind === "bug") return t.code || "BUG";
  return (t.ref && t.ref.id) || "target";
}
function corruptStr(s) {
  return s.replace(/[aeoi]/g, (c) => ({ a: "4", e: "3", o: "0", i: "1" }[c]));
}

function drawFix() {
  // glitch markers so you can see WHERE to hammer (bug/self; lab platforms glow themselves)
  for (const t of fixTargets()) {
    if (t.kind === "plat") continue;
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    const j = (Math.sin(performance.now() / 70 + cx) * 2) | 0;
    ctx.fillStyle = "rgba(227,86,100,0.16)"; ctx.fillRect(cx - 15 + j, cy - 15, 30, 30);
    ctx.strokeStyle = "#e35664"; ctx.setLineDash([4, 3]);
    ctx.strokeRect(cx - 15, cy - 15, 30, 30); ctx.setLineDash([]);
    ctx.fillStyle = "#e35664"; ctx.font = "9px 'Courier New', monospace"; ctx.textAlign = "center";
    ctx.fillText(targetLabel(t), cx, cy - 20); ctx.textAlign = "left";
  }
  // "[E] FIX" prompt on the nearest target
  if (fixPrompt && !fixState) {
    ctx.fillStyle = "#e3c356"; ctx.font = "12px 'Courier New', monospace"; ctx.textAlign = "center";
    ctx.fillText("[E] FIX", fixPrompt.x + fixPrompt.w / 2, fixPrompt.y - 6);
    ctx.textAlign = "left";
  }
  if (!fixState) return;
  const p = player;
  // hammer tapping next to the player
  const swing = Math.abs(Math.sin(fixState.t * 12)) * 0.9;
  ctx.save();
  ctx.translate(p.x + (p.facing > 0 ? p.w : 0), p.y + 12);
  ctx.scale(p.facing > 0 ? 1 : -1, 1);
  ctx.rotate(0.25 + swing);
  ctx.fillStyle = "#8b6f3a"; ctx.fillRect(0, -2, 16, 4);   // handle
  ctx.fillStyle = "#c2cad3"; ctx.fillRect(14, -6, 9, 12);  // head
  ctx.restore();
  // tiny console near the hammer, typing the fix (演出③: corrupts late-game)
  const t = fixState.target;
  const corrupt = GAME.panelCorrupt;
  const bx = p.x - 12, by = p.y - 76, bw = 210, bh = 54;
  ctx.fillStyle = "rgba(12,14,18,0.92)"; ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = corrupt ? "#e35664" : "#56e39f"; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.font = "11px 'Courier New', monospace"; ctx.textAlign = "left";
  const id = targetLabel(t);
  ctx.fillStyle = "#7f8a96"; ctx.fillText(corrupt ? `> p4tch ${corruptStr(id)}` : `> patch ${id}`, bx + 8, by + 18);
  const full = `> ${corrupt ? corruptStr(t.fixLine || "") : (t.fixLine || "")}`;
  const shown = Math.floor((fixState.t / (FIX_DUR * 0.8)) * full.length);
  ctx.fillStyle = corrupt ? "#e35664" : (t.kind === "plat" && !t.real ? "#e3c356" : "#9fe9c7");
  ctx.fillText(full.slice(0, Math.max(0, shown)), bx + 8, by + 34);
  if (fixState.t > FIX_DUR * 0.85) {
    const ok = !(t.kind === "plat" && !t.real);
    ctx.fillStyle = ok ? (corrupt ? "#e35664" : "#56e39f") : "#e35664";
    ctx.fillText(ok ? (corrupt ? "✓ p4tch3d" : "✓ patched") : "✗ not a bug", bx + 8, by + 48);
  }
}

function drawNotes() {
  if (!stage.notes) return;
  ctx.fillStyle = "#5a6470";
  ctx.font = "13px 'Courier New', monospace";
  ctx.textAlign = "left";
  for (const n of stage.notes) ctx.fillText(n.text, n.x, n.y);
}

function drawGoal() {
  const g = stage.goal;
  if (!g) return; // final stage has no goal
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
  const d = p.dissolve || 0;
  if (d >= 1) return; // fully patched out
  if (d > 0) {
    // dissolving: fade + scatter blocks of the sprite
    ctx.globalAlpha = 1 - d;
    const cells = 6;
    const cw = p.w / cells, ch = p.h / cells;
    for (let gx = 0; gx < cells; gx++) {
      for (let gy = 0; gy < cells; gy++) {
        if (Math.random() < d) continue; // removed cell
        const jx = (Math.random() - 0.5) * d * 22;
        const jy = (Math.random() - 0.5) * d * 22;
        ctx.fillStyle = Math.random() < 0.15 ? "#56e39f" : "#d7dde2";
        ctx.fillRect(p.x + gx * cw + jx, p.y + gy * ch + jy, cw + 1, ch + 1);
      }
    }
    ctx.globalAlpha = 1;
    return;
  }
  const sq = p.squash || 0;
  const sx = 1 + sq * 0.5, sy = 1 - sq * 0.5;
  const cx = p.x + p.w / 2, by = p.y + p.h;
  ctx.save();
  ctx.translate(cx, by); ctx.scale(sx, sy); ctx.translate(-cx, -by);
  ctx.fillStyle = "#d7dde2";
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = "#0c0e12";
  const ex = p.facing > 0 ? p.x + p.w - 9 : p.x + 4;
  ctx.fillRect(ex, p.y + 8, 5, 5);
  ctx.restore();
}

function drawTriggerHint() {
  if (phase !== "play" || fixState || fixPrompt) return;
  // a soft nudge only when a bug is live but you're not next to any glitch yet
  const live = stage.bugs.some((b) => b.state === "active");
  if (!live) return;
  const sx = player.x + player.w / 2 - GAME.camera.x;
  const sy = player.y - GAME.camera.y - 14;
  ctx.fillStyle = "#e3c356";
  ctx.font = "11px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("find the glitch — hammer it (E)", sx, sy);
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
  updateFX(dt);                 // FX keep animating even during hitstop
  update(frozen() ? 0 : dt);    // hitstop freezes the world for a few frames
  render();
  clearPressed();
  requestAnimationFrame(frame);
}

document.getElementById("clear-retry").addEventListener("click", () => {
  if (phase === "cleared") advance();
  else if (GAME.labMode) startLab();
  else startRun();
});
document.getElementById("title-start").addEventListener("click", () => {
  if (phase === "title") startRun();
});
document.getElementById("ending-restart").addEventListener("click", () => {
  if (phase === "ending") endToTitle();
});
document.getElementById("pause-resume").addEventListener("click", resumeGame);
document.getElementById("pause-restart").addEventListener("click", restartStage);
document.getElementById("pause-mute").addEventListener("click", toggleMute);
document.getElementById("pause-title").addEventListener("click", () => { $("pause").classList.add("hidden"); toTitle(); });

// Tap FIX / IGNORE directly on the debug panel (touch-friendly).
document.getElementById("debug-list").addEventListener("click", (e) => {
  if (!GAME.paused) return;
  const btn = e.target.closest(".bug-btn");
  const entry = e.target.closest(".bug-entry");
  if (!btn || !entry) return;
  applyDecision(Number(entry.dataset.i), btn.classList.contains("fix") ? "fix" : "ignore");
});

// Scale the fixed 960x540 stage to fit any screen (phones + desktop).
// min() can never overflow; the trick is to re-fit whenever the viewport
// settles (browser chrome/URL-bar layout can shift innerHeight after load).
function fitStage() {
  const el = document.documentElement;
  const vw = el.clientWidth || window.innerWidth;
  const vh = el.clientHeight || window.innerHeight;
  const s = Math.min(vw / VIEW.w, vh / VIEW.h);
  document.getElementById("stage").style.transform = `scale(${s})`;
}
window.addEventListener("resize", fitStage);
window.addEventListener("orientationchange", fitStage);
window.addEventListener("load", fitStage);
if (window.visualViewport) window.visualViewport.addEventListener("resize", fitStage);

initInput();
bindTouchControls();
fitStage();
// re-fit across the next couple frames in case the chrome/URL-bar layout
// shifted the viewport height right after load (avoids a too-large scale)
requestAnimationFrame(() => { fitStage(); requestAnimationFrame(fitStage); });

// --- PC keyboard robustness ---
// Keep keyboard focus on the game (helps iframe/embeds and after focus loss),
// and never let a mouse-clicked menu button trap Space/Enter.
const stageEl = document.getElementById("stage");
stageEl.setAttribute("tabindex", "-1");
const focusStage = () => { try { stageEl.focus({ preventScroll: true }); } catch (e) {} };
window.addEventListener("pointerdown", focusStage);
document.querySelectorAll("button").forEach((btn) =>
  btn.addEventListener("click", () => { btn.blur(); focusStage(); })
);
focusStage();

const _p = new URLSearchParams(location.search);
if (_p.has("lab")) startLab(_p.get("lab") === "hammer" ? "hammer" : "paradox");
else toTitle();
requestAnimationFrame(frame);
