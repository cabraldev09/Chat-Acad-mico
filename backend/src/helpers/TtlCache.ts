// Small in-memory cache for answers that many people ask for at the same time (the home screen, statistics, lists
// that rarely change). Two things make it safe:
//  - requests that arrive while the answer is being computed share that one computation (no stampede)
//  - everything is dropped after a few seconds, and `forget(prefix)` clears a family of keys when the data changes
// The API runs as a single process, so a plain Map is enough.
interface Entry {
  at: number;
  value?: any;
  pending?: Promise<any>;
}

const store = new Map<string, Entry>();
const MAX_KEYS = 500;

export const remember = async <T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> => {
  const now = Date.now();
  const hit = store.get(key);
  if (hit) {
    if (hit.pending) return hit.pending as Promise<T>;
    if (now - hit.at < ttlMs) return hit.value as T;
  }
  if (store.size >= MAX_KEYS) {
    // drop the oldest quarter: keys are cheap to rebuild
    [...store.entries()]
      .sort((a, b) => a[1].at - b[1].at)
      .slice(0, Math.ceil(MAX_KEYS / 4))
      .forEach(([k]) => store.delete(k));
  }
  const pending = compute().then(
    value => {
      store.set(key, { at: Date.now(), value });
      return value;
    },
    err => {
      store.delete(key);
      throw err;
    }
  );
  store.set(key, { at: now, pending });
  return pending;
};

// clears every key that starts with the prefix (or everything when called without one)
export const forget = (prefix = ""): void => {
  [...store.keys()].filter(k => k.startsWith(prefix)).forEach(k => store.delete(k));
};

// plain get/put for callers that cannot wrap their work in a function (response middleware)
export const peek = <T>(key: string, ttlMs: number): T | undefined => {
  const hit = store.get(key);
  return hit && !hit.pending && Date.now() - hit.at < ttlMs ? (hit.value as T) : undefined;
};

export const put = (key: string, value: any): void => {
  if (store.size >= MAX_KEYS) forget("ref:");
  store.set(key, { at: Date.now(), value });
};
