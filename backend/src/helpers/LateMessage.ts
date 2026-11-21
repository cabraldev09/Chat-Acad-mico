// A message that arrives this late was sent a while ago (the provider delivered it again after a failure): it is saved in its place, but
// nobody answers it as if it had just been written
export const LATE_MS = 10 * 60000;
export const isLate = (sentAt: Date | undefined, now = Date.now()): boolean => !!sentAt && !Number.isNaN(sentAt.getTime()) && now - sentAt.getTime() > LATE_MS;
