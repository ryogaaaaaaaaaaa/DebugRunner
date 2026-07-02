import { GAME } from "./state.js";

const el = (id) => document.getElementById(id);

let logLines = [];
const MAX_LOG = 8;

// ---------- error log console ----------
export function log(text, tone = "info") {
  logLines.push({ text, tone });
  if (logLines.length > MAX_LOG) logLines.shift();
  const body = el("log-body");
  if (!body) return;
  body.innerHTML = logLines
    .map((l) => `<div class="log-${l.tone}">${escapeHtml(l.text)}</div>`)
    .join("");
}

export function clearLog() {
  logLines = [];
  const body = el("log-body");
  if (body) body.innerHTML = "";
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// ---------- HUD ----------
export function setStageLabel(name) {
  const node = el("hud-stage");
  if (!node) return;
  // self-rewrite: the stage label garbles once the build starts decaying
  if (GAME.incursion >= 2 && Math.random() < 0.06) {
    node.textContent = garble(name, 0.35);
    node.classList.add("glitch");
  } else {
    node.textContent = name;
    node.classList.remove("glitch");
  }
}

const GARBLE_CHARS = "▓▒░#@!?%".split("");
function garble(s, p) {
  return Array.from(s).map((c) => (c !== " " && Math.random() < p ? GARBLE_CHARS[(Math.random() * GARBLE_CHARS.length) | 0] : c)).join("");
}

// The INTEGRITY readout is a LIE until the build is forced to reveal it.
export function setMeta(fragments, total, integ) {
  const node = el("hud-meta");
  if (!node) return;
  let shown;
  if (GAME.hudTrue) {
    shown = integ + "%";
  } else if (GAME.incursion >= 1 && Math.random() < 0.05) {
    shown = (82 + (Math.random() * 18 | 0)) + "%"; // a brief wrong flicker — something's off
  } else {
    shown = "100%"; // reassuring lie
  }
  if (GAME.hudRevealT > 0 && Math.random() < 0.55) shown = garble(shown, 0.5); // reveal glitch
  node.innerHTML = `◈ ${fragments}/${total} &nbsp; INTEGRITY ${shown}`;
  node.classList.toggle("hud-lie-reveal", GAME.hudRevealT > 0);
}

// ---------- title ----------
export function showTitle() { el("title").classList.remove("hidden"); }
export function hideTitle() { el("title").classList.add("hidden"); }

// ---------- toast ----------
export function showToast() { el("toast").classList.remove("hidden"); }
export function hideToast() { el("toast").classList.add("hidden"); }

// ---------- debug panel ----------
// bugs: array of DETECTED bug objects. selIndex: highlighted entry.
// action: 'fix' | 'ignore' for the highlighted, unresolved entry.
export function renderDebugPanel(bugs, selIndex, action) {
  const list = el("debug-list");

  // 演出段階③ : corrupt the debug console itself
  const corrupt = GAME.panelCorrupt;
  const titleEl = el("debug-title");
  if (titleEl) titleEl.textContent = corrupt ? "D3BUG C0NS̶OLE" : "DEBUG CONSOLE";
  const box = el("debug-box");
  if (box) box.classList.toggle("corrupt", !!corrupt);
  const FIX = corrupt ? "F1X" : "FIX";
  const IGNORE = corrupt ? "IGN0RE" : "IGNORE";

  if (!bugs.length) {
    list.innerHTML = `<div class="bug-desc" style="text-align:center">no bugs detected.<br>keep testing...</div>`;
    return;
  }
  list.innerHTML = bugs
    .map((bug, i) => {
      const sel = i === selIndex ? "sel" : "";
      let body;
      if (bug.resolved) {
        const tag = bug.state === "fixed" ? "FIXED" : "IGNORED";
        const cls = bug.state === "fixed" ? "" : "ignore-tag";
        body = `<div class="bug-status resolved ${cls}">&gt; ${tag}</div>`;
      } else {
        const fixOn = i === selIndex && action === "fix" ? "on" : "";
        const ignoreOn = i === selIndex && action === "ignore" ? "on" : "";
        body = `
          <div class="bug-actions">
            <div class="bug-btn fix ${fixOn}">[ ${FIX} ]</div>
            <div class="bug-btn ignore ${ignoreOn}">[ ${IGNORE} ]</div>
          </div>`;
      }
      return `
        <div class="bug-entry ${sel}" data-i="${i}">
          <div class="bug-id">${bug.id} : ${bug.code}</div>
          <div class="bug-desc">${escapeHtml(bug.desc)}</div>
          ${body}
        </div>`;
    })
    .join("");

  if (corrupt) {
    list.innerHTML += `<div class="bug-desc" style="color:#e35664;text-align:center">&gt; the console is reading you back</div>`;
  }
}

export function openDebug() { el("debug").classList.remove("hidden"); }
export function closeDebug() { el("debug").classList.add("hidden"); }

// ---------- clear / stage transition ----------
export function showClear({ title, sub, stats, buttonLabel }) {
  el("clear-title").textContent = title;
  el("clear-sub").textContent = sub;
  el("clear-stats").innerHTML = stats;
  el("clear-retry").textContent = buttonLabel;
  el("clear").classList.remove("hidden");
}
export function hideClear() { el("clear").classList.add("hidden"); }

// ---------- ending (演出段階④) ----------
export function showEnding() {
  el("ending-lines").innerHTML = "";
  el("ending-restart").classList.add("hidden");
  el("ending").classList.remove("hidden");
}
export function hideEnding() { el("ending").classList.add("hidden"); }
export function pushEndingLine(text, tone = "info") {
  const div = document.createElement("div");
  div.className = `end-line end-${tone}`;
  div.textContent = text;
  el("ending-lines").appendChild(div);
}
export function showEndingRestart() { el("ending-restart").classList.remove("hidden"); }

// ---------- incursion (演出段階② : UI / log anomalies) ----------
const META_LINES = [
  ["[WARN] tester input is being logged", "warn"],
  ["[ERROR] who is reading this console?", "err"],
  ["[meta] the build can see the tester", "meta"],
  ["[WARN] entity 'tester' not found in manifest", "warn"],
  ["[meta] do not fix what is watching you", "meta"],
];
let metaIdx = 0;

export function emitMetaLine() {
  const [t, tone] = META_LINES[metaIdx % META_LINES.length];
  metaIdx++;
  log(t, tone);
}

const GLITCH = "▓▒░#@!*?".split("");
export function glitchBuildLabel(originalText, on) {
  const node = el("hud-build");
  if (!on) { node.textContent = originalText; node.classList.remove("glitch"); return; }
  node.classList.add("glitch");
  node.textContent = originalText
    .split("")
    .map((c) => (c !== " " && Math.random() < 0.4 ? GLITCH[(Math.random() * GLITCH.length) | 0] : c))
    .join("");
}

export function setIncursionClass(level) {
  const stage = el("stage");
  stage.classList.toggle("incursion1", level >= 1);
  stage.classList.toggle("incursion2", level >= 2);
}

// ---------- the build's voice (second-person, meta) ----------
// A caption that types itself in and speaks TO the tester. Tone shifts the
// look from warm/comedic to cold to dread. Queued so lines don't clobber.
// "††" inside a line = a 0.4s hesitation (script notation, see SCRIPT_JP.md).
// The caret ▮ is MIKAN's only "face" (CHARACTER_BIBLE §4): blink patterns
// carry the emotion — steady, slow, or arrhythmic.
let voiceQ = [];
let voiceCur = null;
let caretEl = null;
let caretT = 0, caretOn = true, caretDreadPeriod = 0.3;
const GARBLE = "▓▒░#@!?".split("");
const CPS = 32;         // typing speed
const PAUSE = 0.4;      // †† hesitation

export function speak(text, tone = "cold", opts = {}) {
  voiceQ.push({ text, tone, hold: opts.hold ?? 2.4 });
}
export function clearVoice() {
  voiceQ = []; voiceCur = null;
  const n = el("voice");
  if (n) { n.className = ""; n.textContent = ""; }
}

function voiceDur(v) {
  let d = 0;
  v.parts.forEach((s, i) => { d += s.length / CPS; if (i > 0) d += PAUSE; });
  return d;
}

export function tickVoice(dt) {
  const n = el("voice");
  if (!n) return;
  if (!voiceCur) {
    if (!voiceQ.length) return;
    voiceCur = voiceQ.shift();
    voiceCur.t = 0;
    voiceCur.parts = voiceCur.text.split("††");
    n.className = "show voice-" + voiceCur.tone;
  }
  const v = voiceCur;
  v.t += dt;

  // walk the segments: type CPS chars/sec, pausing PAUSE at each ††
  let t = v.t, out = "", done = true;
  for (let i = 0; i < v.parts.length; i++) {
    if (i > 0) { if (t < PAUSE) { done = false; break; } t -= PAUSE; }
    const seg = v.parts[i];
    const chars = Math.floor(t * CPS);
    if (chars < seg.length) { out += seg.slice(0, Math.max(0, chars)); done = false; break; }
    out += seg; t -= seg.length / CPS;
  }
  // dread garbles the trailing character while typing (unstable voice)
  if (!done && v.tone === "dread" && out.length && Math.random() < 0.5) {
    out = out.slice(0, -1) + GARBLE[(Math.random() * GARBLE.length) | 0];
  }
  n.textContent = out;

  // caret ▮ — blink pattern per tone (comedy 530ms / cold slow / dread arrhythmic)
  if (!caretEl) { caretEl = document.createElement("span"); caretEl.id = "voice-caret"; caretEl.textContent = "▮"; }
  if (caretEl.parentNode !== n) n.appendChild(caretEl);
  caretT += dt;
  const period = v.tone === "cold" ? 0.9 : v.tone === "dread" ? caretDreadPeriod : 0.53;
  if (caretT >= period) {
    caretT = 0; caretOn = !caretOn;
    if (v.tone === "dread") caretDreadPeriod = 0.1 + Math.random() * 0.5;
  }
  caretEl.style.visibility = caretOn ? "visible" : "hidden";
  caretEl.classList.toggle("caret-bounce", done && v.tone === "comedy");

  if (done && v.t > voiceDur(v) + v.hold) {
    voiceCur = null;
    if (!voiceQ.length) n.className = "";
  }
}
