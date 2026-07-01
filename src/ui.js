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
export function setStageLabel(name) { el("hud-stage").textContent = name; }

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
