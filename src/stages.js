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

// ===== STAGE 0 — "TEST BUILD v0.3.1" : the HUNT teach, then the meta hook =====
// Hunt × both-truths renovation. Beats:
//   1. Two things flicker: a floating DECOY (perfectly fine) and the BRIDGE
//      over a bottomless gap (collider off — you fall through). No markers,
//      no labels: behavior is the tell. Hammer the bridge to cross.
//      Hammering a fixed thing again RE-BREAKS it (toggle; see main.js).
//   2. The CRASH PIT — crossing its edge triggers the fake crash; the stack
//      trace settles into the pit as stepping stones. (handled in main.js)
function buildStage0() {
  const stage = {
    name: "STAGE 0 — TEST BUILD",
    world: { w: 1900, h: 720 },
    spawn: { x: 60, y: 520 },
    goal: { x: 1800, y: 120, w: 26, h: 480 },
    // the fake crash fires when the tester steps up to the edge of the pit
    crashZone: { triggerX: 640 },
    platforms: [
      { id: "ground_a",  x: 0,   y: 600, w: 270, h: 120, solid: true },
      // the DECOY: flickers suspiciously, works perfectly ("tonk, not a bug")
      { id: "decoy_plat", x: 130, y: 480, w: 120, h: 20, solid: true, glitchy: true,
        hammerable: true, real: false, fixLine: "// looks fine to me -kj",
        line: "H_S0_DECOY" },
      // the REAL bug: bridge over a bottomless gap, collider off once active.
      // Falling through = respawn (the symptom that gives it away).
      { id: "bridge",    x: 270, y: 600, w: 220, h: 20,  solid: true, bug: true },
      { id: "ground_b",  x: 490, y: 600, w: 210, h: 120, solid: true },
      // THE CRASH PIT (x 700..1340) — no floor. The crash trace fills it.
      { id: "trace0", x: 750,  y: 545, w: 170, h: 20, solid: false, crash: true, label: "at Stage.update (build.js:512)" },
      { id: "trace1", x: 950,  y: 478, w: 170, h: 20, solid: false, crash: true, label: "at Tester.step (runner.js:404)" },
      { id: "trace2", x: 1160, y: 545, w: 160, h: 20, solid: false, crash: true, label: "at frame (main.js:66)" },
      { id: "ground_far", x: 1340, y: 600, w: 560, h: 120, solid: true },
      { id: "end_wall",   x: 1876, y: 0,   w: 24,  h: 720, solid: true },
    ],
    bugs: [],
  };

  stage.bugs = [
    {
      id: "BUG#01", code: "PLATFORM_COLLISION",
      desc: "// platform collider disabled? falls right through. -kj",
      state: "dormant", triggerX: 120,
      marker: { x: 290, y: 610 }, fixLine: "collider = solid;",
      toggleable: true,
      activate(s) {
        this.state = "active";
        find(s, "bridge").solid = false;
        find(s, "bridge").glitchy = true;
        log("[WARN] a collider went null somewhere", "warn");
      },
      fix(s) {
        this.state = "fixed";
        const b = find(s, "bridge"); b.solid = true; b.glitchy = false;
        GAME.corruption += 1;
        log("[INFO] bridge collider restored", "info");
      },
      unfix(s) {
        this.state = "active";
        const b = find(s, "bridge"); b.solid = false; b.glitchy = true;
        log("[WARN] bridge collider = null (re-broken by tester)", "warn");
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

// ===== STAGE 1 — "Paradox" : BUG#03 gravity + BUG#05 camera =====
// The "one bug, both truths" stage (promoted from the paradox lab):
//   USE low gravity  -> the high fragment ledge is reachable ONLY while floaty.
//   FIX gravity      -> the spike slot before the goal fits ONLY the compact
//                       normal-g hop (a low-g jump skewers you).
// One gravity NODE on the start ground; it's TOGGLEABLE (hammer a fixed node
// to re-break it), so the drama is ORDER, not lockout. Fixing twice costs
// corruption twice — planning ahead is the clean run.
function buildStage1() {
  const stage = {
    name: "STAGE 1 — PARADOX",
    world: { w: 2300, h: 1000 },
    spawn: { x: 50, y: 800 },
    goal: { x: 2180, y: 380, w: 26, h: 480 },
    platforms: [
      // flat intro (both bugs trigger here, before any platforming)
      { id: "ground_start", x: 0,    y: 860, w: 700,  h: 140, solid: true },

      // stepping stones across the pit
      { id: "step1", x: 745,  y: 815, w: 150, h: 22, solid: true },
      { id: "step2", x: 925,  y: 805, w: 150, h: 22, solid: true },
      { id: "step3", x: 1105, y: 805, w: 150, h: 22, solid: true },
      { id: "step4", x: 1285, y: 815, w: 110, h: 22, solid: true },

      // continuous lower safety ledge under the pit
      { id: "lower", x: 680, y: 905, w: 770, h: 95, solid: true },

      // far ground: spike slot, then the goal
      { id: "ground_far", x: 1430, y: 860, w: 846, h: 140, solid: true },

      // floaty platform that only "exists" because of the gravity bug.
      // FIX gravity -> it destabilizes and fades (a scar that does NOT come
      // back if you re-break gravity later — meddling leaves marks).
      { id: "floaty", x: 955, y: 660, w: 110, h: 20, solid: true, sideEffect: true },

      // high fragment ledge — reachable ONLY with low (bugged) gravity.
      { id: "secret", x: 920, y: 480, w: 150, h: 20, solid: true },

      // the spike slot: hop this wall with a compact normal-g arc. The tall
      // low-g arc rises into the spikes. (must-FIX gate)
      { id: "slot_wall", x: 1560, y: 800, w: 40, h: 60, solid: true },

      { id: "end_wall", x: 2276, y: 0, w: 24, h: 1000, solid: true },
    ],
    hazards: [{ id: "slot_spikes", x: 1400, y: 600, w: 320, h: 30 }],
    // route hints + kj/mei fragments (SCRIPT_JP.md F-series — F04, the
    // prj_mikan origin note, is only visible via the camera bug)
    notes: [
      { x: 930, y: 446, text: "◈ low-gravity only" },
      { x: 1400, y: 570, text: "low-g jumps into the spikes" },
      { x: 860, y: 466, text: "// この景色を見せたくてこの面つくった。カメラのバグは……まあ、あとで。 -mei", color: "#4d6b5c" },
      { x: 900, y: 402, text: "// prj_mikan: 「未完」のまま終わらせないように、って願掛け。あとみかん好きだから。 -mei", color: "#4d6b5c", req: "camera" },
    ],
    // reward for the low-gravity route (on the high ledge)
    fragments: [{ x: 995, y: 445, got: false }],
    bugs: [],
  };

  stage.bugs = [
    {
      id: "BUG#05", code: "CAMERA_CLAMP",
      desc: "// camera clamp disabled — viewport drifting up. -mei",
      state: "dormant", triggerX: 160,
      marker: { x: 230, y: 826 }, fixLine: "clamp_to_world = true;",
      toggleable: true,
      activate() {
        this.state = "active";
        GAME.cameraUnclamped = true; // reveals the upper area / fragment ledge
        log("[WARN] camera2d clamp_to_world = false", "warn");
      },
      fix() {
        this.state = "fixed";
        GAME.cameraUnclamped = false;
        GAME.corruption += 1;
        log("[INFO] camera clamp restored", "info");
        log("[WARN] side effect: the upper route is out of view now", "warn");
      },
      unfix() {
        this.state = "active";
        GAME.cameraUnclamped = true;
        log("[WARN] camera clamp released again", "warn");
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
      state: "dormant", triggerX: 300,
      marker: { x: 560, y: 826 }, fixLine: "gravity_scale = 1.0;",
      toggleable: true,
      activate() {
        this.state = "active";
        GAME.gravityScale = 0.4; // floaty
        log("[WARN] physics.gravity_scale = 0.40", "warn");
      },
      fix(s) {
        this.state = "fixed";
        GAME.gravityScale = 1.0;
        const f = find(s, "floaty");
        if (f.solid) {
          f.solid = false; f.glitchy = true; f.fading = true; // side effect (permanent scar)
          log("[WARN] side effect: 'floaty' platform fell out of the build", "warn");
        }
        GAME.corruption += 1;
        log("[INFO] gravity_scale restored to 1.00", "info");
      },
      unfix() {
        this.state = "active";
        GAME.gravityScale = 0.4;
        log("[WARN] gravity_scale = 0.40 (re-broken by tester)", "warn");
      },
      ignore() {
        this.state = "ignored";
        log("[INFO] BUG#03 left unresolved — low gravity in effect", "meta");
      },
      get resolved() { return this.state === "fixed" || this.state === "ignored"; },
    },
  ];

  // decoy node: flickers on the start ground, is nothing
  stage.decoys = [
    { id: "decoy_totem", x: 340, y: 810, w: 34, h: 50,
      quip: "// physics looks fine HERE -mei", line: "H_S1_DECOY" },
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
    notes: [
      { x: 1552, y: 846, text: "// gate_Aのstate管理、おれのせい。ごめん。次のビルドで直す(直さない) -kj", color: "#4d6b5c" },
      { x: 1960, y: 588, text: "// guard_01のAI、meiの自信作。フリーズしてるけど。笑うなよ。 -kj", color: "#4d6b5c" },
    ],
    bugs: [],
  };

  const wake = (s) => {
    const e = s.enemies[0];
    e.dangerous = true; e.solid = false; e.glitchy = false;
  };

  stage.bugs = [
    {
      // HUNT twist: the symptom is the door at x1500 — but the CAUSE is a
      // desynced state flag way back near the start. Real debugging.
      id: "BUG#02", code: "DOOR_STATE",
      desc: "// gate won't open. state flag desync? -mei",
      state: "dormant", triggerX: 360,
      marker: { x: 700, y: 826 }, fixLine: "gate_A.state = open;",
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
        log("[INFO] gate_A opened — far away, something moved", "info");
        log("[WARN] side effect: enemy 'guard_01' AI re-enabled", "warn");
      },
      // NOT toggleable: an opened gate stays open (some fixes can't be unfixed)
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
      marker: { x: 1300, y: 586 }, fixLine: "ai.state = active;",
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
      // NOT toggleable: a woken AI does not go back to sleep
      ignore() {
        this.state = "ignored";
        log("[INFO] BUG#04 left unresolved — guard stays frozen", "meta");
      },
      get resolved() { return this.state === "fixed" || this.state === "ignored"; },
    },
  ];

  // decoy: a second state flag right next to the door — the obvious wrong answer
  stage.decoys = [
    { id: "decoy_flag", x: 1420, y: 810, w: 34, h: 50,
      quip: "// this one is gate_B. wrong flag.", line: "H_S2_DECOY" },
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
    notes: [
      { x: 250, y: 504, text: '// "mikan" = tangerine. mei thinks she\'s hilarious. …まあ、ちょっとおもしろい -kj', color: "#4d6b5c" },
    ],
    bugs: [],
  };

  const uiParts = (s) => s.platforms.filter((p) => p.uiCollider);

  stage.bugs = [
    {
      // HUNT twist: the real node is the TOAST — the bug report itself is
      // what leaked into the world. The other UI pieces are symptoms (decoys).
      id: "BUG#06", code: "UI_COLLIDER",
      desc: "// HUD/console have collision now?? -mei",
      state: "dormant", triggerX: 90,
      marker: { x: 260, y: 340 }, fixLine: "ui.collision = off;",
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
      // NOT toggleable: the faded UI does not come back
      ignore() {
        this.state = "ignored";
        log("[INFO] BUG#06 left unresolved — the UI is solid", "meta");
      },
      get resolved() { return this.state === "fixed" || this.state === "ignored"; },
    },
  ];

  // decoys: the other leaked UI pieces — solid symptoms, not the cause.
  // They stop being targets once the bug is fixed (the UI fades out).
  stage.decoys = [
    { id: "decoy_hud", x: 410, y: 340, w: 160, h: 26, whileActive: "BUG#06",
      quip: "// symptom, not cause. -mei", line: "H_S3_HUD" },
    { id: "decoy_log", x: 590, y: 360, w: 150, h: 40, whileActive: "BUG#06",
      quip: "// symptom, not cause. -mei", line: "H_S3_LOG" },
  ];
  return stage;
}

// ===== STAGE 4 — "Patch" : 演出④ — the tester becomes the fix target =====
// The HUNT's final joke: the corridor is lined with flickering nodes and every
// single one is a decoy ("not a bug", "not a bug", "not a bug"...). The only
// real fix target is you. Hammer yourself to patch (canonical ending), or walk
// to the exit and refuse (alternate ending). Handled in main.js.
function buildStage4() {
  const stage = {
    name: "STAGE 4 — PATCH",
    world: { w: 1200, h: 540 },
    spawn: { x: 70, y: 430 },
    goal: { x: 1120, y: 330, w: 20, h: 160 }, // the exit = refuse the patch
    final: true,
    platforms: [
      { id: "ground",   x: 0,    y: 490, w: 1200, h: 50, solid: true },
      { id: "end_wall", x: 1176, y: 0,   w: 24,   h: 540, solid: true },
    ],
    // every node here is a decoy — the escalating joke of the finale
    decoys: [
      { id: "d0", x: 420, y: 440, w: 34, h: 50, quip: "// not a bug", line: "H_S4_D0" },
      { id: "d1", x: 560, y: 440, w: 34, h: 50, quip: "// not a bug", line: "H_S4_D1" },
      { id: "d2", x: 700, y: 440, w: 34, h: 50, quip: "// not a bug", line: "H_S4_D2" },
      { id: "d3", x: 840, y: 440, w: 34, h: 50, quip: "// not a bug", line: "H_S4_D3" },
    ],
    enemies: [],
    // 2nd-visit-only traces of mei (F06/F07) — her promise, then her last commit
    notes: [
      { x: 110, y: 470, text: "// TODO: 後で必ず直します。必ず。 -mei", color: "#4d6b5c", req: "run2" },
      { x: 830, y: 470, text: "commit 8f3a2c1: add tester presence check — mei", color: "#4d6b5c", req: "run2" },
    ],
    bugs: [],
  };
  stage.bugs = [
    {
      id: "BUG#00", code: "TESTER_PRESENCE",
      desc: "// unregistered entity in build: 'tester'. patch it out? -???",
      state: "dormant", triggerX: 300,
      self: true,                 // the fix target is the player (hammer yourself)
      fixLine: "remove tester;",
      activate() {
        this.state = "active";
        log("[ERROR] unregistered entity detected: tester", "err");
        log("[meta] the build wants to patch you out", "meta");
      },
      fix() { this.state = "fixed"; },     // ending handled in main.js
      get resolved() { return this.state === "fixed"; },
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

// ===== HAMMER LAB — "where's the bug?" + physical fix =====
// Fixing is diegetic: walk up to the glitching thing and hammer it (a tiny
// console pops up and rewrites the code). Two things flicker — only one is the
// real bug (it misbehaves: you fall through it). The decoy is fine; hammering
// it just goes "tonk, not a bug". Open with ?lab=hammer.
export function buildLabHammer() {
  const stage = {
    name: "LAB — HAMMER FIX",
    lab: true,
    world: { w: 1214, h: 720 },
    spawn: { x: 60, y: 520 },
    goal: { x: 1120, y: 400, w: 20, h: 160 },
    platforms: [
      { id: "ground_start", x: 0, y: 560, w: 480, h: 160, solid: true },
      // decoy: flickers but is perfectly solid (a red herring)
      { id: "decoy", x: 200, y: 490, w: 120, h: 20, solid: true, glitchy: true,
        hammerable: true, real: false, fixLine: "// looks fine to me -kj" },
      // the real bug: a bridge across the pit with its collider disabled
      // (glitches AND you fall through it). Hammer it solid to cross.
      { id: "bridge", x: 480, y: 540, w: 260, h: 20, solid: false, glitchy: true,
        hammerable: true, real: true, fixLine: "collider = solid;" },
      { id: "ground_far", x: 740, y: 560, w: 474, h: 160, solid: true },
      { id: "end_wall", x: 1190, y: 0, w: 24, h: 720, solid: true },
    ],
    notes: [{ x: 90, y: 430, text: "something here falls through... which one is the bug?" }],
    enemies: [],
    fragments: [],
    hazards: [],
    bugs: [],
  };
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
  if (!s.hazards) s.hazards = [];       // spikes etc
  if (!s.decoys) s.decoys = [];         // hunt decoy nodes
  return s;
}
