// A tab left open keeps running the version of the code it loaded, even after a new one was published. That is how a
// problem that was already fixed keeps appearing. Here the tab learns that it is out of date:
//  - the build writes /version.json with its id; the tab compares it with its own, when it opens, every few minutes
//    and whenever it comes back to the screen;
//  - once it is out of date, the next move to another screen loads that screen from the server (so it already runs
//    the new version, without interrupting what the person is typing), and a small notice offers "Atualizar agora";
//  - a screen that fails to draw in an out-of-date tab reloads by itself (see PageErrorBoundary).

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

const markStale = () => { if (stale) showNotice(); };

export const installVersionWatch = () => {
  if (BUILD === "dev" || typeof window === "undefined") return;
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
