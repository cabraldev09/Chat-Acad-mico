import Course from "../../models/Course";
import Lead from "../../models/Lead";
import LeadCommercial from "../../models/LeadCommercial";
import Polo from "../../models/Polo";

// Everything the commercial agent knows about a lead, kept in one place and never asked again. The state lives in the database
// (not in the conversation): a lead that comes back tomorrow goes on from where it stopped.
export const ENTRY_TYPES = ["first_degree", "transfer", "second_degree", "unknown"] as const;
export const ANALYSIS_STATUS = ["not_applicable", "waiting_document", "requested", "in_progress", "completed"] as const;
export const TEMPERATURES = ["cold", "warm", "hot"] as const;
export const NEXT_ACTIONS = [
  "identify_entry_type", "identify_city", "present_course", "explain_modality", "send_curriculum", "wait_transcript", "request_analysis",
  "wait_analysis", "explain_analysis", "answer_objection", "generate_proposal", "follow_up", "human_service", "close_lost"
] as const;

type Kind = "string" | "number" | "boolean" | "entry" | "analysis" | "temperature" | "object";
// the slots and the kind of each one: what goes in is cleaned by it
export const SLOT_KINDS: Record<string, Kind> = {
  leadId: "number", leadName: "string", phone: "string", email: "string", city: "string", state: "string", poloId: "number", poloName: "string", poloStatus: "string",
  courseId: "number", courseName: "string", offerId: "number", intakePeriod: "string",
  entryType: "entry", hasHigherEducation: "boolean", previousCourse: "string", previousInstitution: "string", hasTranscript: "boolean",
  courseDegree: "string", courseDurationSemesters: "number", courseDurationText: "string", courseModality: "string",
  courseExplained: "boolean", mecImpacted: "boolean", mecExplained: "boolean", modalityExplained: "boolean", modalityUnderstood: "boolean",
  gradeId: "number", gradeVersion: "string", gradeSent: "boolean", gradeAsked: "boolean",
  hasInternship: "boolean", internshipExplained: "boolean", internshipSummary: "string", hasTcc: "boolean", tccExplained: "boolean",
  platformExplained: "boolean", tutoringExplained: "boolean", facultyExplained: "boolean",
  analysisStatus: "analysis", analysisId: "number", analysisExplained: "boolean", semesterEntry: "number", subjectsWaived: "number", subjectsRemaining: "number", adaptations: "string", estimatedCompletion: "string",
  mainQuestion: "string", mainObjection: "string", unknownQuestion: "string",
  // what the screening found out beyond the basics (all optional, asked lightly, never as an interrogation)
  shift: "string", decisionTimeline: "string", motivation: "string", bestTime: "string", worksAndStudies: "boolean", financing: "string",
  objectionType: "string", objectionCount: "number", objectionsSeen: "string",
  leadTemperature: "temperature", commercialScore: "number", readyForProposal: "boolean", crmStage: "string", nextAction: "string",
  followUpReason: "string", commercialSummary: "string", lastIntent: "string", lastInboundAt: "string", lastOutboundAt: "string",
  // the intents already seen (scoring and temperature count each one once)
  intentsSeen: "string",
  // control of the agent itself: questions without an answer in a row, voice notes asked in writing, the last brief written, what the CRM held
  // the data the consultant needs to simulate the scholarship: the full name, whether a valid CPF arrived (the CPF itself lives only in the lead) and how many times it was asked
  fullName: "string", cpfGiven: "boolean", bolsaDataAsked: "number",
  // a contact who is already a student: for whom is the question, and what they already know
  // a student who needs the tutoring or the secretary: what was asked, whether the city was asked (once) before the team of the polo is called
  supportNeed: "string", supportCityAsked: "number", supportKind: "string",
  enrolledChecked: "boolean", enrolledStudent: "boolean", enrolledCourse: "string", studentSemipresencial: "boolean", forWhom: "string",
  unknownStreak: "number", audioAsked: "number", qualifiedReplies: "number", readyForConsultant: "boolean", nudges: "number", nudgeAt: "string", lastBriefHash: "string", crmSeen: "object"
};

export type Slots = Record<string, any>;

export const defaultSlots = (): Slots => ({ entryType: "unknown", analysisStatus: "not_applicable", leadTemperature: "cold", commercialScore: 0, readyForProposal: false });

const clean = (kind: Kind, v: any): any => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  switch (kind) {
    case "number": { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
    case "boolean": return v === true || v === "true" || v === "sim" || v === 1;
    case "entry": return (ENTRY_TYPES as readonly string[]).includes(v) ? v : undefined;
    case "analysis": return (ANALYSIS_STATUS as readonly string[]).includes(v) ? v : undefined;
    case "temperature": return (TEMPERATURES as readonly string[]).includes(v) ? v : undefined;
    case "object": return v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
    default: return String(v).trim().slice(0, 400);
  }
};

// a patch of slots, cleaned: only known slots, values of the right kind
export const cleanPatch = (patch: Record<string, any> | null | undefined): Slots => {
  const out: Slots = {};
  Object.entries(patch || {}).forEach(([k, v]) => {
    const kind = SLOT_KINDS[k];
    if (!kind) return;
    const value = clean(kind, v);
    if (value !== undefined) out[k] = value;
  });
  return out;
};

export interface CommercialState {
  leadId: number;
  agentId: number | null;
  flowId: number | null;
  slots: Slots;
  temperature: string;
  commercialScore: number;
  readyForProposal: boolean;
  nextAction: string | null;
  lastIntent: string | null;
  followUpReason: string | null;
  followUpAt: Date | null;
  summary: string | null;
  stageKey: string | null;
  lastNoteHash: string | null;
  // the slots as they were loaded: saving writes only what this turn changed, so a worker that updated the lead meanwhile is not erased
  loaded?: Slots;
}

export const blankState = (leadId: number): CommercialState => ({
  leadId, agentId: null, flowId: null, slots: defaultSlots(), temperature: "cold", commercialScore: 0, readyForProposal: false,
  nextAction: null, lastIntent: null, followUpReason: null, followUpAt: null, summary: null, stageKey: null, lastNoteHash: null
});

const parse = (raw: string | null | undefined): Slots => {
  try { return { ...defaultSlots(), ...cleanPatch(JSON.parse(raw || "{}")) }; } catch (e) { return defaultSlots(); }
};

const fromRow = (row: LeadCommercial): CommercialState => ({
  leadId: row.leadId, agentId: row.agentId || null, flowId: row.flowId || null, slots: parse(row.slots), temperature: row.temperature || "cold",
  commercialScore: row.commercialScore || 0, readyForProposal: !!row.readyForProposal, nextAction: row.nextAction || null, lastIntent: row.lastIntent || null,
  followUpReason: row.followUpReason || null, followUpAt: row.followUpAt || null, summary: row.summary || null, stageKey: row.stageKey || null, lastNoteHash: row.lastNoteHash || null
});

export const loadState = async (leadId: number): Promise<CommercialState> => {
  const row = await LeadCommercial.findOne({ where: { leadId } });
  const state = row ? fromRow(row) : blankState(leadId);
  state.loaded = JSON.parse(JSON.stringify(state.slots));
  return state;
};

// the columns the CRM reads are also copied into the slots, so the model and the tools see one picture
export const mirror = (s: CommercialState): Slots => ({
  ...s.slots,
  leadTemperature: s.temperature, commercialScore: s.commercialScore, readyForProposal: s.readyForProposal, nextAction: s.nextAction, lastIntent: s.lastIntent,
  followUpReason: s.followUpReason, commercialSummary: s.summary, crmStage: s.stageKey
});

export const saveState = async (s: CommercialState): Promise<void> => {
  const values: any = {
    agentId: s.agentId, flowId: s.flowId, slots: JSON.stringify(mirror(s)), temperature: s.temperature, commercialScore: s.commercialScore, readyForProposal: s.readyForProposal, readyForConsultant: !!s.slots.readyForConsultant,
    nextAction: s.nextAction, lastIntent: s.lastIntent, followUpReason: s.followUpReason ? s.followUpReason.slice(0, 300) : null, followUpAt: s.followUpAt,
    summary: s.summary, stageKey: s.stageKey, lastNoteHash: s.lastNoteHash, lastInboundAt: s.slots.lastInboundAt ? new Date(s.slots.lastInboundAt) : null,
    lastOutboundAt: s.slots.lastOutboundAt ? new Date(s.slots.lastOutboundAt) : null
  };
  const row = await LeadCommercial.findOne({ where: { leadId: s.leadId } });
  if (row) {
    // only the slots this turn changed go over what is in the database now (the analysis may have finished meanwhile)
    if (s.loaded) {
      const fresh = parse(row.slots);
      const merged: Slots = { ...fresh };
      Object.keys(s.slots).forEach(k => { if (JSON.stringify(s.slots[k]) !== JSON.stringify(s.loaded![k])) merged[k] = s.slots[k]; });
      s.slots = merged;
      values.slots = JSON.stringify(mirror(s));
    }
    await row.update(values);
  } else await LeadCommercial.create({ leadId: s.leadId, ...values } as any);
  s.loaded = JSON.parse(JSON.stringify(s.slots));
};

// the entry type the CRM already knows (the field "forma de ingresso" of the lead)
export const entryTypeOfAdmission = (admissionType?: string | null): string | null => {
  const a = String(admissionType || "").toLowerCase();
  if (!a) return null;
  if (a.includes("transfer") || a.includes("aproveitamento")) return "transfer";
  if (a.includes("2ª") || a.includes("2a gradua") || a.includes("portador")) return "second_degree";
  if (a.includes("vestibular") || a.includes("enem")) return "first_degree";
  return null;
};

// what the CRM already holds about the lead becomes slots (without overwriting what the conversation found out)
export const hydrate = async (state: CommercialState, lead: Lead): Promise<CommercialState> => {
  const course = lead.courseId ? await Course.findByPk(lead.courseId, { attributes: ["id", "name", "modality", "level", "semesters"] }) : null;
  const polo = lead.poloId ? await Polo.findByPk(lead.poloId, { attributes: ["id", "name", "city"] }) : null;
  const known = (k: string) => state.slots[k] !== undefined && state.slots[k] !== null && state.slots[k] !== "";
  const patch: Slots = {};
  // what the CRM held the last time we looked: a value that changed since then was edited by a person and wins over the conversation
  const seen: Record<string, any> = state.slots.crmSeen && typeof state.slots.crmSeen === "object" ? state.slots.crmSeen : {};
  const crm: Record<string, any> = { leadName: lead.name, email: lead.email, city: lead.city, courseId: course ? course.id : null, poloId: polo ? polo.id : null };
  const edited = (k: string): boolean => crm[k] !== null && crm[k] !== undefined && crm[k] !== "" && seen[k] !== undefined && crm[k] !== seen[k] && crm[k] !== state.slots[k];
  const set = (k: string, v: any) => { if (v !== undefined && v !== null && v !== "" && (!known(k) || edited(k === "courseName" ? "courseId" : k === "poloName" ? "poloId" : k))) patch[k] = v; };
  set("leadId", lead.id);
  set("leadName", lead.name);
  set("phone", lead.phone);
  set("email", lead.email);
  set("city", lead.city);
  set("state", lead.state);
  set("intakePeriod", lead.entryTerm);
  if (course) {
    const changedCourse = edited("courseId");
    set("courseId", course.id); set("offerId", course.id); set("courseName", course.name); set("courseModality", course.modality); set("courseDurationSemesters", course.semesters); set("courseDegree", course.level);
    // another course: what was explained about the old one does not count for the new one
    if (changedCourse) Object.assign(patch, { courseExplained: false, modalityExplained: false, mecExplained: false, internshipExplained: false, gradeSent: false });
  }
  if (polo) { set("poloId", polo.id); set("poloName", polo.name); set("city", polo.city); }
  const entry = entryTypeOfAdmission(lead.admissionType);
  if (entry && (!state.slots.entryType || state.slots.entryType === "unknown")) patch.entryType = entry;
  return { ...state, slots: { ...state.slots, ...cleanPatch(patch), crmSeen: crm } };
};
