import CommercialGrade from "../models/CommercialGrade";
import Course from "../models/Course";
import User from "../models/User";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { getAppTz } from "../helpers/AppTime";
import { chooseGrade } from "../services/CommercialServices/GradeChoice";
import { frontBase, notify } from "../services/MailServices/Notify";
import { readiness } from "../services/SystemServices/Readiness";
import { logger } from "../utils/logger";

// One e-mail a day, in the morning of the company's time zone, with what is still open in the system: the items of Configurações → Prontidão that
// are not done, plus the courses that have no grade. It goes to the administrators, carries no data of students or leads (only names of connections,
// courses and the team) and is not sent when nothing is open. Turn it off with the setting pending_digest_enabled = "false".
export interface DigestItem { level: "required" | "recommended"; label: string; detail: string; where: string }

const SEND_HOUR = 8;
const MAX_COURSES_SHOWN = 12;

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// the courses of the catalogue that have no matrix to send (the agent sends the grade of the course of every lead)
export const coursesWithoutGrade = async (): Promise<string[]> => {
  const catalogue = await Course.findAll({ where: { active: true } as any, attributes: ["id", "name", "modality"], order: [["name", "ASC"]] });
  const grades = await CommercialGrade.findAll({ attributes: ["id", "courseName", "modality", "curriculumTerm"] });
  return catalogue.filter(c => !chooseGrade(grades as any[], c, null).grade).map(c => c.name);
};

export const collectPending = async (): Promise<DigestItem[]> => {
  const items: DigestItem[] = (await readiness()).filter(i => !i.ok).map(i => ({ level: i.level, label: i.label, detail: i.detail, where: i.where }));
  try {
    const missing = await coursesWithoutGrade();
    if (missing.length) {
      const shown = missing.slice(0, MAX_COURSES_SHOWN).join(", ");
      items.push({ level: "recommended", label: "Cursos sem grade", detail: `${missing.length} curso(s) sem grade (o agente não consegue enviá-la): ${shown}${missing.length > MAX_COURSES_SHOWN ? ` e mais ${missing.length - MAX_COURSES_SHOWN}` : ""}.`, where: "Grades" });
    }
  } catch (err) {
    logger.warn(`Pending digest: courses without grade not read: ${err}`);
  }
  // what the daily review of the AI found repeating in the conversations of each consultant (only codes and team names)
  try {
    const { recentCoaching } = await import("../services/AnalyticsServices/ConsultantReview");
    const { visibleConsultantIds } = await import("../services/AnalyticsServices/AnalyticsService");
    const { configOf } = await import("../services/CopilotServices/Settings");
    const labels = new Map((await configOf()).steps.map((st: any) => [st.key, st.label]));
    const ids = await visibleConsultantIds({ id: 0, profile: "admin", role: "admin" });
    const people = await User.findAll({ where: { id: ids } as any, attributes: ["id", "name"] });
    const list = await recentCoaching(people.map(u => ({ id: u.id, name: u.name })), k => String(labels.get(k) || k));
    if (list.length) {
      items.push({ level: "recommended", label: "Treinamento sugerido", detail: list.slice(0, 6).map(c => `${c.name}: ${c.items[0].text.charAt(0).toLowerCase()}${c.items[0].text.slice(1)}`).join("; ") + (list.length > 6 ? ` e mais ${list.length - 6}` : "") + ".", where: "Estatísticas" });
    }
  } catch (err) {
    logger.warn(`Pending digest: training suggestions not read: ${err}`);
  }
  // the AI budget of the month typed in Custos: from 80% it goes to the daily e-mail
  try {
    const { monthBudget } = await import("../services/AiServices/RealCosts");
    const budget = await monthBudget();
    if (budget && budget.warn) {
      items.push({ level: budget.pct >= 100 ? "required" : "recommended", label: "Orçamento da IA", detail: `${Math.round(budget.pct)}% do orçamento do mês usado (US$ ${budget.spent.toFixed(2)} de US$ ${budget.limit.toFixed(2)}, ${budget.source === "real" ? "valor cobrado pela OpenAI" : "estimado pelo sistema"}).`, where: "Configurações, Custos" });
    }
  } catch (err) {
    logger.warn(`Pending digest: AI budget not read: ${err}`);
  }
  return items;
};

// pure: the subject and the two bodies (nothing to say = null, so no e-mail goes out)
export const formatDigest = (items: DigestItem[], link: string): { subject: string; text: string; html: string } | null => {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => (a.level === b.level ? 0 : a.level === "required" ? -1 : 1));
  const required = sorted.filter(i => i.level === "required").length;
  const subject = `Pendências do sistema: ${items.length} em aberto${required ? ` (${required} obrigatória${required > 1 ? "s" : ""})` : ""}`;
  const tag = (i: DigestItem) => (i.level === "required" ? "Obrigatório" : "Recomendado");
  const text = [
    "O que ainda está em aberto no sistema:",
    "",
    ...sorted.map(i => `- [${tag(i)}] ${i.label}: ${i.detail} Onde resolver: ${i.where}.`),
    "",
    `Abra a Prontidão: ${link}`
  ].join("\n");
  const html = `<p>O que ainda está em aberto no sistema:</p><ul>${sorted
    .map(i => `<li><strong>${escapeHtml(i.label)}</strong> (${tag(i)}): ${escapeHtml(i.detail)} <em>Onde resolver: ${escapeHtml(i.where)}.</em></li>`)
    .join("")}</ul><p><a href="${link}">Abrir a Prontidão</a></p>`;
  return { subject, text, html };
};

export const sendDigest = async (): Promise<boolean> => {
  const body = formatDigest(await collectPending(), `${frontBase()}/configuracoes`);
  if (!body) return false;
  const admins = await User.findAll({ where: { profile: "admin" } as any, attributes: ["email"] });
  admins.forEach(a => notify(a.email, body, "Pending digest"));
  return admins.length > 0;
};

const tick = async (): Promise<void> => {
  try {
    if ((await getSetting("pending_digest_enabled", "true")) === "false") return;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const part = (t: string) => (parts.find(p => p.type === t) || { value: "" }).value;
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    // once a day, from the morning on; the date is saved after it was tried, so a restart (a deploy) does not send it twice
    if (Number(part("hour")) < SEND_HOUR || (await getSetting("pending_digest_last", "")) === today) return;
    await setSetting("pending_digest_last", today);
    await sendDigest();
  } catch (err) {
    logger.warn(`Pending digest failed: ${err}`);
  }
};

export const startPendingDigest = (): void => {
  setInterval(tick, Number(process.env.PENDING_DIGEST_MS) || 30 * 60000);
};
