import { Op } from "sequelize";

import { getSetting, setSetting } from "../../helpers/AppSettings";
import LeadStage from "../../models/LeadStage";

// The commercial funnel by KEY, not by id and not by name: each key points to a column of the CRM through the setting
// `crm_stage_map`. The columns that already exist are recognised (by name or by type) and the missing ones can be created. A key
// with no column is simply not used (the lead stays where it is): nothing breaks.
export const STAGE_KEYS = [
  "new_lead", "contact_started", "in_service", "qualified", "waiting_transcript", "curricular_analysis", "analysis_done", "ready_for_proposal",
  "proposal", "enrollment_in_progress", "enrolled", "follow_up", "no_response", "no_interest", "human_service"
] as const;
export type StageKey = typeof STAGE_KEYS[number];

interface Spec {
  name: string;
  type: "open" | "won" | "lost";
  color: string;
  // names an existing column may already have
  aliases: string[];
}

export const STAGE_SPECS: Record<StageKey, Spec> = {
  new_lead: { name: "Novo lead", type: "open", color: "#64748b", aliases: ["novo lead", "novo", "lead novo"] },
  contact_started: { name: "Contato iniciado", type: "open", color: "#0ea5e9", aliases: ["contato iniciado", "primeiro contato"] },
  in_service: { name: "Em atendimento", type: "open", color: "#6366f1", aliases: ["em atendimento", "atendimento"] },
  qualified: { name: "Qualificado", type: "open", color: "#8b5cf6", aliases: ["qualificado", "qualificada", "lead qualificado"] },
  waiting_transcript: { name: "Aguardando histórico", type: "open", color: "#f59e0b", aliases: ["aguardando historico", "aguardando documentos"] },
  curricular_analysis: { name: "Análise curricular", type: "open", color: "#d97706", aliases: ["analise curricular", "em analise"] },
  analysis_done: { name: "Análise concluída", type: "open", color: "#16a34a", aliases: ["analise concluida", "analise finalizada"] },
  ready_for_proposal: { name: "Pronto para proposta", type: "open", color: "#ea580c", aliases: ["pronto para proposta", "pronto p/ proposta"] },
  proposal: { name: "Proposta / negociação", type: "open", color: "#0b4279", aliases: ["proposta / negociacao", "proposta enviada", "proposta", "negociacao"] },
  enrollment_in_progress: { name: "Matrícula em andamento", type: "open", color: "#0d9488", aliases: ["matricula em andamento", "matricula"] },
  enrolled: { name: "Matriculado", type: "won", color: "#15803d", aliases: ["matriculado", "matriculada", "ganho"] },
  follow_up: { name: "Follow-up", type: "open", color: "#a855f7", aliases: ["follow-up", "follow up", "followup", "retorno"] },
  no_response: { name: "Sem resposta", type: "open", color: "#94a3b8", aliases: ["sem resposta", "nao respondeu"] },
  no_interest: { name: "Sem interesse", type: "lost", color: "#dc2626", aliases: ["sem interesse", "perdido", "perdida", "perdidos"] },
  human_service: { name: "Atendimento humano", type: "open", color: "#e11d48", aliases: ["atendimento humano", "humano"] }
};

// where a missing column is put: right after the column of the key that comes before it in the journey
const ORDER: StageKey[] = [
  "new_lead", "contact_started", "in_service", "qualified", "waiting_transcript", "curricular_analysis", "analysis_done", "ready_for_proposal", "proposal",
  "enrollment_in_progress", "human_service", "follow_up", "no_response"
];

const plain = (s: string): string =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export type StageMap = Partial<Record<StageKey, number | null>>;

const readMap = async (): Promise<StageMap> => {
  try {
    const raw = JSON.parse(await getSetting("crm_stage_map", "{}"));
    return raw && typeof raw === "object" ? raw : {};
  } catch (e) {
    return {};
  }
};

// the column of each key: the one chosen in the setting, else the one that already has the expected name or type, else none
export const effectiveMap = async (): Promise<Record<StageKey, number | null>> => {
  const [stored, stages] = await Promise.all([readMap(), LeadStage.findAll({ order: [["position", "ASC"]] })]);
  const ids = new Set(stages.map(s => s.id));
  const used = new Set<number>();
  const out = {} as Record<StageKey, number | null>;
  STAGE_KEYS.forEach(k => {
    const id = Number(stored[k]);
    if (id && ids.has(id)) { out[k] = id; used.add(id); }
  });
  STAGE_KEYS.forEach(k => {
    if (out[k]) return;
    const spec = STAGE_SPECS[k];
    const hit = stages.find(s => !used.has(s.id) && s.type === spec.type && spec.aliases.includes(plain(s.name)))
      // the first column of that type when the key is the won or the lost one
      || (spec.type !== "open" ? stages.find(s => !used.has(s.id) && s.type === spec.type) : undefined);
    out[k] = hit ? hit.id : null;
    if (hit) used.add(hit.id);
  });
  return out;
};

export const resolveStage = async (key: string): Promise<number | null> => ((await effectiveMap())[key as StageKey] ?? null);

export const keyOfStage = (map: Record<StageKey, number | null>, stageId: number | null | undefined): StageKey | null => {
  if (!stageId) return null;
  const hit = STAGE_KEYS.find(k => map[k] === stageId);
  return hit || null;
};

export const saveMap = async (map: StageMap): Promise<void> => {
  const clean: Record<string, number> = {};
  STAGE_KEYS.forEach(k => { const id = Number(map[k]); if (id) clean[k] = id; });
  await setSetting("crm_stage_map", JSON.stringify(clean));
};

// The funnel of the agent: what exists is mapped; with `create` the missing columns are made (after the one before them in the
// journey). Nothing existing is renamed, moved or deleted.
export const ensurePipeline = async (opts: { create?: boolean } = {}): Promise<{ map: Record<StageKey, number | null>; created: string[]; missing: string[] }> => {
  let map = await effectiveMap();
  const created: string[] = [];
  if (opts.create) {
    for (const key of ORDER) {
      if (map[key]) continue;
      // eslint-disable-next-line no-await-in-loop
      const before = [...ORDER].slice(0, ORDER.indexOf(key)).reverse().map(k => map[k]).find(Boolean);
      // eslint-disable-next-line no-await-in-loop
      const prev = before ? await LeadStage.findByPk(before) : null;
      // eslint-disable-next-line no-await-in-loop
      const position = prev ? prev.position + 1 : ((await LeadStage.max("position")) as number || 0) + 1;
      // eslint-disable-next-line no-await-in-loop
      if (prev) await LeadStage.increment("position", { by: 1, where: { position: { [Op.gte]: position } } as any });
      const spec = STAGE_SPECS[key];
      // eslint-disable-next-line no-await-in-loop
      const stage = await LeadStage.create({ name: spec.name, color: spec.color, type: spec.type, position } as any);
      map = { ...map, [key]: stage.id };
      created.push(spec.name);
    }
    await saveMap(map);
  } else if (Object.values(map).some(Boolean)) {
    await saveMap(map);
  }
  return { map, created, missing: STAGE_KEYS.filter(k => !map[k]).map(k => STAGE_SPECS[k].name) };
};
