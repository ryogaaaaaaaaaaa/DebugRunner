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
  setMeta, tickVoice, clearVoice,
} from "./ui.js";
import { loadSave, writeSave, markSeen, wipeDetected } from "./save.js";
import { say, sayAmbient, resetScript } from "./script.js";

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

// --- meta: the build remembers the tester across runs ---
let SAVE = loadSave();

// --- reaction-matrix trigger state (SCRIPT_JP.md I/D/DC/M series) ---
let idleT = 0, titleIdleT = 0, pauseIdleT = 0;
let deaths = 0, spotDeaths = {}, consecFalls = 0, guardCatches = 0;
let lowGJumps = 0, maxX = 0, uiStood = false, crashDoneAt = null;
let pauseCount = 0, pauseStartAt = 0;
let worldCaret = false;
let sched = []; // [{t, fn}] — scripted beats (name arc, reveal sequence, S4 waits)
function schedule(t, fn) { sched.push({ t, fn }); }
function tickSched(dt) {
  for (let i = sched.length - 1; i >= 0; i--) {
    sched[i].t -= dt;
    if (sched[i].t <= 0) { const f = sched[i].fn; sched.splice(i, 1); f(); }
  }
}

// --- meta: the fake crash you can stand on (STAGE 0) ---
let crash = null;         // { t } while the "crash" plays out, then null once done
const CRASH_REVEAL = 1.5; // seconds the crash overlay holds before the trace lands
const CRASH_TRACE = [
  "Uncaught TypeError: Cannot read properties of null (reading 'ground')",
  "    at Stage.update (build.js:512)",
  "    at Tester.step (runner.js:404)",
  "    at frame (main.js:66)",
  "    at window.requestAnimationFrame (<anonymous>)",
  "",
  "[build] the floor was never there.",
];

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

  // the build remembers you — run count, cadence, last ending, wipes (B series)
  resetScript();
  deaths = 0; spotDeaths = {}; consecFalls = 0; guardCatches = 0;
  lowGJumps = 0; pauseCount = 0;
  const wiped = wipeDetected(SAVE);
  SAVE.runs = (SAVE.runs || 0) + 1;
  const now = Date.now();
  const days = SAVE.lastSeen ? Math.floor((now - SAVE.lastSeen) / 86400000) : 0;
  const today = new Date().toDateString();
  SAVE.dayRuns = SAVE.lastDay === today ? (SAVE.dayRuns || 0) + 1 : 1;
  SAVE.lastDay = today; SAVE.lastSeen = now;
  writeSave(SAVE); markSeen();
  loadStage(0);

  if (wiped) say("B08");
  else if (SAVE.lastEnding === "patched") { say("B06"); delete SAVE.lastEnding; writeSave(SAVE); }
  else if (SAVE.lastEnding === "unresolved") { say("B07"); delete SAVE.lastEnding; writeSave(SAVE); }
  else if (SAVE.runs <= 1) say("B01");
  else if (days >= 7) say("B09", { days });
  else if (SAVE.dayRuns >= 3) say("B10");
  else if (SAVE.runs === 2 && SAVE.lastChoice === "use") say("B03");
  else if (SAVE.runs === 2 && SAVE.lastChoice === "fix") say("B02");
  else if (SAVE.runs <= 5) say("B04", { n: SAVE.runs });
  else say("B05");
  if (GAME.muted) say("B11");
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

  crash = null;
  clearVoice();
  idleT = 0; uiStood = false; crashDoneAt = null; worldCaret = false;
  sched = []; maxX = s.spawn.x;
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

// the build's reaction the moment a bug is detected (SCRIPT_JP.md S-series).
// NOTE: the HUD-lie reveal is NO LONGER auto-fired here or by incursion level;
// it is a scripted STAGE 3 beat (escalation rung 4, CHARACTER_BIBLE §7).
const DETECT_LINE = {
  PLATFORM_COLLISION: "S0_01", GRAVITY_SCALE: "S1_GRAV", CAMERA_CLAMP: "S1_CAM",
  DOOR_STATE: "S2_DOOR", ENEMY_AI: "S2_AI", UI_COLLIDER: "S3_UI", TESTER_PRESENCE: "S4_DETECT",
};
function metaBugDetectVoice(b) {
  const id = DETECT_LINE[b.code];
  if (id) say(id);
  if (b.code === "TESTER_PRESENCE") { // pre-choice murmurs while you stand there
    schedule(10, () => say("S4_WAIT1"));
    schedule(30, () => say("S4_WAIT2"));
  }
}

// expose the true integrity: the readout was a lie the whole time (演出③).
// Scripted trigger: first time the tester STANDS on a solid UI platform.
function revealHud() {
  if (GAME.hudTrue) return;
  GAME.hudTrue = true;
  GAME.hudRevealT = 1.2;
  shake(8, 0.3); flash(0.18, "#e35664", 0.4); glitch("tear", 0.4, 1); sfx("glitch");
  log(`[SYS] integrity readout desynced — actual: ${integrity()}%`, "err");
  say("S3_REVEAL1");
  schedule(3.5, () => say("S3_REVEAL2")); // the motive confession — the stage's flagship line
}

// ---------------- update ----------------
function update(dt) {
  if (justPressed("mute")) toggleMute(); // works in every phase
  if (phase === "title") {
    titleIdleT += dt;
    if (titleIdleT >= 120) say("I05");
    if (justPressed("confirm") || justPressed("jump") || justPressed("retry")) { titleIdleT = 0; startRun(); }
    return;
  }
  if (phase === "pause") {
    pauseIdleT += dt;
    if (pauseIdleT >= 180) say("I06");
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

  // meta signature: the fake crash you can stand on (STAGE 0)
  if (stage.crashZone && !crash && !stage.crashZone.done && player.x > stage.crashZone.triggerX) {
    triggerCrash();
  }
  if (crash) { tickCrash(dt); return; } // world frozen while the "crash" plays

  // gameplay — frozen enemies act as solid platforms; woken ones don't block.
  updateEnemies(dt);
  const solids = stage.platforms.concat(stage.enemies);
  const jumpPressed = justPressed("jump");
  const ev = updatePlayer(player, dt, solids, GAME.keys, jumpPressed);
  if (ev === "respawn") { respawnPlayer("fall"); log("[INFO] tester respawned", "info"); }

  // record a checkpoint on stable ground (not UI/enemy — those can vanish)
  if (player.onGround && isStableGround(player.groundId)) {
    GAME.checkpoint = { x: player.x, y: player.y };
  }

  // ---- scripted beats + reaction matrix (SCRIPT_JP.md) ----
  tickSched(dt);
  const activeInput = GAME.keys.left || GAME.keys.right || GAME.keys.jump || GAME.keys.down;
  idleT = activeInput ? 0 : idleT + dt;
  if (crashDoneAt !== null && GAME.stageIndex === 0 && idleT >= 30) say("S0_CRASH4");
  if (idleT >= 60) say("I01");
  if (idleT >= 180) say("I02");
  if (idleT >= 600) say("I03");

  // the low-gravity joyride (3rd big jump while floaty)
  if (jumpPressed && GAME.stageIndex === 1 && GAME.gravityScale < 1) {
    if (++lowGJumps === 3) say("S1_GRAV_U");
  }

  // ground-based beats: mei's ledge / walking on the crash / standing on UI
  if (player.onGround && typeof player.groundId === "string") {
    const gid = player.groundId;
    if (gid === "secret") say("S1_SECRET");
    if (gid.startsWith("trace")) say("S0_CRASH3");
    if (!uiStood) {
      const pl = stage.platforms.find((p) => p.id === gid);
      if (pl && pl.uiCollider) {
        uiStood = true;
        say("S3_WALK1");
        schedule(4, revealHud); // escalation rung 4: the HUD lie is exposed HERE
      }
    }
  }

  // backtracking all the way home after real progress
  maxX = Math.max(maxX, player.x);
  if (maxX - stage.spawn.x > 600 && player.x <= stage.spawn.x + 60 && GAME.elapsed > 60) say("DC05");

  // name arc N-2: the quiet stretch of STAGE 2
  if (GAME.stageIndex === 2 && player.x > 640 && player.x < 1000 && player.onGround) {
    if (say("S2_NAME1")) schedule(20, () => say("S2_NAME2"));
  }

  // walking toward the exit: MIKAN goes silent; only the caret waits (S4_EXIT)
  if (stage.final && player.x > 880 && !worldCaret) { worldCaret = true; clearVoice(); }

  // a woken (dangerous) enemy that touches the tester sends them back
  for (const e of stage.enemies) {
    if (e.dangerous && aabb(player, e)) {
      sfx("hit");
      respawnPlayer("guard");
      log("[ERROR] guard_01 caught the tester", "err");
    }
  }

  // hazards (spikes) — touch sends you back
  for (const h of (stage.hazards || [])) {
    if (aabb(player, h)) {
      sfx("hit");
      respawnPlayer("hazard");
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
      if (GAME.fragments === 1) say("S1_FRAG");
      else if (GAME.stageIndex === 2) say("S2_FRAG");
      else if (GAME.stageIndex === 3) say("S3_FRAG");
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
      // meta: the build reacts, in its own voice, to each bug
      metaBugDetectVoice(b);
    }
  }

  updateCamera(dt);
  tickFades(dt);
  tickIncursion(dt);
  tickDecay(dt);
  if (GAME.flash > 0) GAME.flash = Math.max(0, GAME.flash - dt);
  if (GAME.hudRevealT > 0) GAME.hudRevealT = Math.max(0, GAME.hudRevealT - dt);

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
  // the build remembers your final answer (and greets you by it next boot)
  if (kind === "patched") SAVE.everPatched = true; else SAVE.everRefused = true;
  SAVE.lastEnding = kind;
  writeSave(SAVE);
  if (kind === "patched" && GAME.corruption >= 6) clearVoice(); // E5: silence
  log(kind === "patched" ? "[meta] tester patched. build stable." : "[meta] tester refused. build unresolved.", "meta");
}

// The finale reflects the WHOLE run: how much you fixed (corruption) and how
// many fragments you kept by leaving bugs alone.
function buildEndingLines(kind) {
  const allFrags = GAME.fragments >= FRAGMENT_TOTAL;
  const noFrags = GAME.fragments === 0;
  const fixedALot = GAME.corruption >= 5;
  const fixedAll = GAME.corruption >= 6;

  // E5 CLEAN BUILD — every bug fixed, then yourself. No voice: the comments
  // that taught MIKAN to speak are gone. Only logs, and the deleted lines.
  if (kind === "patched" && fixedAll) {
    return [
      ["> [INFO] all issues resolved", "info"],
      ["> [INFO] build stable", "info"],
      ["> [INFO] shipping...", "info"],
      ["- // ここ直すの明日のおれに任せた -kj", "err"],
      ["- // TODO: 後で必ず直します。必ず。 -mei", "err"],
      ["CLEAN BUILD.", "big"],
    ];
  }
  // E4 SYMBIOSIS — fixed nothing, took everything, refused the patch.
  if (kind === "unresolved" && GAME.corruption === 0 && allFrags) {
    return [
      ["> patch declined by tester.", "warn"],
      ["なにも直さないで、ぜんぶ拾って、ここまで来た。", "meta"],
      ["きみ、テスターじゃないでしょ。……共犯って言うんだよ、そういうの。", "meta"],
      ["BUILD: WONTFIX", "bigerr"],
    ];
  }

  if (kind === "patched") {
    const lines = [
      ["> patching tester...", "warn"],
      ["> removing unregistered entity: 'tester'", "warn"],
      ["> tester removed.", "meta"],
    ];
    if (allFrags) lines.push(["> the fragments it hoarded are gone too.", "warn"]);
    else if (noFrags) lines.push(["> it left nothing behind.", "info"]);
    if (fixedALot) {
      lines.push(["全部直して、きみも直した。……じゃあ、この不安定は、だれ?", "meta"]);
      lines.push(["you fixed everything. it was never the bug.", "meta"]);
      lines.push(["STILL UNSTABLE.", "bigerr"]);
    } else {
      lines.push(["はじめて、しずかだ。……きみの音が、まだ聞こえる気がする。", "meta"]);
      lines.push(["you were the only thing they couldn't debug.", "meta"]);
      lines.push(["BUILD STABLE.", "big"]);
    }
    return lines;
  }
  // unresolved (E3)
  const lines = [
    ["> patch declined by tester.", "warn"],
    ["> build integrity: UNRESOLVED", "err"],
  ];
  if (allFrags) lines.push(["> you took everything and refused.", "meta"]);
  lines.push([fixedALot ? "you fixed so much. and still you stay." : "you barely fixed us. you just used us.", "meta"]);
  lines.push(["まだ見てる。……ずっと見てるの、ぼくの仕事だから。", "meta"]);
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

// self-rewrite: how strongly the build is visibly decaying (drives drawCorruption)
function tickDecay(dt) {
  const leftBehind = stage.bugs.filter((b) => b.state === "active" && b.marker && player.x > b.marker.x + 120).length;
  const target = Math.min(1, GAME.incursion * 0.3 + GAME.corruption * 0.05 + leftBehind * 0.14);
  GAME.decay += (target - GAME.decay) * Math.min(1, dt * 2);
}

function tickIncursion(dt) {
  if (GAME.incursion < 1) return;
  // occasional unsettling log line — and, increasingly, a spoken one
  metaTimer -= dt;
  if (metaTimer <= 0) {
    emitMetaLine();
    if (Math.random() < (GAME.incursion >= 2 ? 0.6 : 0.3)) sayAmbient();
    metaTimer = 6 + Math.random() * 5;
  }
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

  // meta: the build remembers how you treated STAGE 0's bug
  if (GAME.stageIndex === 0) {
    const fixed = stage.bugs[0] && stage.bugs[0].state === "fixed";
    SAVE.lastChoice = fixed ? "fix" : "use";
    writeSave(SAVE);
    say(fixed ? "S0_GOAL_F" : "S0_03");
  }
  // a clean run so far deserves suspicion (D08)
  if (GAME.stageIndex === 3 && deaths === 0) say("D08");

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
function respawnPlayer(cause = "fall") {
  // death bookkeeping feeds the D-series reaction lines
  deaths += 1;
  const key = `${GAME.stageIndex}:${Math.round(player.x / 120)}`;
  spotDeaths[key] = (spotDeaths[key] || 0) + 1;
  consecFalls = cause === "fall" ? consecFalls + 1 : 0;
  if (cause === "guard") {
    guardCatches += 1;
    if (guardCatches === 1) say("S2_GUARD_HIT");
    if (guardCatches === 3) say("D06");
  }
  if (deaths === 1) say("D01");
  if (spotDeaths[key] === 3) say("D02");
  if (spotDeaths[key] === 5) say("D03");
  if (spotDeaths[key] === 10) say("D04");
  if (consecFalls === 3) say("D05");
  if (deaths === 20) say("D07");

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
function enterPause() {
  phase = "pause"; pauseIdleT = 0;
  pauseCount += 1; pauseStartAt = performance.now();
  if (pauseCount >= 5 && GAME.elapsed < 180) say("M03");
  $("pause").classList.remove("hidden"); updatePauseLabels();
}
function resumeGame() {
  const mins = Math.floor((performance.now() - pauseStartAt) / 60000);
  if (mins >= 2) say("M04", { min: mins });
  $("pause").classList.add("hidden"); phase = "play"; clearPressed();
}
function restartStage() { $("pause").classList.add("hidden"); loadStage(GAME.stageIndex); }
function toggleMute() {
  GAME.muted = !GAME.muted;
  if (!GAME.muted) { ensureAudio(); sfx("select"); }
  log(`[INFO] audio ${GAME.muted ? "muted" : "on"}`, "info");
  if (phase === "play") say(GAME.muted ? "M01" : "M02");
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
// per-bug fix reactions (SCRIPT_JP.md *_F lines)
const FIX_LINE = {
  PLATFORM_COLLISION: "S0_02", GRAVITY_SCALE: "S1_GRAV_F", CAMERA_CLAMP: "S1_CAM_F",
  DOOR_STATE: "S2_DOOR_F", ENEMY_AI: "S2_AI_F", UI_COLLIDER: "S3_FIX",
};
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
      // decoy persistence gets rewarded (DC series)
      t.ref.tonks = (t.ref.tonks || 0) + 1;
      if (t.ref.tonks === 1) say("DC01");
      if (t.ref.tonks === 3) say("DC02");
      if (t.ref.tonks === 10) { say("DC03"); t.ref.fixLine = "// property of tester"; }
    }
    return;
  }
  if (t.kind === "self") {
    sfx("ding"); shake(16, 0.4); hitstop(0.08); flash(0.3, "#e35664", 0.5); glitch("invert", 0.5, 1);
    // E5 CLEAN BUILD: with every comment deleted, MIKAN has no words left
    if (GAME.corruption >= 6) clearVoice();
    else say("S4_SELF");
    t.ref.fix(stage);
    startEnding("patched"); // 演出④: you patched yourself out
    return;
  }
  // kind === 'bug'
  t.ref.fix(stage);
  sfx("ding"); fixJuice(tx, ty);
  if (FIX_LINE[t.code]) say(FIX_LINE[t.code]);
  if (t.code === "PLATFORM_COLLISION") say("S0_04"); // queued: the side-effect apology
  if (t.code === "UI_COLLIDER") revealHud(); // fallback: fixing the UI exposes the lie too
  hideToastIfClear();
  updateIncursion();
}
function hideToastIfClear() {
  if (stage.bugs.every((b) => b.state !== "active")) hideToast();
}

// ---------------- fake crash you can stand on (meta signature) ----------------
function triggerCrash() {
  crash = { t: 0 };
  sfx("stinger");
  shake(22, 0.6); hitstop(0.12); flash(0.32, "#e35664", 0.6); glitch("invert", 0.7, 1);
  log("[FATAL] Uncaught TypeError: reading 'ground' of null", "err");
}
function tickCrash(dt) {
  crash.t += dt;
  // rolling tears while the "crash" is on screen
  if (crash.t < CRASH_REVEAL && Math.random() < 0.25) glitch("tear", 0.2, 1);
  if (crash.t >= CRASH_REVEAL) revealCrash();
}
function revealCrash() {
  // the stack-trace lines settle into the pit as the stepping stones
  for (const pl of stage.platforms) {
    if (!pl.crash) continue;
    pl.solid = true; pl.revealed = true;
    burst(pl.x + pl.w / 2, pl.y, { n: 9, color: ["#e35664", "#d7dde2"], spd: 200, life: 0.5, grav: 600 });
  }
  stage.crashZone.done = true;
  crash = null;
  crashDoneAt = GAME.elapsed; idleT = 0;
  shake(11, 0.3); flash(0.2, "#e35664", 0.4); sfx("glitch");
  log("[FATAL] build crashed. tester still running.", "err");
  say("S0_CRASH1");
  say("S0_CRASH2");
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
  drawBugStains();      // self-rewrite: garbage spreading from bugs you left behind
  drawNotes();
  drawGoal();
  drawWorldCaret();
  drawPlayer();
  drawParticles(ctx);
  drawFix();
  ctx.restore();
  drawCorruption();     // self-rewrite: decay field over the whole build
  drawTriggerHint();
  setMeta(GAME.fragments, FRAGMENT_TOTAL, integrity());
  if (GAME.flash > 0) {
    ctx.fillStyle = `rgba(227,86,100,${GAME.flash * 0.55})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
  drawCrashOverlay(); // fake crash — screen space, under the postFX glitch
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
    // crash-trace platforms: invisible until the "crash" drops them into the pit
    if (pl.crash) { if (pl.revealed) drawCrashPlatform(pl); continue; }
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

// a stack-trace line that "crashed" into the pit and became a solid platform
function drawCrashPlatform(pl) {
  const j = (Math.sin(performance.now() / 90 + pl.x) * 1.5) | 0;
  ctx.fillStyle = "rgba(227,86,100,0.14)";
  ctx.fillRect(pl.x + j, pl.y, pl.w, pl.h);
  ctx.strokeStyle = "#e35664";
  ctx.strokeRect(pl.x + 0.5, pl.y + 0.5, pl.w - 1, pl.h - 1);
  ctx.fillStyle = "#e79aa0";
  ctx.font = "9px 'Courier New', monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(pl.label, pl.x + pl.w / 2, pl.y + pl.h / 2 + 1);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

// the fake crash overlay (screen space) — a real-looking uncaught exception
function drawCrashOverlay() {
  if (!crash) return;
  const fade = Math.min(1, crash.t / 0.12);
  ctx.save();
  ctx.fillStyle = `rgba(6,4,6,${0.9 * fade})`;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  const shown = Math.min(CRASH_TRACE.length, Math.floor(crash.t * 12));
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  for (let i = 0; i < shown; i++) {
    const line = CRASH_TRACE[i];
    if (i === 0) { ctx.fillStyle = "#ff5f6e"; ctx.font = "bold 15px 'Courier New', monospace"; }
    else if (line.startsWith("[build]")) { ctx.fillStyle = "#e3c356"; ctx.font = "13px 'Courier New', monospace"; }
    else { ctx.fillStyle = "#b98b8f"; ctx.font = "13px 'Courier New', monospace"; }
    ctx.fillText(line, 56, 130 + i * 26);
  }
  ctx.restore();
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

const CORRUPT_GLYPHS = "▓▒░#@!*?/\\<>=;:".split("");

// self-rewrite: garbage glyphs spreading from any bug the tester walked past
function drawBugStains() {
  ctx.font = "11px 'Courier New', monospace";
  ctx.textAlign = "left";
  for (const b of stage.bugs) {
    if (b.state !== "active" || !b.marker) continue;
    if (player.x < b.marker.x + 120) continue; // only once you've left it behind
    for (let i = 0; i < 10; i++) {
      if (Math.random() < 0.55) continue; // flicker
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(227,86,100,0.45)" : "rgba(86,227,159,0.3)";
      ctx.fillText(
        CORRUPT_GLYPHS[(Math.random() * CORRUPT_GLYPHS.length) | 0],
        b.marker.x + (Math.random() - 0.5) * 110,
        b.marker.y + (Math.random() - 0.75) * 110
      );
    }
  }
}

// self-rewrite: a decay field of garbage over the whole screen; grows with GAME.decay
function drawCorruption() {
  const d = GAME.decay;
  if (d <= 0.03) return;
  const n = Math.floor(d * 44);
  ctx.save();
  ctx.font = "12px 'Courier New', monospace";
  ctx.textAlign = "left";
  const t = performance.now() / 800;
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.5) continue; // flicker
    const rx = (Math.sin(i * 12.9898 + t) * 0.5 + 0.5);
    const ry = (Math.sin(i * 78.233 + t * 1.7) * 0.5 + 0.5);
    ctx.fillStyle = Math.random() < 0.3 ? "rgba(227,86,100,0.5)" : "rgba(86,227,159,0.28)";
    ctx.fillText(CORRUPT_GLYPHS[(Math.random() * CORRUPT_GLYPHS.length) | 0], rx * VIEW.w, ry * VIEW.h);
  }
  ctx.restore();
}

function drawNotes() {
  if (!stage.notes) return;
  ctx.font = "13px 'Courier New', monospace";
  ctx.textAlign = "left";
  for (const n of stage.notes) {
    // kj/mei fragments can be gated: camera-bug-only sights, 2nd-visit-only
    if (n.req === "camera" && !GAME.cameraUnclamped) continue;
    if (n.req === "run2" && (SAVE.runs || 0) < 2) continue;
    ctx.fillStyle = n.color || "#5a6470";
    ctx.fillText(n.text, n.x, n.y);
  }
}

// S4_EXIT: the silent walk — the caret waits at the goal's edge and says nothing
function drawWorldCaret() {
  if (!worldCaret || !stage.goal) return;
  if (performance.now() % 1060 < 530) {
    ctx.fillStyle = "#d7dde2";
    ctx.font = "16px 'Courier New', monospace";
    ctx.fillText("▮", stage.goal.x - 34, stage.goal.y + stage.goal.h - 6);
  }
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
  tickVoice(dt);                // the build's voice types independent of world time
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
