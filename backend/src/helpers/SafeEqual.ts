import { createHash, timingSafeEqual } from "crypto";

// Compares two secrets in constant time (the time of "!==" tells how many leading characters were right) and never accepts an empty one.
export const safeEqual = (a: unknown, b: unknown): boolean => {
  const x = String(a ?? "");
  const y = String(b ?? "");
  if (!x || !y) return false;
  return timingSafeEqual(createHash("sha256").update(x).digest(), createHash("sha256").update(y).digest());
};
