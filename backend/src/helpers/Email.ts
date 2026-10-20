// An e-mail address is checked in linear time and with a limit of size: a pattern like /^\S+@\S+\.\S+$/ takes seconds on a long text of dots
// (quadratic backtracking), and a public form or an automation reads text the person wrote.
export const EMAIL_MAX = 254;

export const isEmail = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < 5 || v.length > EMAIL_MAX) return false;
  const at = v.indexOf("@");
  if (at < 1 || at !== v.lastIndexOf("@") || at > 64) return false;
  const domain = v.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  if (dot < 1 || dot === domain.length - 1) return false;
  // no spaces, no control characters, no "@" in the pieces
  for (let i = 0; i < v.length; i += 1) {
    const c = v.charCodeAt(i);
    if (c <= 32 || c === 127) return false;
  }
  return true;
};
