// "Rodízio" of reactions: the six emojis offered when reacting are the ones this person uses most
// (the usual six until there is use). Kept on this device.
const KEY = "emojiUsage";
export const DEFAULT_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (e) {
    return {};
  }
};

export const bumpEmoji = (emoji) => {
  if (!emoji) return;
  try {
    const all = read();
    const now = Date.now();
    const cur = all[emoji] || { n: 0, t: now };
    all[emoji] = { n: cur.n + 1, t: now };
    const keep = Object.entries(all).sort((a, b) => b[1].n - a[1].n).slice(0, 60);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch (e) {
    /* storage blocked: reactions just keep the usual six */
  }
};

// most used first (recent use breaks ties); completes with the usual ones up to `count`
export const topEmojis = (count = 6, base = DEFAULT_REACTIONS) => {
  const ranked = Object.entries(read())
    .sort((a, b) => b[1].n - a[1].n || b[1].t - a[1].t)
    .map(([e]) => e);
  const out = [];
  [...ranked, ...base].forEach((e) => {
    if (out.length < count && !out.includes(e)) out.push(e);
  });
  return out;
};
