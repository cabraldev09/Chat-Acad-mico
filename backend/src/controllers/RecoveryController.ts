import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import AppError from "../errors/AppError";
import { portable } from "../helpers/sqlDialect";
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
  // only the OpenBot reads when the system's AI has no key: then nothing is stopped
  const stopped = !cfg.enabled ? "disabled" : !hasKey && cfg.provider !== "openbot" ? "no_api_key" : null;
  return {
    done: by("feita"), queued: by("pendente") + by("reservada"), failed: by("falhou"),
    numbers: Number(qr?.total || 0), numbersWithoutOwner: Number(qr?.noOwner || 0),
    stopped
  };
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
      CASE WHEN s.name = :confirm THEN 'confirmar' WHEN l.recoveryReason = :stalled THEN 'parados' ELSE 'desistiram' END AS tab
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId LEFT JOIN Users u ON u.id = l.ownerId LEFT JOIN Courses c ON c.id = l.courseId
      LEFT JOIN LeadCommercials lc ON lc.leadId = l.id LEFT JOIN Polos p ON p.id = l.poloId
    WHERE l.isHistorical = false AND l.enrolledAt IS NULL
      AND ((s.name <> :confirm AND (l.recoveryState = 'aberta' OR (l.recoveryState IS NULL AND s.type = 'lost' AND l.lostAt > :since)))
        OR (s.name = :confirm AND s.type = 'open'))
      AND (:ownerId IS NULL OR l.ownerId = :ownerId) ${scope}
    ORDER BY COALESCE(l.lastContactAt, l.recoveryAt, l.lostAt, l.createdAt) ASC LIMIT 800`),
    { replacements: { ownerId, since: new Date(Date.now() - 90 * 864e5), confirm: CONFIRM_STAGE, stalled: STALLED }, type: QueryTypes.SELECT }
  )) as any[];
  const all = rows.map(r => ({ ...r, objectionLabel: r.objection ? OBJECTION_LABEL[r.objection] || r.objection : null }));
  const toRecover = all.filter(r => r.tab !== "confirmar");
  // the counts by reason are of the whole list (the filters only narrow the rows shown)
  const byReason = new Map<string, number>();
  toRecover.forEach(r => byReason.set(r.reason || "Sem motivo", (byReason.get(r.reason || "Sem motivo") || 0) + 1));
  const items = all.filter(r => r.tab === "confirmar" || ((!reason || (r.reason || "Sem motivo") === reason) && (!objection || r.objection === objection)));
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
      await lead.update({ rgmSuggested: null, enrolledAtSuggested: null } as any);
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
