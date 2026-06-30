import { GAME } from "./state.js";
import { log } from "./ui.js";

// Phase 1 ships a single, fully-wired bug: BUG#01 PLATFORM_COLLISION.
// The structure (state machine + fix/ignore/side-effect) is the template the
// remaining bugs slot into later.
export function makeBugRegistry(level) {
  const buggy = level.platforms.find((p) => p.id === "buggy");
  const decor = level.platforms.find((p) => p.id === "decor");

  return {
    list: [
      {
        id: "BUG#01",
        code: "PLATFORM_COLLISION",
        desc: "// platform collider disabled? falls right through. -kj",
        state: "dormant", // dormant -> active -> fixed | ignored

        activate() {
          if (this.state !== "dormant") return;
          this.state = "active";
          buggy.solid = false;     // the bug: you fall through
          buggy.glitchy = true;
          log("[WARN] entity 'platform_03' collider = null", "warn");
        },

        fix() {
          if (this.state === "fixed") return;
          this.state = "fixed";
          buggy.solid = true;
          buggy.glitchy = false;
          GAME.route = "FIX";
          GAME.corruption += 1;
          // Side effect: a DIFFERENT object breaks.
          decor.solid = false;
          decor.glitchy = true;
          decor.fading = true;
          log("[INFO] platform_03 collider restored", "info");
          log("[WARN] side effect: 'decor_block' destabilized", "warn");
        },

        ignore() {
          if (this.state === "fixed") return;
          this.state = "ignored";
          GAME.route = "IGNORE";
          log("[INFO] BUG#01 left unresolved by tester", "meta");
        },

        get resolved() {
          return this.state === "fixed" || this.state === "ignored";
        },
      },
    ],

    // Returns the bug whose trigger the player just entered, or null.
    checkTriggers(player, level) {
      const b = this.list[0];
      if (b.state === "dormant" && player.x > level.bugTriggerX) {
        b.activate();
        return b;
      }
      return null;
    },
  };
}
