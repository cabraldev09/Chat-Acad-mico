// The avatar of a person without a photo: two initials in a color that is always the same for that person (list, header, notification)
const COLORS = ["#0b4279", "#0f766e", "#7c3aed", "#b45309", "#be123c", "#0369a1", "#4d7c0f", "#a21caf"];

export const initialsOf = (name) => {
  const words = String(name || "").replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
};

export const colorOf = (key) => COLORS[[...String(key || "")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % COLORS.length];
