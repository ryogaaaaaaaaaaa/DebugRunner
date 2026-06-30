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

export const STAGE_BUILDERS = [buildStage0, buildStage1, buildStage2];
export const STAGE_COUNT = STAGE_BUILDERS.length;

export function buildStage(index) {
  const s = STAGE_BUILDERS[index]();
  if (!s.enemies) s.enemies = []; // STAGE 0 / 1 have none
  return s;
}
