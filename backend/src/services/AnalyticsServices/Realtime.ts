import { getIO } from "../../libs/socket";

// Something that counts for a person's numbers just happened: the open screens (theirs and the management's) read the numbers again.
// One signal per person per second at most; the signal carries no numbers, so nobody receives data through it (the screens read it
// from the API, which applies the permissions).
const timers = new Map<number, NodeJS.Timeout>();

export const touchAnalytics = (userId?: number | null): void => {
  if (!userId || timers.has(userId)) return;
  timers.set(userId, setTimeout(() => {
    timers.delete(userId);
    try { getIO().emit("analytics", { userId }); } catch (_) { /* the socket is not up (scripts, tests): nobody to tell */ }
  }, 800));
};
