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

export const STAGE_BUILDERS = [buildStage0, buildStage1];
export const STAGE_COUNT = STAGE_BUILDERS.length;

export function buildStage(index) {
  return STAGE_BUILDERS[index]();
}
