import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import AppError from "../errors/AppError";
import { portable } from "../helpers/sqlDialect";
import { publicPicUrl } from "../helpers/PicUrl";
import { isManagerRole } from "../helpers/Roles";
import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import { crmPolosOf, reqRole } from "../middleware/scope";
import { OBJECTION_LABEL } from "../services/AnalyticsServices/ConsultantReview";

// "RECUPERAÇÃO" in the CRM: the leads that stopped answering or gave up, with the reason and the objection, to be tried again. The leads
// the reading of the copied conversations found, and the leads lost in the funnel in the last 90 days. A consultant sees their own;
// the management sees the ones of its polos (or one consultant: ?ownerId=).
const ownerOf = (req: Request): number | null => {
  if (!isManagerRole(reqRole(req))) return Number(req.user.id);
  const asked = req.query.ownerId ? Number(req.query.ownerId) : null;
  return asked && Number.isInteger(asked) ? asked : null;
};

const STALLED = "Parou de responder";
const CONFIRM_STAGE = "Matrícula a confirmar";

// the polos the coordination sees, plus the leads with no polo yet of the consultants of those polos (the conversations read from a
// consultant's phone come with no polo: without this they never showed for the coordination)
const scopeSql = (polos: number[] | null): string => {
  if (polos === null) return "";
  const ids = polos.map(n => Math.trunc(Number(n))).filter(n => Number.isInteger(n) && n > 0);
  const list = ids.length ? ids.join(", ") : "0";
  return `AND (l.poloId IN (${list}) OR (l.poloId IS NULL AND l.ownerId IN (SELECT pm.userId FROM PoloMembers pm WHERE pm.poloId IN (${list}))))`;
};

// how the reading of the copied conversations is going, only counts (and why it is stopped, when it is)
const readingStatus = async (sequelize: any): Promise<any> => {
  const counts = (await sequelize.query(
    portable(`SELECT status, COUNT(*) AS n FROM ConversationReadings WHERE kind = 'importacao' GROUP BY status`),
    { type: QueryTypes.SELECT }
  )) as any[];
  const by = (k: string) => Number((counts.find(c => c.status === k) || {}).n || 0);
  const [qr] = (await sequelize.query(
    portable(`SELECT COUNT(*) AS total, SUM(CASE WHEN ownerId IS NULL THEN 1 ELSE 0 END) AS noOwner FROM Whatsapps WHERE channel = 'whatsapp' AND status = 'CONNECTED'`),
    { type: QueryTypes.SELECT }
  )) as any[];
  const { auditorAccess } = await import("../services/TutoriaServices/Issues");
  const { readingSettings } = await import("../services/ReadingServices/Queue");
  const cfg = await readingSettings();
  const hasKey = !!(await auditorAccess().catch(() => null));
  // only the OpenBot reads when the system's AI has no key: then nothing is stopped. The daily limit or the spending cap of the readings
  // stops the queue until the next day (the last round says so)
  const { getSetting } = await import("../helpers/AppSettings");
  const { todayInAppTz } = await import("../helpers/AppTime");
  const [lastStop, day] = String(await getSetting("readings_last_stop", "")).split(":");
  const queued = by("pendente") + by("reservada");
  const stopped = !cfg.enabled ? "disabled" : !hasKey && cfg.provider !== "openbot" ? "no_api_key"
    // the copied conversations are no longer held by the daily count (services/ReadingServices/Queue): only the spending cap stops them
    : queued && day === todayInAppTz() && lastStop === "budget" ? lastStop : null;
  const { isReadingNow } = await import("../services/ReadingServices/Queue");
  return {
    done: by("feita"), queued: by("pendente") + by("reservada"), failed: by("falhou"),
    // the progress: what is already read (or failed) of everything copied, and whether a round is reading right now
    total: by("feita") + by("pendente") + by("reservada") + by("falhou"), readingNow: isReadingNow(),
    numbers: Number(qr?.total || 0), numbersWithoutOwner: Number(qr?.noOwner || 0),
    stopped, readingAll: readingAllNow
  };
};

// "Ler tudo agora" (only the administrator): every copied conversation waiting is read now, past the daily limit; the spending caps of the
// AI still stop it. It runs in the background (hundreds of conversations take minutes); the status above says while it reads.
let readingAllNow = false;
export const readAll = async (_req: Request, res: Response): Promise<Response> => {
  if (readingAllNow) return res.json({ started: false, running: true });
  const { readingSettings, runLocalReadings } = await import("../services/ReadingServices/Queue");
  if (!(await readingSettings()).enabled) throw new AppError("ERR_READINGS_DISABLED", 409);
  readingAllNow = true;
  setImmediate(async () => {
    try {
      const { enqueueImported } = await import("../services/ReadingServices/ImportedLeads");
      await enqueueImported();
      const run = await runLocalReadings({ only: "importacao", ignoreDailyLimit: true });
      const { markStalled } = await import("../services/ReadingServices/Stalled");
      await markStalled();
      const { logger } = await import("../utils/logger");
      logger.info(`Ler tudo agora: ${run.read} lidas, ${run.failed} falhas${run.reason ? ` (${run.reason})` : ""}`);
    } catch (err) {
      const { logger } = await import("../utils/logger");
      logger.warn(`Ler tudo agora falhou: ${(err as Error).message}`);
    } finally {
      readingAllNow = false;
    }
  });
  return res.json({ started: true, running: true });
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const sequelize = (await import("../database")).default;
  const ownerId = ownerOf(req);
  const scope = scopeSql(await crmPolosOf(req));
  const reason = req.query.reason ? String(req.query.reason).slice(0, 160) : null;
  const objection = req.query.objection ? String(req.query.objection).slice(0, 20) : null;
  // three lists: who stopped answering (7 days with the last word of the consultant), who gave up, and the enrollments the reading found,
  // to be confirmed by a person. In the order of the conversation: the oldest first
  const rows = (await sequelize.query(
    portable(`
    SELECT l.id, l.name, l.phone, l.ownerId, u.name AS ownerName, c.name AS courseName, l.lastContactAt, l.lostAt, l.recoveryAt,
      COALESCE(l.recoveryReason, l.lostReason) AS reason, l.recoveryObjection AS objection, l.lostReason, s.name AS stageName, s.type AS stageType,
      lc.summary, l.recoveryState, l.recoveryStage, l.recoveryPending, l.serviceTip, l.rgmSuggested, l.enrolledAtSuggested, l.poloId, p.name AS poloName,
      ct.profilePicUrl AS picture,
      (SELECT w.name FROM Tickets t JOIN Whatsapps w ON w.id = t.whatsappId WHERE t.contactId = l.contactId ORDER BY t.updatedAt DESC LIMIT 1) AS connectionName,
      (SELECT w.channel FROM Tickets t JOIN Whatsapps w ON w.id = t.whatsappId WHERE t.contactId = l.contactId ORDER BY t.updatedAt DESC LIMIT 1) AS connectionChannel,
      CASE WHEN s.name = :confirm THEN 'confirmar' WHEN l.recoveryReason = :stalled THEN 'parados' ELSE 'desistiram' END AS tab
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId LEFT JOIN Users u ON u.id = l.ownerId LEFT JOIN Courses c ON c.id = l.courseId
      LEFT JOIN LeadCommercials lc ON lc.leadId = l.id LEFT JOIN Polos p ON p.id = l.poloId LEFT JOIN Contacts ct ON ct.id = l.contactId
    WHERE l.isHistorical = false AND l.enrolledAt IS NULL
      AND ((s.name <> :confirm AND (l.recoveryState = 'aberta' OR (l.recoveryState IS NULL AND s.type = 'lost' AND l.lostAt > :since)))
        OR (s.name = :confirm AND s.type = 'open'))
      AND (:ownerId IS NULL OR l.ownerId = :ownerId) ${scope}
    ORDER BY COALESCE(l.lastContactAt, l.recoveryAt, l.lostAt, l.createdAt) ASC LIMIT 800`),
    { replacements: { ownerId, since: new Date(Date.now() - 90 * 864e5), confirm: CONFIRM_STAGE, stalled: STALLED }, type: QueryTypes.SELECT }
  )) as any[];
  // the picture of the contact like on WhatsApp (the address the browser opens) and the number the conversation came through
  // the reason is grouped in a few labels (the chips on top); what the reading wrote in its own words goes in the row as the detail
  const groupOf = (r: any): string => (r.reason === STALLED ? STALLED : r.lostReason || (r.stageType === "lost" ? "Desistiu" : r.reason ? "Outro" : "Sem motivo"));
  const all = rows.map(({ picture, ...r }) => ({
    ...r, reasonDetail: r.reason && r.reason !== groupOf(r) ? r.reason : null, reason: groupOf(r),
    profilePicUrl: publicPicUrl(picture), objectionLabel: r.objection ? OBJECTION_LABEL[r.objection] || r.objection : null
  }));
  const toRecover = all.filter(r => r.tab !== "confirmar");
  // the counts by reason are of the whole list (the filters only narrow the rows shown)
  const byReason = new Map<string, number>();
  toRecover.forEach(r => byReason.set(r.reason || "Sem motivo", (byReason.get(r.reason || "Sem motivo") || 0) + 1));
  const items = all.filter(r => r.tab === "confirmar" || ((!reason || (r.reason || "Sem motivo") === reason) && (!objection || r.objection === objection)));
  // the points to improve the reading of the conversation found (small labels beside "Melhorar no atendimento")
  const { improveLabelsOf } = await import("../services/ReadingServices/Coaching");
  const labels = await improveLabelsOf(items.map(r => Number(r.id)));
  items.forEach(r => { (r as any).improveLabels = labels.get(Number(r.id)) || []; });
  return res.json({
    items,
    total: toRecover.length,
    tabs: { parados: all.filter(r => r.tab === "parados").length, desistiram: all.filter(r => r.tab === "desistiram").length, confirmar: all.filter(r => r.tab === "confirmar").length },
    reasons: [...byReason].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    objections: Object.entries(OBJECTION_LABEL).map(([key, label]) => ({ key, label, n: toRecover.filter(r => r.objection === key).length })).filter(o => o.n),
    reading: isManagerRole(reqRole(req)) ? await readingStatus(sequelize) : null
  });
};

// "Voltar ao funil" (the first open column, out of Recuperação) or "Não recuperar" (stays out of the list)
export const act = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(Number(req.params.id));
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const action = String(req.body?.action || "");
  if (!["voltar", "descartar", "nao_matricula"].includes(action)) throw new AppError("ERR_INVALID_PARAMETER", 400);
  const { addActivity, changeStage } = await import("../services/CrmServices/LeadCore");
  const me = Number(req.user.id);
  if (action === "voltar" || action === "nao_matricula") {
    const stage = await LeadStage.findByPk(lead.stageId);
    if (!stage || stage.type !== "open" || stage.name === CONFIRM_STAGE) {
      const { resolveStage } = await import("../services/CommercialServices/Pipeline");
      const target = (await resolveStage("follow_up")) || (await resolveStage("in_service"));
      const first = target ? await LeadStage.findByPk(target) : await LeadStage.findOne({ where: { type: "open" }, order: [["position", "ASC"]] });
      if (first) await changeStage(lead.id, first.id, me);
    }
    if (action === "nao_matricula") {
      const { undoReadingTraces } = await import("../services/ReadingServices/ImportedLeads");
      await undoReadingTraces(lead);
      await addActivity(lead.id, me, "system", "A matrícula que a leitura da conversa sugeriu não se confirmou: o lead voltou ao funil.");
    } else {
      await lead.update({ recoveryState: "voltou" } as any);
      await addActivity(lead.id, me, "system", "Saiu da Recuperação e voltou ao funil para uma nova tentativa.");
    }
  } else {
    await lead.update({ recoveryState: "descartada" } as any);
    await addActivity(lead.id, me, "system", "Marcado para não recuperar.");
  }
  return res.json({ ok: true, recoveryState: lead.recoveryState });
};

// who may read again a number: its owner; the administration any; the coordination only numbers of people of its polos
const mayReread = async (req: Request, ownerId: number): Promise<boolean> => {
  if (ownerId === Number(req.user.id)) return true;
  if (!isManagerRole(reqRole(req))) return false;
  const polos = await crmPolosOf(req);
  if (polos === null) return true;
  if (!polos.length) return false;
  const PoloMember = (await import("../models/PoloMember")).default;
  return (await PoloMember.count({ where: { userId: ownerId, poloId: polos } as any })) > 0;
};

// "Ler de novo": the conversations copied from a number are read again with the current rules (the readings of that number are reset and
// put back in the queue). The owner of the number, or the management. What a new reading finds replaces what the old one left.
export const reread = async (req: Request, res: Response): Promise<Response> => {
  const whatsappId = Number(req.body?.whatsappId);
  if (!whatsappId) throw new AppError("ERR_FIELD_REQUIRED_whatsappId", 400);
  const Whatsapp = (await import("../models/Whatsapp")).default;
  const w = await Whatsapp.findByPk(whatsappId, { attributes: ["id", "ownerId", "channel"] });
  if (!w || (w.channel || "whatsapp") !== "whatsapp" || !w.ownerId) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  if (!(await mayReread(req, Number(w.ownerId)))) throw new AppError("ERR_NO_PERMISSION", 403);
  const sequelize = (await import("../database")).default;
  await sequelize.query(portable(`DELETE FROM ConversationReadings WHERE kind = 'importacao' AND status IN ('feita', 'falhou', 'pendente')
      AND ticketId IN (SELECT id FROM Tickets WHERE whatsappId = :whatsappId)`), { replacements: { whatsappId }, type: QueryTypes.DELETE });
  const { enqueueImported } = await import("../services/ReadingServices/ImportedLeads");
  const queued = await enqueueImported(whatsappId);
  // the queue is read at once (in the background), not only in the next round of the worker
  import("../services/ReadingServices/Queue").then(({ runLocalReadings }) => runLocalReadings({ only: "importacao" })).catch(() => undefined);
  return res.json({ queued });
};

// the numbers by QR Code whose conversations can be read again: the person's own, or every one with an owner for the management
export const rereadNumbers = async (req: Request, res: Response): Promise<Response> => {
  const sequelize = (await import("../database")).default;
  const list = (await sequelize.query(portable(`SELECT w.id, w.name, w.ownerId, u.name AS ownerName FROM Whatsapps w JOIN Users u ON u.id = w.ownerId
      WHERE w.channel = 'whatsapp' AND w.ownerId IS NOT NULL ORDER BY w.name`),
    { type: QueryTypes.SELECT })) as any[];
  const out: any[] = [];
  for (const w of list) {
    // eslint-disable-next-line no-await-in-loop
    if (await mayReread(req, Number(w.ownerId))) out.push({ id: w.id, name: w.name, ownerName: w.ownerName });
  }
  return res.json(out);
};
