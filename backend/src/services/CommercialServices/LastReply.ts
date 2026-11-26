const plain = (v: string): string => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

type Entry = { role: string; content?: string | null };

// The agent's whole last reply, all its bubbles. "Nessa área" refers to the bubble that named the area, not only to the last one
// ("Qual deles te interessa?"). The person may write while the bubbles are still going out: their message is then stored between
// them (A1, the person, A2, A3), and it is skipped so the reply stays whole.
export const lastReplyOf = (history: Entry[], current: string): string => {
  const now = plain(current);
  const parts: string[] = [];
  let skipped = false;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const h = history[i];
    if (h.role === "assistant") { parts.unshift(String(h.content || "")); continue; }
    if (!skipped && parts.length && now && plain(String(h.content || "")) === now) { skipped = true; continue; }
    // messages of the person after the reply (the ones being answered now) come before it when read from the end
    if (parts.length) break;
  }
  return parts.join("\n");
};
