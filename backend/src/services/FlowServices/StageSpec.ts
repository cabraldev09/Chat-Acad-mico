// What the "AI stage" block of a flow holds, and how it is cleaned. The stage is a block where the AI talks with the person
// until a goal is reached: it asks for the fields, uses the tools it is given and leaves through one exit.
export const FIELD_TYPES = ["text", "number", "email", "phone", "choice", "date"] as const;
export const BUILTIN_TOOLS = [
  "buscar_curso", "listar_polos", "simular_bolsa", "buscar_regra_modalidade", "buscar_grade", "buscar_estagio", "consultar_conhecimento", "enviar_material",
  "iniciar_analise_curricular", "consultar_analise_curricular"
] as const;
// server-side steps that run after each turn of the stage (see CommercialServices/Hook)
export const STAGE_HOOKS = ["commercial"] as const;
// exits every stage has (the three last ones fall back to a handoff to the team when they are not connected)
export const FIXED_EXITS = ["done", "human", "off", "limit"] as const;

export interface StageField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
  // how the AI should ask for it ("pergunte a cidade onde a pessoa quer estudar")
  ask?: string;
}
export interface StageOutcome {
  id: string;
  label: string;
  // in the person's words: when the AI must take this exit
  when: string;
}
export interface HttpParam {
  name: string;
  description: string;
  type: string;
  required: boolean;
}
export interface HttpTool {
  name: string;
  description: string;
  url: string;
  method: string;
  params: HttpParam[];
  // a header sent with every call (an API key), kept in the block
  headerName?: string;
  headerValue?: string;
}
export interface StageData {
  title: string;
  objective: string;
  instructions: string;
  opening: string;
  fields: StageField[];
  tools: string[];
  http: HttpTool[];
  useKnowledge: boolean;
  maxTurns: number;
  outcomes: StageOutcome[];
  // the AI agent whose persona, model and knowledge this stage uses (empty: the one of the flow, else the one for the ticket)
  agentId?: number | null;
  // code that runs after each turn (the commercial funnel) and how many turns of the conversation the AI reads
  hooks: string[];
  historyTurns: number;
}

export const slug = (s: any, max = 30): string =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);

const clip = (v: any, n: number): string => String(v ?? "").trim().slice(0, n);

// the data of a stage as the engine and the AI will read it: only known things, with sane sizes
export const cleanStage = (raw: any): StageData => {
  const d = raw || {};
  const seen = new Set<string>();
  const fields: StageField[] = (Array.isArray(d.fields) ? d.fields : [])
    .slice(0, 12)
    .map((f: any) => {
      const key = slug(f?.key || f?.label, 30);
      const type = (FIELD_TYPES as readonly string[]).includes(f?.type) ? String(f.type) : "text";
      return {
        key,
        label: clip(f?.label || key, 60),
        type,
        required: !!f?.required,
        ...(type === "choice" ? { options: (Array.isArray(f?.options) ? f.options : []).map((o: any) => clip(o, 40)).filter(Boolean).slice(0, 12) } : {}),
        ...(clip(f?.ask, 160) ? { ask: clip(f.ask, 160) } : {})
      } as StageField;
    })
    .filter((f: StageField) => f.key && !seen.has(f.key) && !!seen.add(f.key));
  const ids = new Set<string>();
  const outcomes: StageOutcome[] = (Array.isArray(d.outcomes) ? d.outcomes : [])
    .slice(0, 8)
    .map((o: any) => ({ id: slug(o?.id || o?.label, 30), label: clip(o?.label, 60), when: clip(o?.when, 200) }))
    .filter((o: StageOutcome) => o.id && !(FIXED_EXITS as readonly string[]).includes(o.id) && !ids.has(o.id) && !!ids.add(o.id));
  const names = new Set<string>();
  const http: HttpTool[] = (Array.isArray(d.http) ? d.http : [])
    .slice(0, 5)
    .map((t: any) => ({
      name: slug(t?.name, 30),
      description: clip(t?.description, 300),
      url: clip(t?.url, 500),
      method: String(t?.method || "GET").toUpperCase() === "POST" ? "POST" : "GET",
      params: (Array.isArray(t?.params) ? t.params : [])
        .slice(0, 8)
        .map((p: any) => ({ name: slug(p?.name, 30), description: clip(p?.description, 120), type: ["string", "number"].includes(p?.type) ? p.type : "string", required: !!p?.required }))
        .filter((p: HttpParam) => p.name),
      ...(clip(t?.headerName, 60) && clip(t?.headerValue, 300) ? { headerName: clip(t.headerName, 60).replace(/[^A-Za-z0-9-]/g, ""), headerValue: clip(t.headerValue, 300) } : {})
    }))
    .filter((t: HttpTool) => t.name && !names.has(t.name) && !!names.add(t.name));
  return {
    title: clip(d.title, 60),
    objective: clip(d.objective, 600),
    instructions: clip(d.instructions, 2000),
    opening: clip(d.opening, 500),
    fields,
    tools: (Array.isArray(d.tools) ? d.tools : []).filter((t: any) => (BUILTIN_TOOLS as readonly string[]).includes(t)),
    http,
    useKnowledge: d.useKnowledge !== false,
    maxTurns: Math.min(50, Math.max(1, Math.round(Number(d.maxTurns) || 12))),
    outcomes,
    agentId: Number(d.agentId) > 0 ? Number(d.agentId) : null,
    hooks: (Array.isArray(d.hooks) ? d.hooks : []).filter((h: any) => (STAGE_HOOKS as readonly string[]).includes(h)),
    historyTurns: Math.min(12, Math.max(2, Math.round(Number(d.historyTurns) || 6)))
  };
};

// the value of a field, in the shape its type asks for (null when it does not fit)
export const checkField = (f: StageField, raw: any): string | null => {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  switch (f.type) {
    case "email": return /^\S+@\S+\.\S+$/.test(v) ? v.toLowerCase().slice(0, 120) : null;
    case "phone": return v.replace(/\D/g, "").length >= 10 ? v.replace(/\D/g, "").slice(0, 15) : null;
    case "number": return /\d/.test(v) ? v.replace(/[^\d.,-]/g, "").slice(0, 20) : null;
    case "date": return /\d/.test(v) ? v.slice(0, 40) : null;
    case "choice": {
      const opt = (f.options || []).find(o => o.toLowerCase() === v.toLowerCase());
      return opt || null;
    }
    default: return v.slice(0, 200);
  }
};
