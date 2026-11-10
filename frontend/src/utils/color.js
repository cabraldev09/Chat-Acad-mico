// "#0693E3" + 0.12 -> "rgba(6,147,227,0.12)": a soft tint of a colour for backgrounds and badges
export const tint = (hex, alpha = 0.12) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return `rgba(100,116,139,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

// readable text on a coloured chip (white on dark colours, dark on light ones)
export const onColor = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.68 ? "#0b1a2e" : "#fff";
};
