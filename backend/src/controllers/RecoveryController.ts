import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import AppError from "../errors/AppError";
import { portable } from "../helpers/sqlDialect";
import { isManagerRole } from "../helpers/Roles";
import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import { crmPolosOf, poloSql, reqRole } from "../middleware/scope";
import { OBJECTION_LABEL } from "../services/AnalyticsServices/ConsultantReview";

// "RECUPERAÇÃO" in the CRM: the leads that stopped answering or gave up, with the reason and the objection, to be tried again. The leads
// the reading of the copied conversations found, and the leads lost in the funnel in the last 90 days. A consultant sees their own;
// the management sees the ones of its polos (or one consultant: ?ownerId=).
const ownerOf = (req: Request): number | null => {
  if (!isManagerRole(reqRole(req))) return Number(req.user.id);
  const asked = req.query.ownerId ? Number(req.query.ownerId) : null;
  return asked && Number.isInteger(asked) ? asked : null;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const sequelize = (await import("../database")).default;
  const ownerId = ownerOf(req);
  const polos = poloSql(await crmPolosOf(req));
  const reason = req.query.reason ? String(req.query.reason).slice(0, 160) : null;
  const objection = req.query.objection ? String(req.query.objection).slice(0, 20) : null;
  const rows = (await sequelize.query(
    portable(`
    SELECT l.id, l.name, l.phone, l.ownerId, u.name AS ownerName, c.name AS courseName, l.lastContactAt, l.lostAt, l.recoveryAt,
      COALESCE(l.recoveryReason, l.lostReason) AS reason, l.recoveryObjection AS objection, l.lostReason, s.name AS stageName, s.type AS stageType,
      lc.summary, lc.nextAction, l.recoveryState
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId LEFT JOIN Users u ON u.id = l.ownerId LEFT JOIN Courses c ON c.id = l.courseId
      LEFT JOIN LeadCommercials lc ON lc.leadId = l.id
    WHERE l.isHistorical = false AND l.enrolledAt IS NULL
      AND (l.recoveryState = 'aberta' OR (l.recoveryState IS NULL AND s.type = 'lost' AND l.lostAt > :since))
      AND (:ownerId IS NULL OR l.ownerId = :ownerId) ${polos}
    ORDER BY COALESCE(l.recoveryAt, l.lostAt) DESC LIMIT 500`),
    { replacements: { ownerId, since: new Date(Date.now() - 90 * 864e5) }, type: QueryTypes.SELECT }
  )) as any[];
  const all = rows.map(r => ({ ...r, objectionLabel: r.objection ? OBJECTION_LABEL[r.objection] || r.objection : null }));
  // the counts by reason are of the whole list (the filters only narrow the rows shown)
  const byReason = new Map<string, number>();
  all.forEach(r => byReason.set(r.reason || "Sem motivo", (byReason.get(r.reason || "Sem motivo") || 0) + 1));
  const items = all.filter(r => (!reason || (r.reason || "Sem motivo") === reason) && (!objection || r.objection === objection));
  return res.json({
    items,
    total: all.length,
    reasons: [...byReason].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    objections: Object.entries(OBJECTION_LABEL).map(([key, label]) => ({ key, label, n: all.filter(r => r.objection === key).length })).filter(o => o.n)
  });
};

// "Voltar ao funil" (the first open column, out of Recuperação) or "Não recuperar" (stays out of the list)
export const act = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(Number(req.params.id));
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const action = String(req.body?.action || "");
  if (!["voltar", "descartar"].includes(action)) throw new AppError("ERR_INVALID_PARAMETER", 400);
  const { addActivity, changeStage } = await import("../services/CrmServices/LeadCore");
  const me = Number(req.user.id);
  if (action === "voltar") {
    const stage = await LeadStage.findByPk(lead.stageId);
    if (!stage || stage.type !== "open") {
      const { resolveStage } = await import("../services/CommercialServices/Pipeline");
      const target = (await resolveStage("follow_up")) || (await resolveStage("in_service"));
      const first = target ? await LeadStage.findByPk(target) : await LeadStage.findOne({ where: { type: "open" }, order: [["position", "ASC"]] });
      if (first) await changeStage(lead.id, first.id, me);
    }
    await lead.update({ recoveryState: "voltou" } as any);
    await addActivity(lead.id, me, "system", "Saiu da Recuperação e voltou ao funil para uma nova tentativa.");
  } else {
    await lead.update({ recoveryState: "descartada" } as any);
    await addActivity(lead.id, me, "system", "Marcado para não recuperar.");
  }
  return res.json({ ok: true, recoveryState: lead.recoveryState });
};
