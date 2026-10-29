// What the administrator can adjust in the commercial attendance, kept in the persona of the agent (so every change goes to the history of the agent
// and can be restored). Nothing here is required: a missing value is the behaviour the agent always had.
export const QUALIFY_FIELDS = ["course", "city", "entry", "explained"] as const;
export type QualifyField = typeof QUALIFY_FIELDS[number];

export interface CommercialConfig {
  // the first answer when the person only says hello; empty = the adaptive default. {{nome}} and {{assistente}} are filled in
  greeting: string;
  // what the agent may ask (when the CRM or the conversation already has it, it is never asked again)
  ask: { name: boolean; course: boolean; city: boolean; entry: boolean; modality: boolean; mainQuestion: boolean };
  // what makes a lead "qualified" (the agent hands it over after a few answers once all of these are known)
  qualifyRequires: QualifyField[];
  // answers a qualified lead still gets before the consultant takes over; null = the company's setting (ai_qualified_replies)
  qualifyAfter: number | null;
  // intent: the person asks for the price, the enrollment or a proposal (default); hot: also any lead whose temperature turned hot
  hotHandoff: "intent" | "hot";
  // unclear or unanswerable messages in a row before a person takes over
  maxClarifications: number;
  // the lead keeps the consultant who already served them when that person belongs to the team
  keepOwner: boolean;
  messages: { queued: string; afterHours: string };
}

export const DEFAULT_COMMERCIAL: CommercialConfig = {
  greeting: "",
  ask: { name: true, course: true, city: true, entry: true, modality: true, mainQuestion: true },
  qualifyRequires: ["course", "city", "entry", "explained"],
  qualifyAfter: null,
  hotHandoff: "intent",
  maxClarifications: 3,
  keepOwner: true,
  messages: { queued: "", afterHours: "" }
};

const bool = (v: any, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const text = (v: any, max: number): string => String(v ?? "").trim().slice(0, max);

// what is saved: only the known keys, each cleaned (a value that makes no sense falls back to the default)
export const cleanCommercial = (raw: any): CommercialConfig => {
  const c = raw && typeof raw === "object" ? raw : {};
  const ask = c.ask && typeof c.ask === "object" ? c.ask : {};
  const required = Array.isArray(c.qualifyRequires) ? (c.qualifyRequires as any[]).filter((k): k is QualifyField => (QUALIFY_FIELDS as readonly string[]).includes(k)) : DEFAULT_COMMERCIAL.qualifyRequires;
  const after = c.qualifyAfter === null || c.qualifyAfter === undefined || c.qualifyAfter === "" ? null : Number(c.qualifyAfter);
  const max = Number(c.maxClarifications);
  const msgs = c.messages && typeof c.messages === "object" ? c.messages : {};
  return {
    greeting: text(c.greeting, 400),
    ask: {
      name: bool(ask.name, true), course: bool(ask.course, true), city: bool(ask.city, true), entry: bool(ask.entry, true), modality: bool(ask.modality, true), mainQuestion: bool(ask.mainQuestion, true)
    },
    qualifyRequires: [...new Set(required)],
    qualifyAfter: after !== null && Number.isFinite(after) && after >= 0 && after <= 10 ? Math.floor(after) : null,
    hotHandoff: c.hotHandoff === "hot" ? "hot" : "intent",
    maxClarifications: Number.isFinite(max) && max >= 1 && max <= 6 ? Math.floor(max) : DEFAULT_COMMERCIAL.maxClarifications,
    keepOwner: bool(c.keepOwner, true),
    messages: { queued: text(msgs.queued, 500), afterHours: text(msgs.afterHours, 500) }
  };
};

export const configOf = (agent: { persona?: any } | null | undefined): CommercialConfig => cleanCommercial(agent && agent.persona ? agent.persona.commercial : null);

// "Maria" and "Estela" in the greeting written by the administrator
export const fillGreeting = (greeting: string, name: string, assistant: string): string =>
  greeting.replace(/\{\{\s*nome\s*\}\}/gi, name).replace(/\{\{\s*assistente\s*\}\}/gi, assistant);
