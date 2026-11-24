import User from "../../models/User";
import { touchAnalytics } from "./Realtime";

// Who has the system open right now: one count of open connections (tabs) per person, kept in memory by the socket. When the last tab
// of a person closes, they left: "Equipe agora" shows them offline at once instead of waiting for the 5 minutes of the last request.
const open = new Map<number, number>();
const leftAt = new Map<number, number>();

export const socketArrived = (userId: number): void => {
  open.set(userId, (open.get(userId) || 0) + 1);
  leftAt.delete(userId);
  User.update({ lastSeenAt: new Date() } as any, { where: { id: userId }, silent: true } as any).catch(() => undefined);
  touchAnalytics(userId);
};

export const socketLeft = (userId: number): void => {
  const n = (open.get(userId) || 1) - 1;
  if (n > 0) {
    open.set(userId, n);
    return;
  }
  open.delete(userId);
  leftAt.set(userId, Date.now());
  touchAnalytics(userId);
};

// online: a tab open now, or a request in the last minutes that came after the last tab closed
export const isOnline = (userId: number, lastSeenAt: Date | null, now: number = Date.now(), windowMs = 5 * 60000): boolean => {
  if ((open.get(userId) || 0) > 0) return true;
  if (!lastSeenAt || now - lastSeenAt.getTime() > windowMs) return false;
  const left = leftAt.get(userId);
  return !left || lastSeenAt.getTime() > left;
};
