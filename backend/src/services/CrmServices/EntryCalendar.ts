import { getSetting, setSetting } from "../../helpers/AppSettings";

// The entry calendar (CRM → Configurações → Calendário de entradas). Each class ("turma") of a period has the window in which the
// candidate enrolls, the last day to pay the boleto (the due date of the 1st monthly fee), the day the subjects open in the AVA and
// how many monthly fees the first semester has. The day of the enrollment decides the class; the proposal takes its dates from it.

export interface EntryTurma {
  key: string;
  term: string; // "2027/1"
  name: string; // "Fevereiro"
  from: string; // first day of enrollment, YYYY-MM-DD
  to: string; // last day of enrollment
  veteranosFrom?: string | null; // returning students start later
  boletoDeadline: string; // last day to pay the boleto = due date of the 1st monthly fee
  releaseDate?: string | null; // subjects released in the AVA until
  installments: number; // monthly fees of the first semester
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TERM = /^20\d{2}\/[12]$/;

// the 2027/1 calendar of the institution: one class per month, the semester ends in July
export const DEFAULT_CALENDAR: EntryTurma[] = [
  { key: "2027/1|Fevereiro", term: "2027/1", name: "Fevereiro", from: "2026-11-17", to: "2027-02-01", veteranosFrom: "2026-12-07", boletoDeadline: "2027-02-01", releaseDate: "2027-02-02", installments: 6 },
  { key: "2027/1|Março", term: "2027/1", name: "Março", from: "2027-02-03", to: "2027-03-01", veteranosFrom: null, boletoDeadline: "2027-03-01", releaseDate: "2027-03-02", installments: 5 },
  { key: "2027/1|Abril", term: "2027/1", name: "Abril", from: "2027-03-03", to: "2027-04-01", veteranosFrom: null, boletoDeadline: "2027-04-01", releaseDate: "2027-04-02", installments: 4 },
  { key: "2027/1|Maio", term: "2027/1", name: "Maio", from: "2027-04-03", to: "2027-05-03", veteranosFrom: null, boletoDeadline: "2027-05-03", releaseDate: "2027-05-04", installments: 3 }
];

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const day = (v: unknown): string | null => (DAY.test(String(v ?? "")) ? String(v) : null);

// keeps only complete classes, ordered by the boleto deadline (the order the team works by)
export const normalizeCalendar = (raw: unknown): EntryTurma[] => {
  const list = Array.isArray(raw) ? raw : [];
  const out: EntryTurma[] = [];
  const seen = new Set<string>();
  list.slice(0, 48).forEach((r: any) => {
    const term = clean(r?.term, 7);
    const name = clean(r?.name, 40);
    const from = day(r?.from);
    const to = day(r?.to);
    const boletoDeadline = day(r?.boletoDeadline);
    const installments = Math.round(Number(r?.installments));
    if (!TERM.test(term) || !name || !from || !to || !boletoDeadline || from > to) return;
    if (!(installments >= 1 && installments <= 12)) return;
    const key = `${term}|${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, term, name, from, to, veteranosFrom: day(r?.veteranosFrom), boletoDeadline, releaseDate: day(r?.releaseDate), installments });
  });
  return out.sort((a, b) => a.boletoDeadline.localeCompare(b.boletoDeadline) || a.from.localeCompare(b.from));
};

// the class of a day of enrollment: the one whose window holds it, else the next one to open; none after the last
export const turmaFor = (calendar: EntryTurma[], today: string): EntryTurma | null => {
  const byStart = [...calendar].sort((a, b) => a.from.localeCompare(b.from));
  return byStart.find(t => t.from <= today && today <= t.to) || byStart.find(t => t.from > today) || null;
};

const pad = (n: number) => String(n).padStart(2, "0");

// the 1st monthly fee is due on the boleto deadline; the 2nd on the contracted day of the following month
export const dueDatesOf = (turma: EntryTurma, dueDay: number): { firstDueDate: string; secondDueDate: string } => {
  const [y, m] = turma.boletoDeadline.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const d = Math.min(28, Math.max(1, Math.round(dueDay || 10)));
  return { firstDueDate: turma.boletoDeadline, secondDueDate: `${ny}-${pad(nm)}-${pad(d)}` };
};

export const startOf = (turma: EntryTurma): { startYear: number; startSemester: 1 | 2 } => {
  const [y, s] = turma.term.split("/").map(Number);
  return { startYear: y, startSemester: (s === 1 ? 1 : 2) as 1 | 2 };
};

export const getEntryCalendar = async (): Promise<EntryTurma[]> => {
  const stored = await getSetting("crm_entry_calendar", "");
  if (!stored) return DEFAULT_CALENDAR;
  try {
    return normalizeCalendar(JSON.parse(stored));
  } catch (e) {
    return DEFAULT_CALENDAR;
  }
};

export const saveEntryCalendar = async (raw: unknown): Promise<EntryTurma[]> => {
  const list = normalizeCalendar(raw);
  await setSetting("crm_entry_calendar", JSON.stringify(list));
  return list;
};

