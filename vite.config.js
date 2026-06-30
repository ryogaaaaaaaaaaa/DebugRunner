import { defineConfig } from "vite";

// Relative base so the build works under any sub-path:
//  - GitHub Pages project site (https://<user>.github.io/DebugRunner/)
//  - itch.io / any static host
// Assets are emitted as ./assets/... instead of /assets/...
export default defineConfig({
  base: "./",
});
