// STAGE 0 — "TEST BUILD v0.3.1"
// A single horizontally-scrolling slice with TWO ways to the goal:
//   - FIX route:    cross the (repaired, solid) buggy platform along the top.
//   - IGNORE route: fall THROUGH the buggy platform into the pit and take the
//                   lower shortcut ledge.
// Both reach the goal — the slice teaches "fix vs. use", not "win/lose".

export function makeLevel() {
  return {
    spawn: { x: 60, y: 520 },

    // AABB platforms. `solid` is the live collision flag and can be toggled
    // at runtime by the bug system.
    platforms: [
      { id: "ground_left",  x: 0,    y: 600, w: 420, h: 120, solid: true },
      { id: "ground_right", x: 1100, y: 600, w: 500, h: 120, solid: true },

      // The shortcut path at the bottom of the pit (IGNORE route).
      { id: "lower",        x: 430,  y: 655, w: 690, h: 65,  solid: true },

      // THE buggy platform. Bridges the pit at mid-height (FIX route).
      { id: "buggy",        x: 470,  y: 465, w: 380, h: 24,  solid: true, bug: true },

      // Stepping stone from the buggy platform up to the right ground.
      { id: "step",         x: 900,  y: 545, w: 150, h: 20,  solid: true },

      // Side-effect target: a harmless floating block far from the path.
      // Repairing the buggy platform makes THIS glitch out — the visible
      // "fixing one thing breaks another" beat.
      { id: "decor",        x: 690,  y: 330, w: 90,  h: 20,  solid: true, sideEffect: true },

      // World boundary — stops the player running off the right edge into the void.
      { id: "end_wall",     x: 1576, y: 0,   w: 24,  h: 720, solid: true },
    ],

    // Reach this to clear the stage. Tall trigger column so a jumping player
    // (e.g. climbing in from the lower route) can't sail over the flag.
    goal: { x: 1500, y: 120, w: 26, h: 480 },

    // Player must pass x > triggerX (with the bug dormant) to spawn the bug.
    bugTriggerX: 360,
  };
}
