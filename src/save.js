// Tiny persistent memory — the uncanny hook. The build "remembers" the tester
// across runs (run count, last choice, whether they ever refused / patched).
// localStorage only; degrades to an empty object if unavailable (private mode).
const KEY = "debugrunner.save.v1";

export function loadSave() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
}
