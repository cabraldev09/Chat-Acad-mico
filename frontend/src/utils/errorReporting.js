import api from "../services/api";

// Where every failure that reaches the browser is written down (Configurações > Erros de tela): the boundaries around
// screens and sections, and the errors that escape React altogether (a promise nobody caught, a script error).

export const newErrorCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();

// the same failure is sent once every 5 seconds (a "try again" that fails again must not flood the server)
const lastSent = new Map();

export const reportClientError = ({ code, error, info, kind }) => {
  try {
    const message = String((error && error.message) || error || "");
    const key = `${window.location.pathname}|${message}`;
    const now = Date.now();
    if (now - (lastSent.get(key) || 0) < 5000) return;
    lastSent.set(key, now);
    if (lastSent.size > 50) lastSent.clear();
    api.post("/client-errors", {
      code: code || newErrorCode(),
      route: window.location.pathname + window.location.hash,
      message: kind ? `[${kind}] ${message}` : message,
      // the server keeps a short text: a long component stack would be refused for its size and the report lost
      stack: error && error.stack ? String(error.stack).slice(0, 4000) : undefined,
      components: info && info.componentStack ? String(info.componentStack).slice(0, 4000) : undefined,
    }).catch(() => {});
  } catch (e) { /* reporting must never break the screen */ }
};

// at most a few reports a minute, and the same message once: a loop of errors must not flood the server
const seen = new Map();
const allowed = (message) => {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 60000) seen.delete(k);
  if (seen.has(message) || seen.size >= 5) return false;
  seen.set(message, now);
  return true;
};

// what the person can do about it; the API's own answers (a 400 with a message) are shown by the screens, not here
const fromApi = (reason) => !!(reason && (reason.isAxiosError || reason.response || reason.config));
// the noise of the development server (sound library) and of the browser, never of the system
const noise = (message) => /ResizeObserver|HowlConstructor|Loading chunk|Failed to fetch dynamically imported|Script error|NetworkError|Load failed/i.test(message);

export const installGlobalErrorReporting = () => {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (fromApi(reason)) return;
    const message = String((reason && reason.message) || reason || "");
    if (!message || noise(message) || !allowed(message)) return;
    reportClientError({ error: reason instanceof Error ? reason : new Error(message), kind: "promise" });
  });
  window.addEventListener("error", (event) => {
    const message = String(event.message || "");
    if (!message || noise(message) || !allowed(message)) return;
    reportClientError({ error: event.error || new Error(message), kind: "script" });
  });
};
