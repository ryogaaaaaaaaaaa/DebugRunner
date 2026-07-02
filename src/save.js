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

// A second, humbler marker (cookie). If the cookie survives but the save is
// gone, the tester wiped their storage — and MIKAN noticed (line B08).
export function markSeen() {
  try { document.cookie = "dr_s=1;max-age=31536000;path=/"; } catch (e) {}
}
export function wipeDetected(save) {
  try { return !save.runs && document.cookie.includes("dr_s=1"); } catch (e) { return false; }
}
