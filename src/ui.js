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

// ---------- toast ----------
export function showToast() { el("toast").classList.remove("hidden"); }
export function hideToast() { el("toast").classList.add("hidden"); }

// ---------- debug panel ----------
// Renders the registry. `selected` action is "fix" or "ignore".
export function renderDebugPanel(bug, selected) {
  const list = el("debug-list");
  const resolved = bug.resolved;
  const fixOn = selected === "fix" ? "on" : "";
  const ignoreOn = selected === "ignore" ? "on" : "";

  let status = "";
  if (bug.state === "fixed") status = `<div class="bug-status resolved">&gt; FIXED — side effect applied. corruption: ${GAME.corruption}</div>`;
  else if (bug.state === "ignored") status = `<div class="bug-status resolved">&gt; IGNORED — bug is now yours to use.</div>`;
  else status = `<div class="bug-status">&gt; awaiting decision...</div>`;

  list.innerHTML = `
    <div class="bug-entry sel">
      <div class="bug-id">${bug.id} : ${bug.code}</div>
      <div class="bug-desc">${bug.desc}</div>
      <div class="bug-actions">
        <div class="bug-btn fix ${fixOn}">[ FIX ]</div>
        <div class="bug-btn ignore ${ignoreOn}">[ IGNORE ]</div>
      </div>
      ${status}
    </div>`;
}

export function openDebug() { el("debug").classList.remove("hidden"); }
export function closeDebug() { el("debug").classList.add("hidden"); }

// ---------- clear screen ----------
export function showClear() {
  const route = GAME.route || "NONE";
  const flavor =
    route === "IGNORE"
      ? "You used the bug. The build noticed."
      : route === "FIX"
      ? "You fixed it. Something else broke."
      : "You slipped past without deciding.";
  el("clear-stats").innerHTML =
    `route: <b>${route}</b><br>corruption: <b>${GAME.corruption}</b><br>time: <b>${GAME.elapsed.toFixed(1)}s</b><br><br><span style="color:#56e39f">${flavor}</span>`;
  el("clear").classList.remove("hidden");
}
export function hideClear() { el("clear").classList.add("hidden"); }
