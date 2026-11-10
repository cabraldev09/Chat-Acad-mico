import { lazy } from "react";

// A new version was published while this tab was open: the page files it knows by name no longer exist and a lazy page
// would stay blank. The first failure reloads the tab (it then loads the new version); a second one within 20 seconds
// is passed on so the error screen can say so instead of looping.
const KEY = "chunk-reload-at";

export const reloadForNewVersion = () => {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 20000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch (e) { /* storage blocked: reload once anyway */ }
  window.location.reload();
  return true;
};

// A deploy takes a few seconds to reach every server: the file may fail once and exist a moment later. Three tries first, a reload only after that.
const withRetry = async (factory, tries = 3, wait = 900) => {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await factory();
    } catch (err) {
      last = err;
      // eslint-disable-next-line no-await-in-loop
      if (i < tries - 1) await new Promise((r) => setTimeout(r, wait * (i + 1)));
    }
  }
  throw last;
};

export const lazyPage = (factory) =>
  lazy(() =>
    withRetry(factory).catch((err) => {
      if (reloadForNewVersion()) return new Promise(() => undefined); // the page is being reloaded
      throw err;
    })
  );

// vite also reports failed preloads of lazy files with this event
export const installChunkRecovery = () => {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
};
