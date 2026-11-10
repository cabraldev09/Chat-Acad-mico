// A tab left open keeps running the version of the code it loaded, even after a new one was published. That is how a
// problem that was already fixed keeps appearing. Here the tab learns that it is out of date:
//  - the build writes /version.json with its id; the tab compares it with its own, when it opens, every few minutes
//    and whenever it comes back to the screen;
//  - once it is out of date, the tab reloads BY ITSELF at a safe moment (see `safeToReload`): never while the person has
//    something typed in a field or a window open, and only after a few seconds without touching anything (or at once when
//    the tab is in the background). The next move to another screen is also loaded from the server. If a safe moment does
//    not come for a few minutes, a small notice offers "Atualizar agora";
//  - a screen that fails to draw in an out-of-date tab reloads by itself (see PageErrorBoundary).

// __BUILD_ID__ is put in place by the build (vite.config.js, `define`); in development it does not exist
/* global __BUILD_ID__ */
export const BUILD = typeof __BUILD_ID__ !== "undefined" ? String(__BUILD_ID__) : "dev";

let stale = false;
let notice = null;

export const isOutOfDate = () => stale;

// asks the server which version is published; false when it cannot tell (offline, no file, local development)
export const checkVersion = async () => {
  if (BUILD === "dev") return false;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return stale;
    const data = await res.json();
    if (data && data.id && String(data.id) !== BUILD) stale = true;
  } catch (e) { /* not a JSON file (the app's own page answered) or no network: nothing to conclude */ }
  return stale;
};

const showNotice = () => {
  if (notice || typeof document === "undefined") return;
  notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:calc(100vw - 32px);display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:#0B4279;color:#fff;font:14px/1.3 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)";
  const text = document.createElement("span");
  text.textContent = "Há uma versão nova do sistema.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Atualizar agora";
  button.style.cssText = "border:0;border-radius:8px;padding:7px 12px;background:#fff;color:#0B4279;font-weight:600;cursor:pointer";
  button.onclick = () => window.location.reload();
  notice.append(text, button);
  document.body.appendChild(notice);
};

// ---- the automatic update
const RELOADS = "versionReloads";
let lastTouch = Date.now();
let staleSince = 0;
let ticking = false;

// a reload loop (a copy of the page kept by the network that still answers with the old version) is cut after two tries
const reloadsLeft = () => {
  try {
    const recent = JSON.parse(window.sessionStorage.getItem(RELOADS) || "[]").filter((t) => Date.now() - t < 10 * 60 * 1000);
    return recent.length < 2;
  } catch (e) {
    return true;
  }
};
const noteReload = () => {
  try {
    const recent = JSON.parse(window.sessionStorage.getItem(RELOADS) || "[]").filter((t) => Date.now() - t < 10 * 60 * 1000);
    window.sessionStorage.setItem(RELOADS, JSON.stringify([...recent, Date.now()]));
  } catch (e) { /* no storage: the notice still works */ }
};

// something typed and not sent yet (a message, a form): reloading would lose it
const hasTypedText = () => {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return String(el.value || "").length > 0;
  if (tag === "INPUT" && !["checkbox", "radio", "button", "submit", "range", "color", "file"].includes(el.type)) return String(el.value || "").length > 0;
  return !!el.isContentEditable && String(el.textContent || "").trim().length > 0;
};
const windowOpen = () => !!document.querySelector('[role="dialog"], [aria-modal="true"]');

// the safe moment: nothing typed, no window open, and either the tab is in the background or the person stopped touching it
export const safeToReload = () => {
  if (hasTypedText() || windowOpen()) return false;
  if (document.visibilityState === "hidden") return true;
  return Date.now() - lastTouch > 15000;
};

const autoTick = () => {
  if (!stale) return;
  if (!staleSince) staleSince = Date.now();
  if (reloadsLeft() && safeToReload()) {
    noteReload();
    window.location.reload();
    return;
  }
  // no safe moment for a while (or the reloads did not fix it): the person decides
  if (Date.now() - staleSince > 3 * 60 * 1000 || !reloadsLeft()) showNotice();
};

const markStale = () => {
  if (!stale) return;
  autoTick();
  if (!ticking) {
    ticking = true;
    setInterval(autoTick, 5000);
  }
};

export const installVersionWatch = () => {
  if (BUILD === "dev" || typeof window === "undefined") return;
  ["keydown", "pointerdown", "wheel", "touchstart"].forEach((ev) => window.addEventListener(ev, () => { lastTouch = Date.now(); }, { capture: true, passive: true }));
  const run = () => checkVersion().then(markStale);
  setTimeout(run, 15000);
  setInterval(run, 3 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") run(); });
  // out of date: the next move to another screen is a real page load, which brings the new version
  const push = window.history.pushState;
  window.history.pushState = function pushState(state, title, url) {
    if (stale && url) { window.location.assign(url); return undefined; }
    return push.apply(this, arguments);
  };
};
