import { GAME } from "./state.js";
import { log } from "./ui.js";

// ---------------------------------------------------------------------------
// A stage is plain data + a list of bug objects. Each bug is a small state
// machine (dormant -> active -> fixed | ignored) that closes over the stage's
// platforms so fix()/ignore() can mutate the live world.
//
// Bug shape:
//   { id, code, desc, state, triggerX,
//     activate(stage), fix(stage), ignore(stage), get resolved }
// ---------------------------------------------------------------------------

const find = (stage, id) => stage.platforms.find((p) => p.id === id);

// ===== STAGE 0 — "TEST BUILD v0.3.1" : teaches fix-vs-use with BUG#01 =====
function buildStage0() {
  const stage = {
    name: "STAGE 0 — TEST BUILD",
    world: { w: 1600, h: 720 },
    spawn: { x: 60, y: 520 },
    goal: { x: 1500, y: 120, w: 26, h: 480 },
    platforms: [
      { id: "ground_left",  x: 0,    y: 600, w: 420, h: 120, solid: true },
      { id: "ground_right", x: 1100, y: 600, w: 500, h: 120, solid: true },
      { id: "lower",        x: 430,  y: 655, w: 690, h: 65,  solid: true },
      { id: "buggy",        x: 470,  y: 465, w: 380, h: 24,  solid: true, bug: true },
      { id: "step",         x: 900,  y: 545, w: 150, h: 20,  solid: true },
      { id: "decor",        x: 690,  y: 330, w: 90,  h: 20,  solid: true, sideEffect: true },
      { id: "end_wall",     x: 1576, y: 0,   w: 24,  h: 720, solid: true },
    ],
    bugs: [],
  };

  stage.bugs = [
    {
      id: "BUG#01", code: "PLATFORM_COLLISION",
      desc: "// platform collider disabled? falls right through. -kj",
      state: "dormant", triggerX: 360,
      activate(s) {
        this.state = "active";
        find(s, "buggy").solid = false;
        find(s, "buggy").glitchy = true;
        log("[WARN] entity 'platform_03' collider = null", "warn");
      },
      fix(s) {
        this.state = "fixed";
        const b = find(s, "buggy"); b.solid = true; b.glitchy = false;
        const d = find(s, "decor"); d.solid = false; d.glitchy = true; d.fading = true;
        GAME.corruption += 1;
        log("[INFO] platform_03 collider restored", "info");
        log("[WARN] side effect: 'decor_block' destabilized", "warn");
      },
      ignore() {
        this.state = "ignored";
        log("[INFO] BUG#01 left unresolved by tester", "meta");
      },
      get resolved() { return this.state === "fixed" || this.state === "ignored"; },
    },
  ];
  return stage;
}

// ===== STAGE 1 — "Shortcut" : BUG#03 gravity + BUG#05 camera =====
// Flat intro where both bugs trigger, then a pit. Two ways across:
//   FIX gravity  -> normal gravity, hop the stepping platforms (safe, long).
//   IGNORE grav  -> floaty low gravity, big leaps + reach the camera secret.
function buildStage1() {
  const stage = {
    name: "STAGE 1 — SHORTCUT",
    world: { w: 2300, h: 1000 },
    spawn: { x: 50, y: 800 },
    goal: { x: 2180, y: 380, w: 26, h: 480 },
    platforms: [
      // flat intro (both bugs trigger here, before any platforming)
      { id: "ground_start", x: 0,    y: 860, w: 700,  h: 140, solid: true },

      // upper stepping stones across the pit (the quick route for clean hops).
      { id: "step1", x: 745,  y: 815, w: 150, h: 22, solid: true },
      { id: "step2", x: 925,  y: 805, w: 150, h: 22, solid: true },
      { id: "step3", x: 1105, y: 805, w: 150, h: 22, solid: true },
      // step4 stops short of the ground_far wall so there is a ceiling-free
      // column to jump up through when climbing out of the lower ledge.
      { id: "step4", x: 1285, y: 815, w: 110, h: 22, solid: true },

      // continuous lower ledge under the pit — a safety floor. Miss a step and
      // you drop here and keep going, instead of dying. Keeps the stage
      // completable in any gravity / on any timing.
      { id: "lower", x: 680, y: 905, w: 770, h: 95, solid: true },

      // far ground -> run to the goal
      { id: "ground_far", x: 1430, y: 860, w: 846, h: 140, solid: true },

      // floaty platform that only "exists" because of the gravity bug.
      // FIX gravity -> it destabilizes and fades (the side effect).
      { id: "floaty", x: 955, y: 660, w: 110, h: 20, solid: true, sideEffect: true },

      // secret high ledge + collectible. The camera bug reveals it; it is only
      // reachable with low (ignored) gravity. Pure bonus / "use the bug" reward.
      { id: "secret", x: 920, y: 480, w: 150, h: 20, solid: true },

      { id: "end_wall", x: 2276, y: 0, w: 24, h: 1000, solid: true },
    ],
    // reward for the low-gravity + camera IGNORE route (on the secret ledge)
    fragments: [{ x: 995, y: 445, got: false }],
    bugs: [],
  };

  stage.bugs = [
    {
      id: "BUG#05", code: "CAMERA_CLAMP",
      desc: "// camera clamp disabled — viewport drifting up. -mei",
      state: "dormant", triggerX: 180,
      activate() {
        this.state = "active";
        GAME.cameraUnclamped = true; // reveals the upper area / secret ledge
        log("[WARN] camera2d clamp_to_world = false", "warn");
      },
      fix() {
        this.state = "fixed";
        GAME.cameraUnclamped = false;
        GAME.corruption += 1;
        log("[INFO] camera clamp restored", "info");
        log("[WARN] side effect: route hint no longer visible", "warn");
      },
      ignore() {
        this.state = "ignored";
        log("[INFO] BUG#05 left unresolved — wider view kept", "meta");
      },
      get resolved() { return this.state === "fixed" || this.state === "ignored"; },
    },
    {
      id: "BUG#03", code: "GRAVITY_SCALE",
      desc: "// gravity_scale = 0.35?? everything floats. -kj",
      state: "dormant", triggerX: 430,
      activate() {
        this.state = "active";
        GAME.gravityScale = 0.4; // floaty
        log("[WARN] physics.gravity_scale = 0.40", "warn");
      },
      fix(s) {
        this.state = "fixed";
        GAME.gravityScale = 1.0;
        const f = find(s, "floaty");
        f.solid = false; f.glitchy = true; f.fading = true; // side effect
        GAME.corruption += 1;
        log("[INFO] gravity_scale restored to 1.00", "info");
        log("[WARN] side effect: 'floaty' platform fell out of the build", "warn");
      },
      ignore() {
        this.state = "ignored";
        log("[INFO] BUG#03 left unresolved — low gravity in effect", "meta");
      },
      get resolved() { return this.state === "fixed" || this.state === "ignored"; },
    },
  ];
  return stage;
}

// ===== STAGE 2 — "Side Effects" : BUG#02 door + BUG#04 enemy AI =====
// Two parallel routes converge on the goal:
//   TOP    — stairs up to a ledge guarded by a FROZEN enemy. Hop over it
//            (use the bug). Do NOT fix it: a fixed enemy wakes and chases.
//   BOTTOM — a ground corridor blocked by a stuck-closed door. FIX the door
//            to walk through — but that side-effect WAKES the enemy (chain).
function buildStage2() {
  const stage = {
    name: "STAGE 2 — SIDE EFFECTS",
    world: { w: 2400, h: 1000 },
    spawn: { x: 50, y: 800 },
    goal: { x: 2300, y: 420, w: 26, h: 460 },
    platforms: [
      { id: "ground_start",  x: 0,    y: 860, w: 500,  h: 140, solid: true },
      { id: "ground_bottom", x: 500,  y: 860, w: 1900, h: 140, solid: true },

      // wide, overlapping steps up to the TOP route — wide enough that a
      // running jump always lands on the next step (no overshoot back to ground)
      { id: "stair1", x: 440, y: 790, w: 280, h: 24, solid: true },
      { id: "stair2", x: 680, y: 720, w: 280, h: 24, solid: true },
      { id: "stair3", x: 920, y: 650, w: 280, h: 24, solid: true },
      { id: "top_ledge", x: 1160, y: 600, w: 1040, h: 24, solid: true },

      // the stuck-closed door across the BOTTOM corridor (BUG#02)
      { id: "door_main", x: 1500, y: 700, w: 40, h: 160, solid: true, glitchy: true },

      { id: "end_wall", x: 2376, y: 0, w: 24, h: 1000, solid: true },
    ],
    // enemies: frozen (solid platform, harmless) until woken -> dangerous + moving.
    // Sits on the TOP ledge above the door; hop over it (do not fix it).
    enemies: [
      { id: "guard_01", x: 1500, y: 546, w: 44, h: 54, x0: 1380, x1: 1620,
        dir: 1, dangerous: false, solid: true, glitchy: true },
    ],
    // reward on the TOP route, past the guard — grab it by hopping the FROZEN
    // guard (i.e. by NOT fixing it; a woken guard makes this deadly)
    fragments: [{ x: 1660, y: 585, got: false }],
    bugs: [],
  };

  const wake = (s) => {
    const e = s.enemies[0];
    e.dangerous = true; e.solid = false; e.glitchy = false;
  };

  stage.bugs = [
    {
      id: "BUG#02", code: "DOOR_STATE",
      desc: "// gate won't open. state flag desync? -mei",
      state: "dormant", triggerX: 360,
      activate() {
        this.state = "active";
        log("[WARN] door 'gate_A' stuck closed (state desync)", "warn");
      },
      fix(s) {
        this.state = "fixed";
        const d = find(s, "door_main");
        d.solid = false; d.fading = true; d.glitchy = false;
        wake(s); // side-effect chain: opening the gate re-enables the guard AI
        GAME.corruption += 1;
        log("[INFO] gate_A opened", "info");
        log("[WARN] side effect: enemy 'guard_01' AI re-enabled", "warn");
      },
      ignore() {
        this.state = "ignored";
        log("[INFO] BUG#02 left unresolved — gate stays shut", "meta");
      },
      get resolved() { return this.state === "fixed" || this.state === "ignored"; },
    },
    {
      id: "BUG#04", code: "ENEMY_AI",
      desc: "// guard stuck in idle loop. harmless... for now. -kj",
      state: "dormant", triggerX: 360,
      activate() {
        this.state = "active";
        log("[WARN] enemy 'guard_01' AI = idle_loop (frozen)", "warn");
      },
      fix(s) {
        this.state = "fixed";
        wake(s);
        GAME.corruption += 1;
        log("[INFO] enemy AI restored — guard_01 is active", "info");
        log("[WARN] careful: it can reach the tester now", "warn");
      },
      ignore() {
        this.state = "ignored";
        log("[INFO] BUG#04 left unresolved — guard stays frozen", "meta");
      },
      get resolved() { return this.state === "fixed" || this.state === "ignored"; },
    },
  ];
  return stage;
}

// ===== STAGE 3 — "The Interface" : BUG#06 UI实体化 + 演出③ =====
// Single locked screen (world == viewport). The HUD / toast / log gain
// collision and become the stepping stones across a pit.
//   IGNORE — keep the UI solid and hop across it (the showcase / "use it").
//   FIX    — UI loses collision and the platforms vanish; drop to the dull
//            lower safety ledge and take the long way (corruption + deeper
//            panel corruption). "fix it and the floor you stood on is gone."
function buildStage3() {
  const stage = {
    name: "STAGE 3 — THE INTERFACE",
    stageUi: true,             // dim real overlays so the canvas UI reads
    world: { w: 960, h: 540 }, // == VIEW -> camera is locked
    spawn: { x: 40, y: 410 },
    goal: { x: 880, y: 300, w: 20, h: 160 },
    platforms: [
      { id: "start_ground", x: 0,   y: 460, w: 200, h: 80, solid: true },
      { id: "goal_ground",  x: 780, y: 460, w: 180, h: 80, solid: true },
      // lower safety ledge — the FIX fallback route across the pit
      { id: "lower", x: 180, y: 510, w: 620, h: 30, solid: true },
      // UI-shaped platforms: intangible until the bug solidifies them
      { id: "ui_toast", x: 230, y: 380, w: 150, h: 34, solid: false, uiCollider: true, ui: "toast", label: "! BUG DETECTED" },
      { id: "ui_hud",   x: 410, y: 340, w: 160, h: 26, solid: false, uiCollider: true, ui: "hud",   label: "HP ▮▮▮▮▮" },
      { id: "ui_log",   x: 590, y: 360, w: 150, h: 40, solid: false, uiCollider: true, ui: "log",   label: "[WARN] out of bounds" },
    ],
    enemies: [],
    // reward on the UI route — gated to the UI being solid, so FIXing (which
    // removes the collision) genuinely forfeits it, not just geometrically.
    fragments: [{ x: 475, y: 316, got: false, requires: "ui_hud" }],
    bugs: [],
  };

  const uiParts = (s) => s.platforms.filter((p) => p.uiCollider);

  stage.bugs = [
    {
      id: "BUG#06", code: "UI_COLLIDER",
      desc: "// HUD/console have collision now?? -mei",
      state: "dormant", triggerX: 110,
      activate(s) {
        this.state = "active";
        for (const p of uiParts(s)) { p.solid = true; p.glitchy = true; }
        log("[WARN] UI layer leaked into world collision", "warn");
      },
      fix(s) {
        this.state = "fixed";
        for (const p of uiParts(s)) { p.solid = false; p.glitchy = false; p.fading = true; }
        GAME.corruption += 1;
        log("[INFO] UI colliders removed", "info");
        log("[WARN] side effect: the platforms you stood on are gone", "warn");
      },
      ignore() {
        this.state = "ignored";
        log("[INFO] BUG#06 left unresolved — the UI is solid", "meta");
      },
      get resolved() { return this.state === "fixed" || this.state === "ignored"; },
    },
  ];
  return stage;
}

// ===== STAGE 4 — "Patch" : 演出④ — the tester becomes the fix target =====
// A dead-end room. Walk in and the build detects an unregistered entity — you.
// The debug panel force-opens with a single bug: BUG#00 TESTER_PRESENCE.
//   FIX    -> you get patched out (canonical ending).
//   IGNORE -> you refuse the patch (alternate ending).
// The ending sequence itself is driven by main.js (applyDecision -> startEnding).
function buildStage4() {
  const stage = {
    name: "STAGE 4 — PATCH",
    world: { w: 960, h: 540 }, // locked screen
    spawn: { x: 70, y: 430 },
    goal: null,                // no goal — the finale is the decision, not a flag
    final: true,
    platforms: [
      { id: "ground",   x: 0,   y: 490, w: 960, h: 50,  solid: true },
      { id: "end_wall", x: 936, y: 0,   w: 24,  h: 540, solid: true },
    ],
    enemies: [],
    bugs: [],
  };
  stage.bugs = [
    {
      id: "BUG#00", code: "TESTER_PRESENCE",
      desc: "// unregistered entity in build: 'tester'. patch it out? -???",
      state: "dormant", triggerX: 360,
      forceOpen: true, // main.js pops the panel open on activation
      activate() {
        this.state = "active";
        log("[ERROR] unregistered entity detected: tester", "err");
        log("[meta] the build wants to patch you out", "meta");
      },
      fix() { this.state = "fixed"; },     // ending handled in applyDecision()
      ignore() { this.state = "ignored"; },
      get resolved() { return this.state === "fixed" || this.state === "ignored"; },
    },
  ];
  return stage;
}

// ===== PROTOTYPE LAB — "Paradox" : one bug, both truths =====
// A design experiment (not in the main flow; open with ?lab). ONE gravity bug:
//   (A) a high ledge with a fragment reachable ONLY in low gravity  -> must NOT fix
//   (B) a ceilinged gap crossable ONLY in normal gravity (low-g bonks the
//       ceiling and falls; no safety floor)                          -> must fix
// Solution = order: grab the fragment low-g, THEN fix, THEN cross.
// The gravity bug here is REVERSIBLE (toggle FIX/REVERT) so you can never lock
// yourself out — the drama is spatial (different states needed at different x).
export function buildLab() {
  const stage = {
    name: "LAB — PARADOX",
    lab: true,
    world: { w: 1214, h: 720 },
    spawn: { x: 60, y: 520 },
    goal: { x: 1120, y: 400, w: 20, h: 160 },
    platforms: [
      { id: "ground", x: 0, y: 560, w: 1214, h: 160, solid: true },
      // (A) high ledge: only a low-gravity jump reaches it  -> must NOT fix
      { id: "frag_ledge", x: 360, y: 280, w: 120, h: 20, solid: true },
      // (B) a wall you must HOP, with a spike ceiling above the hop: the tall
      //     low-gravity jump skewers you; only the compact normal-g arc fits
      //     through the slot -> must fix
      { id: "wall", x: 700, y: 500, w: 40, h: 60, solid: true },
      { id: "end_wall", x: 1190, y: 0, w: 24, h: 720, solid: true },
    ],
    hazards: [{ id: "spikes", x: 620, y: 300, w: 240, h: 30 }],
    fragments: [{ x: 400, y: 246, got: false }],
    notes: [
      { x: 320, y: 252, text: "◈ low-gravity only" },
      { x: 560, y: 470, text: "low-g jumps into the spikes — patch to hop through" },
    ],
    enemies: [],
    bugs: [],
  };
  stage.bugs = [
    {
      id: "BUG#03", code: "GRAVITY_SCALE",
      desc: "// gravity_scale = 0.35 — [←/→] FIX / REVERT, [Enter] apply",
      state: "dormant", triggerX: 150, reversible: true,
      activate() { this.state = "active"; GAME.gravityScale = 0.4; log("[WARN] gravity_scale = 0.40 (floaty)", "warn"); },
      fix() { GAME.gravityScale = 1.0; this.state = "fixed"; log("[INFO] gravity_scale = 1.00 (stable)", "info"); },
      ignore() { GAME.gravityScale = 0.4; this.state = "ignored"; log("[INFO] gravity_scale = 0.40 (floaty)", "meta"); },
      get resolved() { return false; }, // reversible: always interactive
    },
  ];
  return stage;
}

export const STAGE_BUILDERS = [buildStage0, buildStage1, buildStage2, buildStage3, buildStage4];
export const STAGE_COUNT = STAGE_BUILDERS.length;

// Total data fragments across the game (one on each bug-use route: STAGE 1/2/3).
export const FRAGMENT_TOTAL = 3;

export function buildStage(index) {
  const s = STAGE_BUILDERS[index]();
  if (!s.enemies) s.enemies = [];       // STAGE 0 / 1 have none
  if (!s.fragments) s.fragments = [];   // most stages have none
  if (!s.hazards) s.hazards = [];       // spikes etc (lab only, for now)
  return s;
}
