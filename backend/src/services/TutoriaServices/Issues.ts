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

// THE PROTOCOL NUMBERS, found in code (no cost, before the model reads): a number of 6 to 20 digits right after a word of the institution's
// systems (protocolo, chamado, CAA, solicitação, requerimento, ticket). The model never sees the numbers (they are masked); what is found
// here is registered by itself, so the tutor does not need to type it. Dates are not protocols.
const PROTOCOL_RE = /\b(?:protocolo|chamado|caa|solicita[cç][aã]o|requerimento|ticket)\b[^0-9\n]{0,25}?(\d[\d.\-/]{4,26}\d)/gi;
const DATE_RE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
export const findProtocolNumbers = (texts: string[]): string[] => {
  const out: string[] = [];
  for (const text of texts) {
    for (const m of String(text || "").matchAll(PROTOCOL_RE)) {
      const raw = m[1];
      if (DATE_RE.test(raw)) continue;
      const digits = raw.replace(/\D/g, "");
      if (digits.length < 6 || digits.length > 20 || out.includes(digits)) continue;
      out.push(digits);
    }
  }
  return out.slice(0, 5);
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

// the numbers of protocols in the messages become registered protocols of the student (the tutor and the management see them; no notice:
// a registered protocol needs nothing now). Returns how many were new.
export const captureProtocols = async (
  at: { ticketId: number; leadId: number | null; tutorId: number | null; institutionId: number | null; lastMessageId?: string | null },
  msgs: Array<{ body?: string }>
): Promise<number> => {
  let n = 0;
  for (const number of findProtocolNumbers(msgs.map(m => String(m.body || "")))) {
    // eslint-disable-next-line no-await-in-loop
    const known = await TutoringIssue.findOne({ where: { protocolNumber: number, [Op.or]: [{ ticketId: at.ticketId }, ...(at.leadId ? [{ leadId: at.leadId }] : [])] } as any, attributes: ["id"] });
    if (known) continue;
    // eslint-disable-next-line no-await-in-loop
    await TutoringIssue.create({
      ticketId: at.ticketId, leadId: at.leadId, tutorId: at.tutorId, institutionId: at.institutionId, kind: "protocolo",
      summary: "Protocolo citado na conversa, registrado automaticamente.", protocolNumber: number, protocolName: "Citado na conversa",
      status: "registrada", source: "ia", detectedAt: new Date(), lastMessageId: at.lastMessageId || null
    } as any);
    n += 1;
  }
  return n;
};

// the management is told only what needs it: protocols registered with no news for N days (setting, 7 by default), once a day
export const remindStaleProtocols = async (): Promise<number> => {
  const days = Math.min(90, Math.max(1, Number(await getSetting("tutoring_protocol_stale_days", "7")) || 7));
  const stale = await TutoringIssue.count({ where: { status: "registrada", updatedAt: { [Op.lt]: new Date(Date.now() - days * 864e5) } } as any });
  if (!stale) return 0;
  await notify(await academicManagerIds(), {
    kind: "tutoring_issue",
    level: "info",
    title: `${stale} ${stale === 1 ? "protocolo da tutoria está" : "protocolos da tutoria estão"} sem retorno há mais de ${days} dias`,
    body: "Confira em Meus alunos, Pendências, e cobre o retorno da instituição.",
    link: "/meus-alunos?aba=pendencias",
    dedupeKey: `tutoring_stale:${todayInAppTz()}`
  });
  return stale;
};

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
  const tutorId = Number(c.userId) || Number(who?.leadTutor) || null;
  // the protocols written in the conversation are registered by themselves (free, no model); the model is then told they exist
  const captured = await captureProtocols({ ticketId, leadId: who?.leadId ? Number(who.leadId) : null, tutorId, institutionId: c.institutionId || null, lastMessageId: c.lastMessageId }, msgs);
  const open = await TutoringIssue.findAll({ where: { ticketId, status: { [Op.in]: OPEN } } as any, order: [["id", "ASC"]] });
  const user = [
    open.length ? `Pendências já abertas desta conversa:\n${open.map(i => `#${i.id} (${i.kind}${i.protocolNumber ? ", protocolo já registrado" : ""}) ${i.summary}`).join("\n")}` : "Nenhuma pendência aberta nesta conversa.",
    "",
    "Conversa:",
    msgs.map(m => `${m.fromMe ? "Tutor" : "Aluno"}: ${scrub(String(m.body || "").slice(0, 500), names)}`).join("\n")
  ].join("\n");
  const { askOnce } = await import("../AiServices/RunAiAgent");
  const answer = await askOnce(access.agent, access.apiKey, SYSTEM, user, 300, { kind: "reading", ticketId });
  const parsed = parseAuditAnswer(answer.text, open.map(i => i.id));
  const tokens = Number(answer.usage?.total_tokens || (answer.usage?.input_tokens || 0) + (answer.usage?.output_tokens || 0) || 0);
  const created: TutoringIssue[] = [];
  for (const p of parsed.pendencias) {
    // a protocol found in code in this same reading is that case: not a second "protocol opened" pending item
    if (p.tipo === "protocolo" && captured > 0) continue;
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

// how many conversations with something new get the free reading of protocol numbers in one round
const FREE_SCAN = 200;

// the free part alone (no model): the protocol numbers of the last messages; the conversation is not marked as read
const captureOnly = async (c: any): Promise<number> => {
  const msgs = await rows(`SELECT m.body FROM Messages m WHERE m.ticketId = :ticketId AND m.isDeleted = false AND m.body IS NOT NULL ORDER BY m.createdAt DESC LIMIT ${MAX_MESSAGES}`, { ticketId: Number(c.id) });
  const [lead] = await rows(`SELECT l.id, l.onboardingTutorId FROM Leads l WHERE l.contactId = :contactId ORDER BY l.updatedAt DESC LIMIT 1`, { contactId: c.contactId });
  return captureProtocols({ ticketId: Number(c.id), leadId: lead ? Number(lead.id) : null, tutorId: Number(c.userId) || (lead ? Number(lead.onboardingTutorId) || null : null), institutionId: c.institutionId || null, lastMessageId: c.lastMessageId }, msgs);
};

// The round of the worker: at most N conversations a day (setting), stopping at the first budget refusal (the rest waits for tomorrow)
export const runTutoringAudit = async (opts: { limit?: number; force?: boolean } = {}): Promise<AuditRun> => {
  const run: AuditRun = { read: 0, found: 0, resolved: 0, skipped: 0, failed: 0, stoppedByBudget: false };
  if (!opts.force && (await getSetting("tutoring_audit_enabled", "true")) !== "true") return { ...run, reason: "disabled" };
  await remindStaleProtocols().catch(err => logger.warn(`Lembrete de protocolos parados: ${(err as Error).message}`));
  const today = todayInAppTz();
  const perDay = Math.min(500, Math.max(1, Number(await getSetting("tutoring_audit_max_tickets", "40")) || 40));
  const usedToday = (await getSetting("tutoring_audit_day", "")) === today ? Number(await getSetting("tutoring_audit_count", "0")) || 0 : 0;
  const left = Math.max(0, Math.min(opts.limit ?? perDay, perDay - usedToday));
  // every conversation with something new gets the free part (the protocol numbers written in it), whatever the daily limit of the AI
  // or the key; the AI reads, cheaply, only up to the limit (the oldest first). What the AI did not read stays unread for the next round.
  const all = await candidates(Math.max(left, FREE_SCAN));
  if (!all.length) return { ...run, ...(left ? {} : { reason: "daily_limit" }) };
  const access = left ? await auditorAccess() : null;
  const list = access ? all.slice(0, left) : [];
  for (const c of all.slice(list.length)) {
    // eslint-disable-next-line no-await-in-loop
    run.found += await captureOnly(c).catch(() => 0);
  }
  if (!left) return { ...run, reason: "daily_limit" };
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

// ---------------------------------------------------------------- the tutor's side: the protocols of their own students
// Simple on purpose: the tutor writes the number and the subject of the case opened in the institution's system, may tell the student in
// the conversation, and it stays in the student's history. The tutor's list shows the cases of their own conversations, never how they
// were found.

const PROTOCOL_EVENT = "protocol";

const tutorTicket = async (ticketId: number, userId: number, manager: boolean): Promise<Ticket> => {
  const ticket = await Ticket.findByPk(ticketId, { include: ["contact", "whatsapp"] });
  if (!ticket || !TUTORIA_SEGMENTS.includes(String(ticket.segment || ""))) throw new AppError("ERR_PROTOCOL_NOT_TUTORING", 400);
  if (!manager && ticket.userId !== userId) throw new AppError("ERR_NO_PERMISSION", 403);
  return ticket;
};

const leadOfTicket = async (ticket: Ticket): Promise<number | null> => {
  const [row] = await rows(`SELECT l.id FROM Leads l WHERE l.contactId = :contactId ORDER BY l.updatedAt DESC LIMIT 1`, { contactId: ticket.contactId });
  return row ? Number(row.id) : null;
};

// the line of the student's history and of the conversation's events
const record = async (ticket: Ticket | null, leadId: number | null, userId: number, text: string): Promise<void> => {
  const { default: TicketEvent } = await import("../../models/TicketEvent");
  if (ticket) await TicketEvent.create({ ticketId: ticket.id, type: PROTOCOL_EVENT, actorId: userId, note: text.slice(0, 1000) } as any);
  if (leadId) {
    const { addActivity } = await import("../CrmServices/LeadCore");
    await addActivity(leadId, userId, "note", text.slice(0, 2000)).catch(() => undefined);
  }
};

// the message to the student, in the conversation (no emoji, one idea); a closed window of the official number is said, not hidden
const tellStudent = async (ticket: Ticket | null, userId: number, body: string): Promise<string | null> => {
  // a student who never talked with the tutoring has no conversation to be told in: the protocol stays registered all the same
  if (!ticket) return "O protocolo foi registrado. O aluno ainda não tem conversa com a tutoria: avise quando ele chamar.";
  try {
    const SendToContact = (await import("../ChannelServices/SendToContact")).default;
    await SendToContact({ contact: (ticket as any).contact, whatsapp: (ticket as any).whatsapp, body, ticketId: ticket.id, keepOpen: { userId }, byPerson: true });
    return null;
  } catch (err) {
    return "O protocolo foi registrado, mas a mensagem ao aluno não saiu. Avise o aluno pela conversa quando ela estiver aberta.";
  }
};

const firstName = (ticket: Ticket | null, fallback = ""): string => String((ticket as any)?.contact?.name || fallback || "").trim().split(/\s+/)[0];

// a student chosen in the list (Meus alunos > Protocolos): only the tutor's own students (the management reaches all of them); the
// student's tutoring conversation, when there is one, is where the history line goes and where the student may be told
const studentOf = async (leadId: number, userId: number, manager: boolean): Promise<{ lead: any; ticket: Ticket | null }> => {
  const { default: Lead } = await import("../../models/Lead");
  const lead = await Lead.findByPk(leadId, { attributes: ["id", "name", "contactId", "onboardingTutorId", "institutionId"] });
  if (!lead) throw new AppError("ERR_PROTOCOL_STUDENT", 404);
  if (!manager && lead.onboardingTutorId !== userId) throw new AppError("ERR_NO_PERMISSION", 403);
  const ticket = lead.contactId
    ? await Ticket.findOne({
      where: { contactId: lead.contactId, segment: { [Op.in]: TUTORIA_SEGMENTS }, isGroup: false, isHistorical: false } as any,
      include: ["contact", "whatsapp"],
      order: [["updatedAt", "DESC"]]
    })
    : null;
  return { lead, ticket };
};

export const myProtocols = async (userId: number) => {
  const issues = await TutoringIssue.findAll({
    where: { tutorId: userId, [Op.or]: [{ status: { [Op.in]: OPEN } }, { status: "resolvida", resolvedAt: { [Op.gt]: new Date(Date.now() - 30 * 864e5) } }] } as any,
    order: [["detectedAt", "DESC"]],
    limit: 200
  });
  const ticketIds = [...new Set(issues.map(i => i.ticketId).filter(Boolean))];
  const leadIds = [...new Set(issues.filter(i => !i.ticketId && i.leadId).map(i => i.leadId))];
  const people = ticketIds.length ? await rows(`SELECT t.id, ct.name AS student FROM Tickets t JOIN Contacts ct ON ct.id = t.contactId WHERE t.id IN (:ids)`, { ids: ticketIds }) : [];
  const leads = leadIds.length ? await rows(`SELECT l.id, l.name AS student FROM Leads l WHERE l.id IN (:ids)`, { ids: leadIds }) : [];
  const byTicket = new Map(people.map(p => [Number(p.id), p.student]));
  const byLead = new Map(leads.map(p => [Number(p.id), p.student]));
  return issues.map(i => ({
    id: i.id, ticketId: i.ticketId, leadId: i.leadId, kindLabel: KINDS[i.kind] || "Outro", summary: i.summary, protocolNumber: i.protocolNumber, protocolName: i.protocolName,
    status: i.status === "resolvida" ? "resolvida" : i.protocolNumber ? "registrada" : "aberta", at: i.detectedAt, resolvedAt: i.resolvedAt,
    student: (i.ticketId ? byTicket.get(i.ticketId) : null) || (i.leadId ? byLead.get(i.leadId) : null) || null
  }));
};

export const ticketProtocols = async (ticketId: number) =>
  (await TutoringIssue.findAll({ where: { ticketId, status: { [Op.in]: [...OPEN, "resolvida"] } } as any, order: [["detectedAt", "DESC"]], limit: 20 }))
    .map(i => ({ id: i.id, kindLabel: KINDS[i.kind] || "Outro", summary: i.summary, protocolNumber: i.protocolNumber, protocolName: i.protocolName, status: i.status === "resolvida" ? "resolvida" : i.protocolNumber ? "registrada" : "aberta" }));

// the tutor writes the protocol: on a case already in the list (issueId), a new one of this conversation (ticketId) or of a student
// chosen in the list of protocols (leadId), with or without a conversation with the tutoring
export const registerProtocol = async (userId: number, manager: boolean, body: any) => {
  const number = clip(body?.protocolNumber, 60);
  const subject = clip(body?.protocolName, 160);
  if (!number) throw new AppError("ERR_PROTOCOL_NUMBER", 400);
  if (!subject) throw new AppError("ERR_PROTOCOL_SUBJECT", 400);
  let issue = body?.issueId ? await TutoringIssue.findByPk(Number(body.issueId)) : null;
  let ticket: Ticket | null = null;
  let leadId: number | null = null;
  let studentName = "";
  if (issue) {
    if (!manager && issue.tutorId && issue.tutorId !== userId) throw new AppError("ERR_NO_PERMISSION", 403);
    if (issue.ticketId) {
      ticket = await tutorTicket(issue.ticketId, userId, manager || issue.tutorId === userId);
      leadId = issue.leadId || (await leadOfTicket(ticket));
    } else if (issue.leadId) {
      const found = await studentOf(issue.leadId, userId, manager || issue.tutorId === userId);
      ({ ticket } = found);
      leadId = found.lead.id;
      studentName = found.lead.name;
    }
  } else if (Number(body?.ticketId)) {
    ticket = await tutorTicket(Number(body.ticketId), userId, manager);
    leadId = await leadOfTicket(ticket);
  } else if (Number(body?.leadId)) {
    const found = await studentOf(Number(body.leadId), userId, manager);
    ({ ticket } = found);
    leadId = found.lead.id;
    studentName = found.lead.name;
  } else throw new AppError("ERR_PROTOCOL_STUDENT", 400);

  // the same number twice for the same student is one protocol
  const twin = await TutoringIssue.findOne({
    where: {
      protocolNumber: number,
      ...(issue ? { id: { [Op.ne]: issue.id } } : {}),
      [Op.or]: [...(ticket ? [{ ticketId: ticket.id }] : []), ...(leadId ? [{ leadId }] : [])]
    } as any
  });
  if (twin && (ticket || leadId)) throw new AppError("ERR_PROTOCOL_EXISTS", 409);

  if (issue) {
    issue.set({ protocolNumber: number, protocolName: subject, status: issue.status === "aberta" ? "registrada" : issue.status, ...(ticket && !issue.ticketId ? { ticketId: ticket.id } : {}) } as any);
    await issue.save();
  } else {
    issue = await TutoringIssue.create({
      ticketId: ticket ? ticket.id : null, leadId, tutorId: (ticket && ticket.userId) || userId, institutionId: (ticket as any)?.institutionId || null, kind: "protocolo",
      summary: `Protocolo ${number}: ${subject}`.slice(0, 280), protocolNumber: number, protocolName: subject, status: "registrada", source: "tutor", detectedAt: new Date()
    } as any);
  }
  await record(ticket, leadId, userId, `Protocolo ${number} registrado pela tutoria: ${subject}.`);
  const first = firstName(ticket, studentName);
  const warning = body?.notifyStudent
    ? await tellStudent(ticket, userId, `${first ? `${first}, r` : "R"}egistrei o seu atendimento com o protocolo ${number} (${subject}). Assim que eu tiver o retorno, te aviso por aqui.`)
    : null;
  return { issue, warning };
};

// the case is solved: it leaves the open list, stays in the history, and the student may be told
export const resolveProtocol = async (id: number, userId: number, manager: boolean, body: any) => {
  const issue = await TutoringIssue.findByPk(id);
  if (!issue || (!issue.ticketId && !issue.leadId)) throw new AppError("ERR_NOT_FOUND", 404);
  if (!manager && issue.tutorId && issue.tutorId !== userId) throw new AppError("ERR_NO_PERMISSION", 403);
  const mine = manager || issue.tutorId === userId;
  let ticket: Ticket | null = null;
  let studentName = "";
  if (issue.ticketId) ticket = await tutorTicket(issue.ticketId, userId, mine);
  else {
    const found = await studentOf(Number(issue.leadId), userId, mine);
    ({ ticket } = found);
    studentName = found.lead.name;
  }
  issue.set({ status: "resolvida", resolvedAt: new Date(), resolvedBy: userId } as any);
  await issue.save();
  const leadId = issue.leadId || (ticket ? await leadOfTicket(ticket) : null);
  const label = issue.protocolNumber ? `Protocolo ${issue.protocolNumber}` : "Atendimento";
  await record(ticket, leadId, userId, `${label} resolvido pela tutoria${issue.protocolName ? `: ${issue.protocolName}` : ""}.`);
  const first = firstName(ticket, studentName);
  const warning = body?.notifyStudent
    ? await tellStudent(ticket, userId, `${first ? `${first}, o` : "O"} seu atendimento${issue.protocolNumber ? ` do protocolo ${issue.protocolNumber}` : ""} foi resolvido. Se precisar de mais alguma coisa, é só me chamar.`)
    : null;
  return { issue, warning };
};
