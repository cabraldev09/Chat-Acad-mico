// The spreadsheet of Matrículas realizadas, built in the browser. The name and the RGM of the student only go to the administration:
// any other profile receives the identifier of the lead (the same number the CRM shows), so the file can be checked against the system
// without carrying personal data out of it.
const cell = (v) => {
  const s = String(v === null || v === undefined ? "" : v);
  // a cell that starts like a formula is read as text by Excel (no formula runs when the file is opened)
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const enrollmentsCsv = (rows, { full = false } = {}) => {
  const who = full ? ["Aluno", "RGM"] : ["Lead"];
  const head = [...who, "Curso", "Polo", "Consultor", "Data", "Hora", "Dentro da meta", "Meta", "Print anexado"];
  const lines = (Array.isArray(rows) ? rows : []).map((r) => {
    const d = new Date(r.at);
    const id = full ? [r.name || "", r.rgm || ""] : [r.leadId ? `#${r.leadId}` : ""];
    return [...id, r.course || "", r.polo || "", r.owner || "", d.toLocaleDateString("pt-BR"), d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), r.inGoal ? "Sim" : "Não", r.goal || "", r.proofId ? "Sim" : "Não"];
  });
  return [head, ...lines].map((l) => l.map(cell).join(";")).join("\n");
};
