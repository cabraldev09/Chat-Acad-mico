import { Op } from "sequelize";

import Course from "../../models/Course";
import Polo from "../../models/Polo";
import Lead from "../../models/Lead";
import Ticket from "../../models/Ticket";
import AiAgent from "../../models/AiAgent";
import { isPg } from "../../helpers/sqlDialect";
import { addActivity } from "../CrmServices/LeadCore";
import { norm } from "./Kb";

export interface Slot {
  key: string;
  label: string;
  required: boolean;
}

// what the agent finds out before handing the student to a consultant
export const DEFAULT_SLOTS: Slot[] = [
  { key: "nome", label: "Nome", required: true },
  { key: "cidade", label: "Cidade", required: true },
  { key: "curso", label: "Curso de interesse", required: true },
  { key: "modalidade", label: "Modalidade (EAD, semipresencial)", required: false },
  { key: "forma_ingresso", label: "Forma de ingresso (vestibular, ENEM, transferência, segunda graduação)", required: false },
  { key: "semestre_transferencia", label: "Semestre em que está (se for transferência)", required: false }
];

export const slotsOf = (agent: AiAgent): Slot[] =>
  Array.isArray(agent.slots) && agent.slots.length ? (agent.slots as Slot[]) : DEFAULT_SLOTS;

export const missingSlots = (agent: AiAgent, collected: Record<string, string> | null): Slot[] =>
  slotsOf(agent).filter(s => s.required && !(collected && String(collected[s.key] || "").trim()));

// the flows the agent may start, as tools: "fluxo_<name>"
const functionTools = (agent: AiAgent) =>
  (Array.isArray(agent.functions) ? agent.functions : []).map((f: any) => ({
    name: `fluxo_${f.name}`,
    description: `${f.description} Ao chamar, um fluxo de atendimento assume a conversa e envia as mensagens por conta própria: depois disso não escreva mais nada.`,
    input_schema: { type: "object", properties: {} }
  }));

export const toolDefs = (agent: AiAgent) => [
  {
    name: "buscar_curso",
    description: "Busca cursos do catálogo pelo nome e devolve nível, modalidade, duração e a mensalidade bruta de tabela.",
    input_schema: { type: "object", properties: { nome: { type: "string", description: "Parte do nome do curso" } }, required: ["nome"] }
  },
  {
    name: "listar_polos",
    description: "Lista os polos de atendimento ativos, com cidade e estado. Informe a cidade para filtrar.",
    input_schema: { type: "object", properties: { cidade: { type: "string" } } }
  },
  {
    name: "simular_bolsa",
    description:
      "Estimativa da mensalidade com bolsa a partir da mensalidade de tabela do curso. É apenas uma estimativa: a proposta oficial é feita pelo consultor.",
    input_schema: {
      type: "object",
      properties: { curso: { type: "string" }, percentual_bolsa: { type: "number", description: "0 a 90" } },
      required: ["curso", "percentual_bolsa"]
    }
  },
  {
    name: "salvar_lead",
    description:
      "Guarda no cadastro do aluno os dados que ele acabou de informar. Chame sempre que descobrir um dado novo. Devolve o que ainda falta.",
    input_schema: {
      type: "object",
      properties: slotsOf(agent).reduce((acc: any, s) => ({ ...acc, [s.key]: { type: "string", description: s.label } }), {})
    }
  },
  ...functionTools(agent)
];

const like = (text: string) => (isPg() ? { [Op.iLike]: `%${text}%` } : { [Op.like]: `%${text}%` });

const findCourses = (name: string, limit = 5) =>
  Course.findAll({ where: { active: true, name: like(name.trim()) } as any, limit, order: [["name", "ASC"]] });

const money = (n: any) => (n == null ? null : Number(n));

interface Ctx {
  agent: AiAgent;
  ticket: Ticket | null;
  // the agent tester never writes to the database
  dryRun: boolean;
  collected: Record<string, string>;
  // set when a function started a flow: the agent says nothing more
  flowStarted?: boolean;
}

export const runTool = async (name: string, input: any, ctx: Ctx): Promise<any> => {
  input = input || {};
  if (name.startsWith("fluxo_")) {
    const fn = (Array.isArray(ctx.agent.functions) ? ctx.agent.functions : []).find((f: any) => `fluxo_${f.name}` === name);
    if (!fn) return { erro: "Função desconhecida." };
    // the tester never talks to people
    if (ctx.dryRun || !ctx.ticket) return { iniciado: false, aviso: "Simulação: no teste o fluxo não é executado." };
    const { startFlowForTicket } = await import("../FlowServices/Runner");
    const started = await startFlowForTicket(fn.flowId, ctx.ticket.id);
    if (started) ctx.flowStarted = true;
    return started ? { iniciado: true, aviso: "O fluxo assumiu a conversa. Não escreva mais nada agora." } : { iniciado: false, erro: "O fluxo não está publicado." };
  }
  if (name === "buscar_curso") {
    const courses = await findCourses(String(input.nome || ""));
    if (!courses.length) return { encontrados: 0, aviso: "Nenhum curso com esse nome no catálogo." };
    return {
      encontrados: courses.length,
      cursos: courses.map(c => ({
        nome: c.name,
        nivel: c.level,
        modalidade: c.modality,
        semestres: c.semesters,
        mensalidade_bruta_de_tabela: money(c.monthlyFee)
      })),
      aviso: "Valor de tabela. A mensalidade final depende da proposta e não é fixa até o fim do curso."
    };
  }
  if (name === "listar_polos") {
    const city = String(input.cidade || "").trim();
    const polos = await Polo.findAll({ where: { active: true, ...(city ? { city: like(city) } : {}) } as any, order: [["name", "ASC"]], limit: 15 });
    return { polos: polos.map(p => ({ nome: p.name, cidade: p.city, estado: p.state })) };
  }
  if (name === "simular_bolsa") {
    const [course] = await findCourses(String(input.curso || ""), 1);
    if (!course || course.monthlyFee == null) return { erro: "Curso não encontrado ou sem mensalidade cadastrada." };
    const pct = Math.min(90, Math.max(0, Number(input.percentual_bolsa) || 0));
    const gross = Number(course.monthlyFee);
    return {
      curso: course.name,
      mensalidade_bruta: gross,
      bolsa_percentual: pct,
      mensalidade_estimada: Math.round(gross * (1 - pct / 100) * 100) / 100,
      aviso: "Estimativa. A proposta oficial pode variar e a mensalidade não é fixa até o fim do curso."
    };
  }
  if (name === "salvar_lead") {
    const allowed = new Set(slotsOf(ctx.agent).map(s => s.key));
    const saved: string[] = [];
    for (const [key, raw] of Object.entries(input)) {
      const value = String(raw || "").trim().slice(0, 200);
      if (allowed.has(key) && value) {
        ctx.collected[key] = value;
        saved.push(key);
      }
    }
    if (!ctx.dryRun && ctx.ticket && saved.length) {
      await ctx.ticket.update({ aiSlots: ctx.collected });
      await applyToLead(ctx.ticket, ctx.collected);
    }
    const missing = missingSlots(ctx.agent, ctx.collected);
    return { salvo: saved, faltando: missing.map(s => s.label), completo: missing.length === 0 };
  }
  return { erro: "Ferramenta desconhecida." };
};

// Copies what was collected to the lead, only into fields that are still empty.
export const applyToLead = async (ticket: Ticket, c: Record<string, string>): Promise<Lead | null> => {
  const lead = await Lead.findOne({ where: { contactId: ticket.contactId } });
  if (!lead) return null;
  const patch: any = {};
  // the name the student typed beats the WhatsApp profile name
  if (c.nome && c.nome !== lead.name) patch.name = c.nome;
  if (c.email && !lead.email) patch.email = c.email;
  if (c.cidade && !lead.city) patch.city = c.cidade;
  if (c.modalidade && !lead.modality) patch.modality = c.modalidade;
  if (c.forma_ingresso && !lead.admissionType) patch.admissionType = c.forma_ingresso;
  if (c.semestre_transferencia && !lead.entrySemester) {
    const n = Number(String(c.semestre_transferencia).replace(/\D/g, ""));
    if (n > 0) patch.entrySemester = n;
  }
  if (c.curso && !lead.courseId) {
    const [course] = await findCourses(c.curso, 1);
    if (course) patch.courseId = course.id;
    else patch.notes = [lead.notes, `Curso citado: ${c.curso}`].filter(Boolean).join("\n");
  }
  if (c.cidade && !lead.poloId) {
    const polo = await Polo.findOne({ where: { active: true, city: like(c.cidade) } as any });
    if (polo) patch.poloId = polo.id;
  }
  if (Object.keys(patch).length) {
    await lead.update(patch);
    await addActivity(lead.id, null, "system", `Dados informados no atendimento com IA: ${Object.keys(patch).join(", ")}`);
  }
  return lead;
};

export { norm };
