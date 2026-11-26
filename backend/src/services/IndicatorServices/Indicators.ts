import { Op, QueryTypes, literal } from "sequelize";

import sequelize from "../../database";
import { dayBounds } from "../../helpers/AppTime";
import { businessMinutes, getBusinessConfig } from "../../helpers/BusinessTime";
import { portable } from "../../helpers/sqlDialect";
import Polo from "../../models/Polo";
import Whatsapp from "../../models/Whatsapp";
import ConsultantReview from "../../models/ConsultantReview";
import { getConfig } from "../../channels/types";

// Consolidated indicators for the OpenBot (GET /api/v1/indicadores, docs/API-V1.md). ONLY totals and codes: no name, phone, e-mail, CPF,
// note or text of a conversation. Every number follows the rule of the screen that already shows it:
//   leads by origin and stage   Painel do CRM / Captação (LeadController.metrics: created in the period, not historical)
//   first answer                the same leads with a first contact, in working hours (BusinessTime), as a median
//   follow-ups overdue          Leads.nextFollowUpAt already past (the filter "Follow-up atrasado" of the CRM) and tasks overdue
//   Matrículas realizadas       EnrollmentController.index itself (the first course of each lead and the extra courses)
//   goals                       GoalController.buildPoloBoard (the CRM and the hand adjustments kept apart)
//   consultant review           ConsultantReview (objections raised/handled, steps with difficulty or skipped), by an opaque code of the
//                               consultant: stable for the same token, different for another token, never the user id (consultantCode)
//   connections                 Whatsapps: id, function, status, quality and the validity of the Meta token (never the name or the token)
export { MAX_PERIOD_DAYS, cleanIndicatorQuery, consultantCode, assertPseudonymSecret } from "./IndicatorQuery";
import { consultantCode } from "./IndicatorQuery";
import type { IndicatorQuery } from "./IndicatorQuery";

const q = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];
const n = (v: any): number => Number(v || 0);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
};
// the key of a polo in the maps; the leads with no polo yet go to "sem polo" (only for a token of every polo)
const key = (poloId: any): string => (poloId === null || poloId === undefined ? "none" : String(Number(poloId)));

const QUALITY: Array<[RegExp, string]> = [[/vermelha/i, "vermelha"], [/amarela/i, "amarela"]];

// rows grouped by the key of their polo once (instead of filtering every array for every polo)
const byPolo = <T extends Record<string, any>>(rows: T[], field = "polo"): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  rows.forEach(r => {
    const k = key(r[field]);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  });
  return m;
};

export const buildIndicators = async (query: IndicatorQuery, now: Date = new Date(), tokenKey = "all") => {
  const start = dayBounds(query.from).start;
  const end = dayBounds(query.to).end;
  // the polos asked for: one, the ones of the token, or every polo (plus the leads with no polo)
  const allPolos = await Polo.findAll({ attributes: ["id", "code", "active"], order: [["id", "ASC"]] });
  const wanted: number[] | null = query.poloId ? [query.poloId] : query.tokenPolos;
  const polos = wanted ? allPolos.filter(p => wanted.includes(p.id)) : allPolos;
  const withNone = !wanted;
  const ids = polos.map(p => p.id);
  const inPolos = `(${withNone ? "l.poloId IS NULL OR " : ""}l.poloId IN (${ids.length ? ids.join(", ") : "0"}))`;
  const rep = { from: start, to: end, now };
  const base = `l.isHistorical = false AND ${inPolos}`;

  const [bySource, byStage, contacted, followUps, tasks] = await Promise.all([
    q(`SELECT l.poloId AS polo, COALESCE(l.source,'Outro') AS origem, COUNT(*) AS total, SUM(CASE WHEN s.type='won' THEN 1 ELSE 0 END) AS won
         FROM Leads l JOIN LeadStages s ON s.id = l.stageId WHERE l.createdAt BETWEEN :from AND :to AND ${base} GROUP BY l.poloId, l.source`, rep),
    q(`SELECT l.poloId AS polo, s.id AS stage, s.name AS name, s.type AS type, s.position AS position, COUNT(*) AS total
         FROM Leads l JOIN LeadStages s ON s.id = l.stageId WHERE l.createdAt BETWEEN :from AND :to AND ${base} GROUP BY l.poloId, s.id, s.name, s.type, s.position`, rep),
    q(`SELECT l.poloId AS polo, l.createdAt AS c, l.firstContactAt AS f FROM Leads l
         WHERE l.firstContactAt IS NOT NULL AND l.createdAt BETWEEN :from AND :to AND ${base} LIMIT 20000`, rep),
    q(`SELECT l.poloId AS polo, COUNT(*) AS total FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE l.nextFollowUpAt < :now AND s.type = 'open' AND ${base} GROUP BY l.poloId`, rep),
    q(`SELECT l.poloId AS polo, COUNT(*) AS total FROM LeadTasks t JOIN Leads l ON l.id = t.leadId
         WHERE t.doneAt IS NULL AND t.dueAt < :now AND ${base} GROUP BY l.poloId`, rep)
  ]);

  // Matrículas realizadas: the very rule of the screen (EnrollmentController.index), read as the administration and grouped by polo
  const { index: enrollmentIndex } = await import("../../controllers/EnrollmentController");
  // (one polo asked: the screen's own filter by polo, so only that polo is read)
  const enrollments: any = await enrollmentIndex(
    { query: { from: query.from, to: query.to, ...(ids.length === 1 && !withNone ? { poloId: String(ids[0]) } : {}) }, user: { id: 0, profile: "admin", role: "admin" } } as any,
    { json: (body: any) => body } as any
  );
  // the goals of the current semester: what came from the CRM and what was typed by hand, apart
  const { buildPoloBoard } = await import("../../controllers/GoalController");
  const board: any = await buildPoloBoard();
  // the review of the conversations of the period (codes only)
  // only the reviews of the leads of the polos asked (plus the ones with no lead, for a token of every polo)
  const leadsOfPolos = literal(`(SELECT l.id FROM "Leads" l WHERE ${portable(inPolos)})`);
  const reviews = await ConsultantReview.findAll({
    // (a token of every polo reads them all: no filter to pay for)
    where: { day: { [Op.between]: [query.from, query.to] }, ...(wanted ? { leadId: { [Op.in]: leadsOfPolos } } : {}) } as any,
    attributes: ["userId", "leadId", "objections", "difficulties", "skipped"]
  });
  const reviewPolo = new Map<number, any>();
  const leadIds = [...new Set(reviews.map(r => r.leadId).filter(Boolean))] as number[];
  if (leadIds.length) (await q(`SELECT l.id, l.poloId AS polo FROM Leads l WHERE l.id IN (:ids)`, { ids: leadIds })).forEach(r => reviewPolo.set(Number(r.id), r.polo));

  const business = await getBusinessConfig();
  // every list grouped by polo once
  const G = { bySource: byPolo(bySource), byStage: byPolo(byStage), contacted: byPolo(contacted), followUps: byPolo(followUps), tasks: byPolo(tasks) };
  const enrBy = byPolo((enrollments?.rows || []) as any[], "poloId");
  const goalBy = new Map<number, any>(((board?.rows || []) as any[]).map(r => [Number(r.poloId), r]));
  const rvBy = byPolo(reviews.map(r => ({ r, polo: r.leadId ? reviewPolo.get(Number(r.leadId)) : null })));
  const out = [...polos.map(p => ({ id: p.id as number | null, code: p.code || null })), ...(withNone ? [{ id: null, code: null }] : [])].map(p => {
    const k = key(p.id);
    const mine = (group: Map<string, any[]>) => group.get(k) || [];
    const firsts = mine(G.contacted).map(r => businessMinutes(business, new Date(r.c), new Date(r.f)));
    const enr = mine(enrBy);
    const goal = p.id ? goalBy.get(p.id) || null : null;
    const rv = mine(rvBy).map(x => x.r);
    const byConsultant = new Map<number, any>();
    rv.forEach(r => {
      const c = byConsultant.get(r.userId) || { consultor: consultantCode(tokenKey, r.userId), conversasLidas: 0, objecoes: {} as Record<string, { levantadas: number; tratadas: number }>, dificuldades: {} as Record<string, number>, puladas: {} as Record<string, number> };
      c.conversasLidas += 1;
      (r.objections || []).forEach((o: any) => { const cur = c.objecoes[o.type] || { levantadas: 0, tratadas: 0 }; cur.levantadas += 1; if (o.handled) cur.tratadas += 1; c.objecoes[o.type] = cur; });
      (r.difficulties || []).forEach((s: string) => { c.dificuldades[s] = (c.dificuldades[s] || 0) + 1; });
      (r.skipped || []).forEach((s: string) => { c.puladas[s] = (c.puladas[s] || 0) + 1; });
      byConsultant.set(r.userId, c);
    });
    return {
      poloId: p.id,
      codigo: p.code,
      leads: {
        total: mine(G.bySource).reduce((t, r) => t + n(r.total), 0),
        porOrigem: mine(G.bySource).map(r => ({ origem: String(r.origem), total: n(r.total), matriculados: n(r.won) })).sort((a, b) => b.total - a.total),
        porEtapa: [...mine(G.byStage)].sort((a, b) => n(a.position) - n(b.position)).map(r => ({ etapaId: Number(r.stage), etapa: String(r.name), tipo: String(r.type), total: n(r.total) }))
      },
      primeiraResposta: { leadsRespondidos: firsts.length, medianaMinutos: median(firsts), horarioComercial: !!business.enabled },
      followUps: { vencidos: n(mine(G.followUps)[0]?.total), tarefasVencidas: n(mine(G.tasks)[0]?.total) },
      matriculasRealizadas: { total: enr.length, dentroDaMeta: enr.filter(r => r.inGoal).length, comPrint: enr.filter(r => r.proofId).length },
      metas: goal ? {
        meta: board?.goal?.title || null,
        alvo: goal.target ?? null,
        doCrm: n(goal.auto),
        ajustesManuais: { total: n(goal.adjust), semMes: n(goal.manual), porMes: (goal.months || []).filter((m: any) => n(m.adjust)).map((m: any) => ({ mes: m.month, ajuste: n(m.adjust) })) },
        canceladas: n(goal.canceled),
        feito: n(goal.done)
      } : null,
      revisaoConsultores: [...byConsultant.values()].map(c => ({
        consultor: c.consultor,
        conversasLidas: c.conversasLidas,
        objecoes: Object.entries(c.objecoes).map(([tipo, v]: any) => ({ tipo, levantadas: v.levantadas, tratadas: v.tratadas })),
        etapasComDificuldade: Object.entries(c.dificuldades).map(([etapa, vezes]) => ({ etapa, vezes })),
        etapasPuladas: Object.entries(c.puladas).map(([etapa, vezes]) => ({ etapa, vezes }))
      }))
    };
  });

  // connections: a token of some polos sees the ones that serve the queues of those polos
  let connections = await Whatsapp.findAll({ attributes: ["id", "channel", "team", "ownerId", "status", "statusNote", "config"], order: [["id", "ASC"]] });
  if (wanted) {
    const serving = new Set((await q(`SELECT DISTINCT wq.whatsappId AS id FROM WhatsappQueues wq JOIN Queues qu ON qu.id = wq.queueId WHERE qu.poloId IN (${wanted.length ? wanted.join(", ") : "0"})`, {})).map(r => Number(r.id)));
    connections = connections.filter(w => serving.has(w.id));
  }
  const conexoes = connections.map(w => {
    const cfg = getConfig(w);
    const note = String(w.statusNote || "");
    const quality = QUALITY.find(([re]) => re.test(note));
    const cloud = w.channel === "whatsapp_cloud";
    const expires = cloud && cfg.tokenExpiresAt ? new Date(cfg.tokenExpiresAt) : null;
    return {
      id: w.id,
      canal: w.channel || "whatsapp",
      funcao: w.ownerId ? "pessoal" : w.team || "atendimento",
      conectado: w.status === "CONNECTED",
      estado: w.status || null,
      qualidade: quality ? quality[1] : cloud && w.status === "CONNECTED" ? "verde" : null,
      tokenMeta: cloud ? { venceEm: expires && !Number.isNaN(+expires) ? expires.toISOString() : null, diasRestantes: expires && !Number.isNaN(+expires) ? Math.floor((+expires - now.getTime()) / 86400000) : null } : null
    };
  });

  return { periodo: { de: query.from, ate: query.to }, geradoEm: now.toISOString(), polos: out, conexoes };
};
