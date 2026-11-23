// The formats of a course the system has, and how a text written another way is read as one of them.
export const MODALITIES = ["Presencial", "EAD", "Semipresencial", "Flex"];
export const normalizeModality = (v: any): string | null => {
  const t = String(v || "").trim();
  if (!t) return null;
  const hit = MODALITIES.find(m => m.toLowerCase() === t.toLowerCase().replace("semi presencial", "semipresencial"));
  if (hit) return hit;
  if (/semi/i.test(t)) return "Semipresencial";
  if (/dist|ead|online/i.test(t)) return "EAD";
  if (/presen/i.test(t)) return "Presencial";
  return t;
};

// The enrollments by format, under the names the system has. A text written another way in the catalogue ("ead digital", "semi") is read
// as its format; what is none of them is counted as "Não informado", never shown as a format that does not exist.
export const modalityTotals = (rows: Array<{ name: any; total: any }>): Array<{ name: string; total: number }> => {
  const sums = new Map<string, number>();
  rows.forEach(r => {
    const read = normalizeModality(r.name);
    const name = read && MODALITIES.includes(read) ? read : "Não informado";
    sums.set(name, (sums.get(name) || 0) + (Number(r.total) || 0));
  });
  return [...sums.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => (a.name === "Não informado" ? 1 : b.name === "Não informado" ? -1 : b.total - a.total));
};
