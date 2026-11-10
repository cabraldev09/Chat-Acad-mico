// A sliding-window counter for the PUBLIC routes (webchat, lead form, affiliate portal): "more than `max` in `windowMs` for this key".
// The keys come from strangers (IP + visitor id), so the table is swept and capped: it cannot grow with the number of keys an attacker invents.
const MAX_KEYS = 20000;

export const makeThrottle = (max: number, windowMs: number): ((key: string) => boolean) => {
  const hits = new Map<string, number[]>();
  const sweep = setInterval(() => {
    const now = Date.now();
    hits.forEach((times, key) => {
      if (!times.length || now - times[times.length - 1] > windowMs) hits.delete(key);
    });
  }, Math.max(30000, Math.min(windowMs, 300000)));
  sweep.unref?.();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
    recent.push(now);
    hits.delete(key);
    hits.set(key, recent);
    if (hits.size > MAX_KEYS) {
      // Map keeps insertion order: the first keys are the oldest ones
      let drop = Math.ceil(MAX_KEYS / 10);
      for (const k of hits.keys()) {
        if (drop-- <= 0) break;
        hits.delete(k);
      }
    }
    return recent.length > max;
  };
};
