// Pure helpers of the copy of a QR Code number's chats (no browser here, so they can be tested alone).

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
export const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// Right after a QR Code is read, WhatsApp Web keeps receiving the chats from the phone for a while: the list is read every 20 s until its size
// stops growing (three equal readings in a row), at most 6 minutes. Copying earlier brought only a handful of chats.
export const settledChats = async (wbot: { getChats: () => Promise<any[]> }, opts: { everyMs?: number; maxMs?: number; stableReads?: number } = {}): Promise<any[]> => {
  const everyMs = opts.everyMs ?? 20000;
  const maxMs = opts.maxMs ?? 6 * 60 * 1000;
  const stableReads = opts.stableReads ?? 3;
  const started = Date.now();
  let chats: any[] = await withTimeout(wbot.getChats(), 9 * 60 * 1000);
  let stable = 0;
  while (Date.now() - started < maxMs && stable < stableReads - 1) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(everyMs);
    // eslint-disable-next-line no-await-in-loop
    const again: any[] = await withTimeout(wbot.getChats(), 9 * 60 * 1000);
    stable = again.length > chats.length ? 0 : stable + 1;
    chats = again;
  }
  return chats;
};

// runs `work` over the items with at most `limit` running at the same time
export const eachLimited = async <T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> => {
  let next = 0;
  const runner = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
};


// The periodic check of a QR Code number brings a chat as NEW only when its latest message is newer than what is stored (or, with nothing
// stored, newer than the copy of the phone's history). Before the copy nothing is "behind": the copy brings it, silently, as history.
export const chatBehind = (chatTimeMs: number, copiedAtMs: number | null, lastStoredMs: number | null): boolean => {
  if (!chatTimeMs || copiedAtMs === null) return false;
  return chatTimeMs > (lastStoredMs !== null ? lastStoredMs : copiedAtMs) + 5000;
};

// States WhatsApp Web goes through for a moment while it syncs or the phone's network blinks (not a real disconnection)
const TRANSIENT_STATES = new Set(["OPENING", "PAIRING", "TIMEOUT"]);
export const isTransientState = (state: string): boolean => TRANSIENT_STATES.has(String(state));

// After a passing state, what goes to the database when the page is asked again: CONNECTED when it says so; the state it still reports; when it
// does not answer, the state seen before, except during the first sync (a busy page is slow, the heartbeat decides then); nothing otherwise
export const stateToWrite = (seen: string, nowState: string | null, inGrace: boolean): string | null => {
  if (nowState === "CONNECTED") return "CONNECTED";
  if (nowState) return nowState;
  return inGrace ? null : seen;
};
