import { compare, genSaltSync, getRounds, hashSync } from "bcryptjs";

// Cost of the hash of a password. 8 (the old one) is checked in a few milliseconds by whoever steals the database; 12 is about sixteen times more work.
export const PASSWORD_COST = 12;
export const MIN_PASSWORD = 8;

// A real hash of a text nobody knows: a login with an e-mail that does not exist does the same work as one that does (the time of the answer does not say
// which addresses have an account).
let dummy: string | null = null;
export const burnPasswordTime = async (password: string): Promise<void> => {
  if (!dummy) dummy = hashSync(`nao-existe-${Math.random()}`, genSaltSync(PASSWORD_COST));
  await compare(String(password || ""), dummy).catch(() => false);
};

// the hash was made with a lower cost: it is made again at the next successful login
export const needsRehash = (hash: string | null | undefined): boolean => {
  try {
    return !!hash && getRounds(hash) < PASSWORD_COST;
  } catch (err) {
    return false;
  }
};
