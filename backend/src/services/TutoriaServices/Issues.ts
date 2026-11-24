import { Op, QueryTypes } from "sequelize";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { getSetting, setSetting } from "../../helpers/AppSettings";
import { todayInAppTz } from "../../helpers/AppTime";
import { portable } from "../../helpers/sqlDialect";
import AiAgent from "../../models/AiAgent";
import Ticket from "../../models/Ticket";
import TutoringIssue from "../../models/TutoringIssue";
import User from "../../models/User";
import { logger } from "../../utils/logger";
import { scrub } from "../AnalyticsServices/ConsultantReview";
import { notify } from "../NotificationServices/Notify";
import { TUTORIA_SEGMENTS } from "../ChannelServices/ConnectionTeam";

// THE AUDIT OF THE TUTORING. The AI does not talk to the students and does not sell: it follows the tutors' conversations, by itself and
// cheaply, and tells the management of the academic side what was left pending (a case opened in the institution's system, a return the
// tutor promised, a document asked, an access problem with no solution), with an idea of what to do. The management records the protocol
// number and its name and marks what is resolved; the tutor does not see this. What goes to the model is the masked text of the last
// messages (personal data, protocol numbers and names become tags); what is kept is a short summary. The daily spending caps apply.

export const KINDS: Record<string, string> = {
  protocolo: "Chamado ou protocolo aberto",
  retorno: "Retorno prometido",
  documento: "Documento pedido",
  acesso: "Acesso ou plataforma",
  outro: "Outro"
};
export const STATUSES = ["aberta", "registrada", "resolvida", "dispensada"];
const OPEN = ["aberta", "registrada"];

const MAX_MESSAGES = 30;
const QUIET_MINUTES = 30;
const LOOKBACK_DAYS = 14;

// the cheapest model of the provider of the agent whose key is used (the audit never needs a big model)
const CHEAP: Record<string, string> = { anthropic: "claude-haiku-5-5", openai: "gpt-4o-mini" };

export const SYSTEM = [
  "Você audita, para a coordenação acadêmica de uma faculdade EAD, a conversa de um tutor com um aluno já matriculado.",
  "Você não conversa com ninguém e não vende nada. Dados pessoais e números foram trocados por marcadores como [NOME] e [NUM].",
  "Encontre o que ficou PENDENTE: o tutor abriu um chamado, CAA ou protocolo no sistema da instituição; prometeu verificar e dar retorno;",
  "pediu um documento ao aluno; o aluno relatou problema de acesso, nota, prova ou plataforma que ainda não foi resolvido.",
  `Tipos válidos: ${Object.keys(KINDS).join(", ")}.`,
  "Você recebe também as pendências já abertas desta conversa, com o número de cada uma. Não repita uma que já existe;",
  "marque como resolvida a que a conversa mostra resolvida.",
  "Responda só com JSON válido, sem markdown, exatamente no formato",
  "{\"pendencias\":[{\"tipo\":string,\"resumo\":string}],\"resolvidas\":number[],\"ideia\":string}.",
  "resumo: até 140 caracteres, sem nomes nem números, dizendo o que está pendente e com quem está a próxima ação.",
  "ideia: uma frase curta com uma sugestão prática para a coordenação (ou vazio). Não invente nada que não esteja na conversa."
].join(" ");

export interface AuditAnswer { pendencias: Array<{ tipo: string; resumo: string }>; resolvidas: number[]; ideia: string }

// strict: unknown kinds become "outro", the summaries are masked and cut, only the ids of open items of this conversation are accepted
export const parseAuditAnswer = (text: string, openIds: number[]): AuditAnswer => {
  let parsed: any;
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try { parsed = JSON.parse(raw); } catch { throw new Error("ERR_AI_BAD_ANSWER"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("ERR_AI_BAD_ANSWER");
  const seen = new Set<string>();
  const pendencias = (Array.isArray(parsed.pendencias) ? parsed.pendencias : [])
    .map((p: any) => ({ tipo: KINDS[String(p?.tipo)] ? String(p.tipo) : "outro", resumo: scrub(String(p?.resumo || "")).replace(/\s+/g, " ").trim().slice(0, 140) }))
    .filter((p: any) => p.resumo.length >= 8 && !seen.has(p.resumo.toLowerCase()) && seen.add(p.resumo.toLowerCase()))
    .slice(0, 4);
  const open = new Set(openIds);
  const resolvidas = [...new Set((Array.isArray(parsed.resolvidas) ? parsed.resolvidas : []).map(Number).filter((n: number) => open.has(n)))] as number[];
  const ideia = scrub(typeof parsed.ideia === "string" ? parsed.ideia : "").replace(/\s+/g, " ").trim().slice(0, 200);
  return { pendencias, resolvidas, ideia };
};

const rows = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

// who manages the academic side: the administration and the coordination of the academic area (else every coordination)
export const academicManagerIds = async (): Promise<number[]> => {
  const users = await User.findAll({ where: { [Op.or]: [{ profile: "admin" }, { role: "coordenacao" }] } as any, attributes: ["id", "profile", "role", "coordArea"] });
  const academic = users.filter(u => u.profile === "admin" || (u.role === "coordenacao" && (u as any).coordArea === "academica"));
  const coordinationOfAcademic = academic.some(u => u.role === "coordenacao");
  return (coordinationOfAcademic ? academic : users).map(u => u.id);
};

// the tutoring conversations with something new to read: the tutor wrote in them, the last message is not read yet and the conversation
// has been quiet for half an hour (the exchange settled); the oldest first
export const candidates = async (limit: number): Promise<any[]> =>
  rows(`SELECT t.id, t.contactId, t.userId, t.lastMessageId, t.institutionId FROM Tickets t
    WHERE t.segment IN (:segments) AND t.isGroup = false AND t.isHistorical = false AND t.lastMessageId IS NOT NULL
      AND (t.tutoringAuditedMessageId IS NULL OR t.tutoringAuditedMessageId <> t.lastMessageId)
      AND t.lastMessageAt < :quiet AND t.lastMessageAt > :since
      AND EXISTS (SELECT 1 FROM Messages m WHERE m.ticketId = t.id AND m.fromMe = true)
    ORDER BY t.lastMessageAt ASC LIMIT :limit`,
  { segments: TUTORIA_SEGMENTS, quiet: new Date(Date.now() - QUIET_MINUTES * 60000), since: new Date(Date.now() - LOOKBACK_DAYS * 864e5), limit });

const auditorAccess = async (): Promise<{ agent: any; apiKey: string } | null> => {
  const agents = await AiAgent.findAll({ order: [["active", "DESC"], ["id", "ASC"]] });
  const { resolveKey } = await import("../AiServices/RunAiAgent");
  for (const agent of agents) {
    // eslint-disable-next-line no-await-in-loop
    const apiKey = await resolveKey(agent);
    if (!apiKey) continue;
    const provider = agent.provider === "openai" ? "openai" : "anthropic";
    // the same key and budget of that agent, with the cheapest model of its provider
    return { agent: { id: agent.id, provider, model: CHEAP[provider], dailyTokenCap: agent.dailyTokenCap, institutionId: agent.institutionId }, apiKey };
  }
  return null;
};

export interface AuditRun { read: number; found: number; resolved: number; skipped: number; failed: number; stoppedByBudget: boolean; reason?: string }

const markRead = (ticketId: number, lastMessageId: string): Promise<any> =>
  Ticket.update({ tutoringAuditedMessageId: lastMessageId } as any, { where: { id: ticketId }, silent: true } as any);

// one reading: what was left pending is created (and the management is told), what the conversation shows solved is closed
export const auditTicket = async (c: any, access: { agent: any; apiKey: string }, run: AuditRun): Promise<void> => {
  const ticketId = Number(c.id);
  const msgs = (await rows(`SELECT m.id, m.body, m.fromMe FROM Messages m WHERE m.ticketId = :ticketId AND m.isDeleted = false
      AND m.body IS NOT NULL AND m.body <> '' AND (m.mediaType IS NULL OR m.mediaType IN ('chat', 'text', 'conversation', 'extendedTextMessage'))
      ORDER BY m.createdAt DESC LIMIT ${MAX_MESSAGES}`, { ticketId })).reverse();
  if (msgs.length < 2 || !msgs.some(m => m.fromMe)) {
    run.skipped += 1;
    await markRead(ticketId, c.lastMessageId);
    return;
  }
  const [who] = await rows(`SELECT ct.name AS contact, u.name AS tutor, l.id AS leadId, l.name AS lead, l.onboardingTutorId AS leadTutor FROM Tickets t JOIN Contacts ct ON ct.id = t.contactId
      LEFT JOIN Users u ON u.id = t.userId LEFT JOIN Leads l ON l.contactId = t.contactId WHERE t.id = :ticketId LIMIT 1`, { ticketId });
  const names = [who?.contact, who?.tutor, who?.lead].filter(Boolean);
  const open = await TutoringIssue.findAll({ where: { ticketId, status: { [Op.in]: OPEN } } as any, order: [["id", "ASC"]] });
  const user = [
    open.length ? `Pendências já abertas desta conversa:\n${open.map(i => `#${i.id} (${i.kind}) ${i.summary}`).join("\n")}` : "Nenhuma pendência aberta nesta conversa.",
    "",
    "Conversa:",
    msgs.map(m => `${m.fromMe ? "Tutor" : "Aluno"}: ${scrub(String(m.body || "").slice(0, 500), names)}`).join("\n")
  ].join("\n");
  const { askOnce } = await import("../AiServices/RunAiAgent");
  const answer = await askOnce(access.agent, access.apiKey, SYSTEM, user, 300, { kind: "reading", ticketId });
  const parsed = parseAuditAnswer(answer.text, open.map(i => i.id));
  const tokens = Number(answer.usage?.total_tokens || (answer.usage?.input_tokens || 0) + (answer.usage?.output_tokens || 0) || 0);
  const tutorId = Number(c.userId) || Number(who?.leadTutor) || null;
  const created: TutoringIssue[] = [];
  for (const p of parsed.pendencias) {
    // eslint-disable-next-line no-await-in-loop
    created.push(await TutoringIssue.create({
      ticketId, leadId: who?.leadId ? Number(who.leadId) : null, tutorId, institutionId: c.institutionId || null, kind: p.tipo, summary: p.resumo,
      idea: parsed.ideia || null, status: "aberta", source: "ia", detectedAt: new Date(), lastMessageId: c.lastMessageId, model: access.agent.model, tokens
    } as any));
  }
  if (parsed.resolvidas.length) {
    await TutoringIssue.update({ status: "resolvida", resolvedAt: new Date(), resolvedBy: null } as any, { where: { id: parsed.resolvidas, ticketId, status: { [Op.in]: OPEN } } as any });
  }
  await markRead(ticketId, c.lastMessageId);
  run.read += 1;
  run.found += created.length;
  run.resolved += parsed.resolvidas.length;
  if (created.length) {
    const first = String(who?.contact || "o aluno").trim().split(/\s+/)[0];
    await notify(await academicManagerIds(), {
      kind: "tutoring_issue",
      level: "warning",
      title: `Pendência na tutoria: ${first}${who?.tutor ? ` (tutor ${who.tutor})` : ""}`,
      body: created.map(i => `${KINDS[i.kind] || "Pendência"}: ${i.summary}`).join(" · ").slice(0, 380),
      link: "/meus-alunos?aba=pendencias",
      dedupeKey: `tutoring_issue:${created[0].id}`
    });
  }
};

// The round of the worker: at most N conversations a day (setting), stopping at the first budget refusal (the rest waits for tomorrow)
export const runTutoringAudit = async (opts: { limit?: number; force?: boolean } = {}): Promise<AuditRun> => {
  const run: AuditRun = { read: 0, found: 0, resolved: 0, skipped: 0, failed: 0, stoppedByBudget: false };
  if (!opts.force && (await getSetting("tutoring_audit_enabled", "true")) !== "true") return { ...run, reason: "disabled" };
  const today = todayInAppTz();
  const perDay = Math.min(500, Math.max(1, Number(await getSetting("tutoring_audit_max_tickets", "40")) || 40));
  const usedToday = (await getSetting("tutoring_audit_day", "")) === today ? Number(await getSetting("tutoring_audit_count", "0")) || 0 : 0;
  const left = Math.max(0, Math.min(opts.limit ?? perDay, perDay - usedToday));
  if (!left) return { ...run, reason: "daily_limit" };
  const list = await candidates(left);
  if (!list.length) return run;
  const access = await auditorAccess();
  if (!access) return { ...run, reason: "no_api_key" };
  let spent = 0;
  for (const c of list) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await auditTicket(c, access, run);
      spent += 1;
    } catch (err) {
      const code = String((err as Error)?.message || "");
      if (/ERR_AI_TOKEN_CAP|ERR_AI_USD_CAP|ERR_AI_BUDGET|ERR_AI_RATE_REQUIRED/.test(code)) { run.stoppedByBudget = true; break; }
      run.failed += 1;
      spent += 1;
      logger.warn(`Auditoria da tutoria, conversa #${c.id}: ${code}`);
    }
  }
  await setSetting("tutoring_audit_day", today);
  await setSetting("tutoring_audit_count", String(usedToday + spent));
  return run;
};

// what the management sees: the open ones first, the newest first, with the student and the tutor
export const listIssues = async (filter: { status?: string; tutorId?: number | null } = {}) => {
  const where: any = {};
  if (filter.status === "abertas") where.status = { [Op.in]: OPEN };
  else if (filter.status && STATUSES.includes(filter.status)) where.status = filter.status;
  if (filter.tutorId) where.tutorId = filter.tutorId;
  const issues = await TutoringIssue.findAll({ where, order: [["detectedAt", "DESC"]], limit: 300 });
  const ticketIds = [...new Set(issues.map(i => i.ticketId).filter(Boolean))];
  const tutorIds = [...new Set(issues.map(i => i.tutorId).filter(Boolean))];
  const people = ticketIds.length ? await rows(`SELECT t.id, ct.name AS student FROM Tickets t JOIN Contacts ct ON ct.id = t.contactId WHERE t.id IN (:ids)`, { ids: ticketIds }) : [];
  const tutors = tutorIds.length ? await User.findAll({ where: { id: tutorIds }, attributes: ["id", "name"] }) : [];
  const studentOf = new Map(people.map(p => [Number(p.id), p.student]));
  const tutorOf = new Map(tutors.map(t => [t.id, t.name]));
  const counts = await rows(`SELECT status, COUNT(*) AS n FROM TutoringIssues GROUP BY status`, {});
  return {
    items: issues.map(i => ({
      id: i.id, ticketId: i.ticketId, leadId: i.leadId, kind: i.kind, kindLabel: KINDS[i.kind] || "Outro", summary: i.summary, idea: i.idea,
      protocolNumber: i.protocolNumber, protocolName: i.protocolName, status: i.status, source: i.source, detectedAt: i.detectedAt, resolvedAt: i.resolvedAt,
      student: i.ticketId ? studentOf.get(i.ticketId) || null : null, tutor: i.tutorId ? tutorOf.get(i.tutorId) || null : null
    })),
    counts: Object.fromEntries(STATUSES.map(s => [s, Number((counts.find(c => c.status === s) || {}).n || 0)]))
  };
};

const clip = (v: unknown, n: number): string | null => {
  const t = String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
  return t || null;
};

// the management writes one down by hand (a case the AI did not see)
export const createIssue = async (body: any, userId: number) => {
  const summary = clip(body?.summary, 280);
  if (!summary) throw new AppError("ERR_TUTORING_ISSUE_SUMMARY", 400);
  const ticketId = Number(body?.ticketId) || null;
  const ticket = ticketId ? await Ticket.findByPk(ticketId, { attributes: ["id", "userId", "segment", "institutionId"] }) : null;
  return TutoringIssue.create({
    ticketId: ticket ? ticket.id : null, tutorId: ticket?.userId || null, institutionId: ticket?.institutionId || null,
    kind: KINDS[String(body?.kind)] ? String(body.kind) : "protocolo", summary, protocolNumber: clip(body?.protocolNumber, 60), protocolName: clip(body?.protocolName, 160),
    status: body?.protocolNumber ? "registrada" : "aberta", source: "gestao", detectedAt: new Date()
  } as any);
};

// the protocol, its name and where it stands; a protocol written turns an open one into "registrada"
export const updateIssue = async (id: number, body: any, userId: number) => {
  const issue = await TutoringIssue.findByPk(id);
  if (!issue) return null;
  const patch: Record<string, unknown> = {};
  if (body?.protocolNumber !== undefined) patch.protocolNumber = clip(body.protocolNumber, 60);
  if (body?.protocolName !== undefined) patch.protocolName = clip(body.protocolName, 160);
  if (body?.status !== undefined) {
    if (!STATUSES.includes(String(body.status))) throw new AppError("ERR_TUTORING_ISSUE_STATUS", 400);
    patch.status = String(body.status);
    const closed = ["resolvida", "dispensada"].includes(String(body.status));
    patch.resolvedAt = closed ? new Date() : null;
    patch.resolvedBy = closed ? userId : null;
  } else if (patch.protocolNumber && issue.status === "aberta") patch.status = "registrada";
  issue.set(patch as any);
  await issue.save();
  return issue;
};

export const openCount = async (): Promise<number> => TutoringIssue.count({ where: { status: { [Op.in]: OPEN } } as any });
