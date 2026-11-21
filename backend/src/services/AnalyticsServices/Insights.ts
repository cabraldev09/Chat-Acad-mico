import { rows, VALID_TICKET, visibleConsultantIds } from "./AnalyticsService";
import { isManagerRole, roleOf } from "../../helpers/Roles";
import { logger } from "../../utils/logger";
import { getAppTz } from "../../helpers/AppTime";
import { FEE_PENDING_TAG } from "../PaymentServices/FeeTags";
import { DOCS_PENDING_LABEL } from "../CrmServices/Documents";

// Insights: short sentences read from the data the system already keeps (no AI, nothing invented), each with where to act.
// The management reads them for the consultants it may see; a consultant reads them about their own leads and conversations.
export interface Insight { key: string; tone: "danger" | "warn" | "good" | "info"; title: string; detail: string; link: string }

const ONLINE_MS = 5 * 60000;
const DAY = 86400000;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const hoursText = (h: number) => (h < 24 ? plural(Math.max(1, Math.round(h)), "hora", "horas") : plural(Math.round(h / 24), "dia", "dias"));

// Who is using the system now (a request in the last 5 minutes) and when each person last used it
export const teamOnline = async (user: any, now: Date = new Date()) => {
  if (!isManagerRole(roleOf(user))) return [];
  const list = await rows(`SELECT u.id, u.name, u.role, u.profile, u.lastSeenAt FROM Users u ORDER BY u.name`, {});
  return list
    .map(u => {
      const seen = u.lastSeenAt ? new Date(u.lastSeenAt) : null;
      return { id: Number(u.id), name: String(u.name || ""), role: u.profile === "admin" ? "admin" : String(u.role || "consultor"), online: !!seen && now.getTime() - seen.getTime() <= ONLINE_MS, lastSeenAt: seen ? seen.toISOString() : null };
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeenAt || "").localeCompare(a.lastSeenAt || "") || a.name.localeCompare(b.name));
};

// one block that fails leaves only that insight out; the others still come
const safe = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
  try { return await fn(); } catch (err) { logger.warn({ err: String((err as any)?.message || err), name }, "insight failed"); return null; }
};

// selfOnly: the person's own leads and conversations, even for a manager (the "Meu desempenho" screen)
export const insightsFor = async (user: any, now: Date = new Date(), opts: { selfOnly?: boolean } = {}): Promise<Insight[]> => {
  const manager = !opts.selfOnly && isManagerRole(roleOf(user));
  const ids = manager ? await visibleConsultantIds(user) : [Number(user.id)];
  if (!ids.length) return [];
  const rep = { ids, now, hourAgo: new Date(now.getTime() - 3600000), threeDays: new Date(now.getTime() - 3 * DAY), weekAgo: new Date(now.getTime() - 7 * DAY), twoWeeks: new Date(now.getTime() - 14 * DAY), month: new Date(now.getTime() - 30 * DAY) };
  const owner = manager ? "(l.ownerId IN (:ids) OR l.ownerId IS NULL)" : "l.ownerId IN (:ids)";
  const open = `l.isHistorical = false AND EXISTS (SELECT 1 FROM LeadStages s WHERE s.id = l.stageId AND s.type = 'open')`;
  const out: Insight[] = [];

  await safe("firstContact", async () => {
    const [r] = await rows(`SELECT COUNT(*) AS n, MIN(l.createdAt) AS oldest FROM Leads l WHERE ${open} AND ${owner} AND l.firstContactAt IS NULL AND l.createdAt < :hourAgo`, rep);
    const n = Number(r?.n || 0);
    if (n) {
      const h = (now.getTime() - new Date(r.oldest).getTime()) / 3600000;
      out.push({ key: "first_contact", tone: "danger", title: `${plural(n, "lead espera", "leads esperam")} o primeiro contato`, detail: `O mais antigo chegou há ${hoursText(h)}. Quem responde primeiro matricula mais.`, link: "/crm" });
    }
  });

  await safe("pendingReply", async () => {
    const [r] = await rows(`SELECT COUNT(*) AS n FROM Tickets t WHERE t.userId IN (:ids) AND t.status = 'open' AND t.lastMessageFromMe = false AND t.updatedAt < :hourAgo AND ${VALID_TICKET}`, rep);
    const n = Number(r?.n || 0);
    if (n) out.push({ key: "pending_reply", tone: n >= 5 ? "danger" : "warn", title: `${plural(n, "conversa espera", "conversas esperam")} resposta há mais de 1 hora`, detail: "A última mensagem é do cliente. Responda antes que ele esfrie.", link: "/tickets" });
  });

  await safe("overdueTasks", async () => {
    const [r] = await rows(`SELECT COUNT(*) AS n FROM LeadTasks t WHERE t.doneAt IS NULL AND t.dueAt < :now AND ${manager ? "(t.userId IN (:ids) OR t.userId IS NULL)" : "t.userId IN (:ids)"}`, rep);
    const n = Number(r?.n || 0);
    if (n) out.push({ key: "tasks_overdue", tone: "warn", title: `${plural(n, "tarefa atrasada", "tarefas atrasadas")}`, detail: "Retornos combinados com o lead que passaram da data.", link: "/crm/tarefas" });
  });

  await safe("stale", async () => {
    const [r] = await rows(`SELECT COUNT(*) AS n FROM Leads l WHERE ${open} AND ${owner} AND COALESCE(l.lastContactAt, l.createdAt) < :threeDays`, rep);
    const n = Number(r?.n || 0);
    if (n) out.push({ key: "stale", tone: "warn", title: `${plural(n, "lead está esfriando", "leads estão esfriando")}`, detail: "Sem nenhum contato há mais de 3 dias. Uma mensagem curta de retomada costuma resolver.", link: "/crm?followUp=overdue" });
  });

  await safe("unassigned", async () => {
    if (!manager) return;
    const [r] = await rows(`SELECT COUNT(*) AS n FROM Leads l WHERE ${open} AND l.ownerId IS NULL`, rep);
    const n = Number(r?.n || 0);
    if (n) out.push({ key: "unassigned", tone: "warn", title: `${plural(n, "lead sem responsável", "leads sem responsável")}`, detail: "Ninguém está cuidando deles. Distribua para a equipe.", link: "/crm" });
  });

  await safe("tags", async () => {
    const list = await rows(`SELECT tg.id, tg.name, COUNT(DISTINCT l.id) AS n FROM Leads l JOIN LeadTags lt ON lt.leadId = l.id JOIN Tags tg ON tg.id = lt.tagId WHERE ${open} AND ${owner} AND tg.name IN (:tags) GROUP BY tg.id, tg.name`, { ...rep, tags: [FEE_PENDING_TAG.name, DOCS_PENDING_LABEL.name] });
    list.forEach(t => {
      const n = Number(t.n || 0);
      if (!n) return;
      const fee = t.name === FEE_PENDING_TAG.name;
      out.push({ key: fee ? "fee_pending" : "docs_pending", tone: "warn", title: fee ? `${plural(n, "matrícula com taxa", "matrículas com taxa")} pendente` : `${plural(n, "matrícula com documentos", "matrículas com documentos")} pendentes`, detail: fee ? "A taxa ainda não foi paga. Um lembrete hoje evita a perda da vaga." : "Faltam documentos para concluir. Peça o que falta pelo WhatsApp.", link: `/crm?tagId=${t.id}` });
    });
  });

  await safe("followUpReturn", async () => {
    const [r] = await rows(`SELECT COUNT(*) AS n FROM CurricularAnalyses a WHERE a.status = 'COMPLETED' AND a.enrollmentStatus = 'PENDING' AND a.followUpDueAt <= :now AND a.userId IN (:ids)`, rep);
    const n = Number(r?.n || 0);
    if (n) out.push({ key: "analysis_return", tone: "warn", title: `${plural(n, "análise curricular sem", "análises curriculares sem")} retorno`, detail: "Informe se o aluno se matriculou. Enquanto isso, novas análises ficam bloqueadas.", link: "/analise-curricular" });
  });

  await safe("offlineWithWork", async () => {
    if (!manager) return;
    const list = await rows(`SELECT u.id, u.name, u.lastSeenAt, COUNT(l.id) AS n FROM Users u JOIN Leads l ON l.ownerId = u.id WHERE u.id IN (:ids) AND ${open} AND l.firstContactAt IS NULL AND l.createdAt < :hourAgo GROUP BY u.id, u.name, u.lastSeenAt`, rep);
    const away = list.filter(u => !u.lastSeenAt || now.getTime() - new Date(u.lastSeenAt).getTime() > 2 * 3600000);
    if (away.length) {
      const names = away.slice(0, 3).map(u => String(u.name).split(" ")[0]).join(", ");
      out.push({ key: "away_with_leads", tone: "warn", title: `${plural(away.length, "consultor fora do sistema", "consultores fora do sistema")} com leads esperando`, detail: `${names}${away.length > 3 ? " e outros" : ""}: sem acesso há mais de 2 horas. Vale redistribuir.`, link: "/crm" });
    }
  });

  await safe("enrollmentsTrend", async () => {
    const [r] = await rows(`SELECT SUM(CASE WHEN l.wonAt >= :weekAgo THEN 1 ELSE 0 END) AS now7, SUM(CASE WHEN l.wonAt >= :twoWeeks AND l.wonAt < :weekAgo THEN 1 ELSE 0 END) AS prev7 FROM Leads l WHERE l.isHistorical = false AND l.wonAt >= :twoWeeks AND ${owner}`, rep);
    const a = Number(r?.now7 || 0);
    const b = Number(r?.prev7 || 0);
    if (!a && !b) return;
    if (a > b) out.push({ key: "enroll_up", tone: "good", title: `${plural(a, "matrícula", "matrículas")} nos últimos 7 dias`, detail: b ? `${a - b} a mais que nos 7 dias anteriores (${b}).` : "Nenhuma nos 7 dias anteriores.", link: "/estatisticas" });
    else if (a < b) out.push({ key: "enroll_down", tone: "warn", title: `Matrículas caíram: ${a} nos últimos 7 dias`, detail: `Eram ${b} nos 7 dias anteriores. Veja onde os leads estão parando.`, link: "/estatisticas" });
    else out.push({ key: "enroll_same", tone: "info", title: `${plural(a, "matrícula", "matrículas")} nos últimos 7 dias`, detail: "O mesmo número dos 7 dias anteriores.", link: "/estatisticas" });
  });

  await safe("bestSource", async () => {
    const list = await rows(`SELECT COALESCE(l.source, 'Outro') AS name, COUNT(*) AS leads, SUM(CASE WHEN l.wonAt IS NOT NULL THEN 1 ELSE 0 END) AS won FROM Leads l WHERE l.isHistorical = false AND l.createdAt >= :month AND ${owner} GROUP BY COALESCE(l.source, 'Outro')`, rep);
    const ranked = list.map(s => ({ name: String(s.name), leads: Number(s.leads), won: Number(s.won) })).filter(s => s.leads >= 5).sort((x, y) => y.won / y.leads - x.won / x.leads);
    if (ranked.length >= 2 && ranked[0].won > 0) {
      const best = ranked[0];
      out.push({ key: "best_source", tone: "info", title: `${best.name} é o canal que mais converte`, detail: `${best.won} de ${best.leads} leads dos últimos 30 dias se matricularam (${Math.round((best.won / best.leads) * 100)}%).`, link: "/estatisticas/captacao" });
    }
  });

  await safe("topCourse", async () => {
    const [top] = await rows(`SELECT c.name, COUNT(*) AS leads, SUM(CASE WHEN l.wonAt IS NOT NULL THEN 1 ELSE 0 END) AS won FROM Leads l JOIN Courses c ON c.id = l.courseId WHERE l.isHistorical = false AND l.createdAt >= :month AND ${owner} GROUP BY c.name ORDER BY COUNT(*) DESC LIMIT 1`, rep);
    if (top && Number(top.leads) >= 3) out.push({ key: "top_course", tone: "info", title: `${top.name} é o curso mais procurado`, detail: `${plural(Number(top.leads), "lead", "leads")} nos últimos 30 dias e ${plural(Number(top.won), "matrícula", "matrículas")}.`, link: "/estatisticas/captacao" });
  });

  await safe("peakHour", async () => {
    const list = await rows(`SELECT l.createdAt AS at FROM Leads l WHERE l.isHistorical = false AND l.createdAt >= :month AND ${owner}`, rep);
    if (list.length < 10) return;
    const hours = new Array(24).fill(0);
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: getAppTz(), hour: "2-digit", hour12: false });
    list.forEach(r => { hours[Number(fmt.format(new Date(r.at))) % 24] += 1; });
    const h = hours.indexOf(Math.max(...hours));
    out.push({ key: "peak_hour", tone: "info", title: `Mais leads chegam entre ${h}h e ${(h + 1) % 24}h`, detail: `${Math.round((hours[h] / list.length) * 100)}% dos leads dos últimos 30 dias. Tenha alguém atendendo nesse horário.`, link: "/estatisticas/captacao" });
  });

  const order = { danger: 0, warn: 1, good: 2, info: 3 } as const;
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 10);
};
