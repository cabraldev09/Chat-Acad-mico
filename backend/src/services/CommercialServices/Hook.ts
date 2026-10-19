import { AuditLine, CommercialPorts } from "./Ports";
import { canAutoMove, confirmsNoInterest, hashOf, nextActionOf, noteOf, scoreOf, targetStageKey, temperatureOf } from "./Rules";
import { STAGE_SPECS, StageKey } from "./Pipeline";
import { cleanPatch } from "./Slots";

// After every turn of the AI the system updates the lead by itself. The model only brought what it understood (the intent, the
// data the person gave); here the state, the score, the temperature, the next action, the column of the CRM, the tasks, the note and the
// milestones are decided by rules. The result of this function is the same wherever it runs (the real CRM or the simulator).
export interface TurnInput {
  userText: string;
  intent?: string | null;
  // the system itself recognised the intent (a request for a person, a price): no model was called
  fast?: "human" | "price" | "enrollment" | "proposal" | null;
  // slots the model (registrar_turno) or a tool found
  patch?: Record<string, any>;
  tools: string[];
  // the system said something in this turn
  hadText: boolean;
  // the person wrote (the opening of a stage is not a reply)
  replied: boolean;
  followUp?: { reason?: string | null; at?: string | null } | null;
  unknownQuestion?: string | null;
  objection?: string | null;
  question?: string | null;
  // the subjects of the knowledge base the answer came from
  topics?: string[];
  firstContactSent?: boolean;
  // the block of the flow where it happened (for the gaps in the knowledge base)
  nodeId?: string | null;
  now?: Date;
}

export interface CommercialTrace {
  intent: string | null;
  changed: Record<string, [any, any]>;
  crmBefore: string | null;
  crmAfter: string | null;
  actions: AuditLine[];
  temperature: string;
  score: number;
  nextAction: string | null;
  readyForProposal: boolean;
}

const TOPIC_FLAG: Record<string, string> = {
  "institutional/platform": "platformExplained", "institutional/tutoring": "tutoringExplained", "institutional/faculty": "facultyExplained"
};

const parseDate = (v?: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const commercialTurn = async (ports: CommercialPorts, input: TurnInput): Promise<{ exit: string | null; trace: CommercialTrace }> => {
  const now = input.now || new Date();
  const s = ports.state;
  const before: Record<string, any> = { ...s.slots, temperature: s.temperature, commercialScore: s.commercialScore, nextAction: s.nextAction, readyForProposal: s.readyForProposal };
  const crmBefore = await ports.stageKeyNow();

  // 1) what was found out
  const patch = cleanPatch(input.patch);
  s.slots = { ...s.slots, ...patch };
  const used = new Set(input.tools);
  if (input.hadText) {
    if (used.has("buscar_curso")) s.slots.courseExplained = true;
    if (used.has("buscar_regra_modalidade")) { s.slots.modalityExplained = true; if (s.slots.mecImpacted) s.slots.mecExplained = true; }
    if (used.has("buscar_estagio")) s.slots.internshipExplained = true;
    (input.topics || []).forEach(t => { if (TOPIC_FLAG[t]) s.slots[TOPIC_FLAG[t]] = true; });
  }
  if (input.replied) s.slots.lastInboundAt = now.toISOString();
  if (input.hadText) s.slots.lastOutboundAt = now.toISOString();
  if (input.objection) s.slots.mainObjection = String(input.objection).slice(0, 200);
  if (input.question) s.slots.mainQuestion = String(input.question).slice(0, 200);
  if (input.unknownQuestion) s.slots.unknownQuestion = String(input.unknownQuestion).slice(0, 300);
  if (s.slots.hasTranscript && s.slots.analysisStatus === "not_applicable") s.slots.analysisStatus = "waiting_document";
  if ((s.slots.entryType === "transfer" || s.slots.entryType === "second_degree") && !s.slots.hasTranscript && s.slots.analysisStatus === "not_applicable") s.slots.analysisStatus = "waiting_document";

  // 2) the intent: what the system recognised wins over the model
  const intent = input.fast || input.intent || null;
  s.lastIntent = intent;
  const seen = new Set(String(s.slots.intentsSeen || "").split(",").filter(Boolean));
  if (intent) seen.add(intent);
  s.slots.intentsSeen = [...seen].join(",");
  if (intent === "curriculum") s.slots.gradeAsked = true;
  if (intent === "paid_internship") s.slots.internshipExplained = s.slots.internshipExplained || input.hadText;

  // 3) the moments that matter
  const wantsProposal = intent === "price" || intent === "enrollment" || intent === "proposal";
  if (wantsProposal) s.readyForProposal = true;
  const human = intent === "human";
  const followUp = intent === "follow_up";
  const noInterest = intent === "no_interest" && confirmsNoInterest(input.userText);
  if (followUp) {
    s.followUpReason = (input.followUp?.reason || "Pediu um tempo para pensar").slice(0, 300);
    s.followUpAt = parseDate(input.followUp?.at);
  }
  if (noInterest) s.followUpReason = (input.followUp?.reason || input.userText || "Sem interesse").slice(0, 300);

  // 4) score, temperature, next action, summary
  const { score, ledger } = scoreOf(s.slots, s.readyForProposal, intent);
  s.slots.intentsSeen = [...new Set([...(String(s.slots.intentsSeen || "").split(",").filter(Boolean)), ...ledger])].join(",");
  s.commercialScore = score;
  s.temperature = temperatureOf(s.slots, s.readyForProposal);
  s.nextAction = nextActionOf(s, { human, lost: noInterest });
  s.summary = noteOf(s);

  // 5) the funnel
  const target = targetStageKey(s, { intent, replied: input.replied, firstContactSent: input.firstContactSent, human, followUp, noInterest });
  if (input.firstContactSent) await ports.markContact("out");
  let moved = false;
  if (target && canAutoMove(crmBefore, target)) moved = await ports.moveStage(target as StageKey, STAGE_SPECS[target as StageKey] ? `${intent || "andamento do atendimento"}` : "andamento do atendimento");
  const crmAfter = moved ? (target as StageKey) : crmBefore;
  if (crmAfter) s.stageKey = crmAfter;

  // 6) tasks (one per reason) and the note (only when it changed)
  if (s.readyForProposal) await ports.task("proposal:ready", "Gerar e apresentar proposta", new Date(now.getTime() + 60 * 60000), "proposta");
  if (target === "waiting_transcript" || nextActionOf(s) === "wait_transcript") await ports.task("transcript:wait", "Aguardar histórico acadêmico", new Date(now.getTime() + 2 * 86400000), "documentos");
  if (followUp && s.followUpAt) await ports.task(`follow_up:${s.followUpAt.toISOString().slice(0, 10)}`, `Retomar contato: ${s.followUpReason}`, s.followUpAt, "whatsapp");
  const note = s.summary || "";
  if (note && hashOf(note) !== s.lastNoteHash) {
    await ports.note(note);
    s.lastNoteHash = hashOf(note);
  }

  // 7) the milestones of the funnel (each counts once per lead)
  if (input.firstContactSent) await ports.event("contact_started");
  if (input.replied) await ports.event("replied");
  if (s.slots.courseExplained && (s.slots.courseId || s.slots.courseName) && (s.slots.city || s.slots.poloId) && s.slots.entryType !== "unknown") await ports.event("qualified");
  if (s.slots.entryType === "transfer") await ports.event("transfer");
  if (s.slots.entryType === "second_degree") await ports.event("second_degree");
  if (s.slots.analysisStatus === "requested" || s.slots.analysisStatus === "in_progress" || s.slots.analysisStatus === "completed") await ports.event("analysis_requested");
  if (s.slots.analysisStatus === "completed") await ports.event("analysis_completed");
  if (s.readyForProposal) await ports.event("ready_for_proposal");
  if (followUp) await ports.event("follow_up");
  if (noInterest) await ports.event("no_interest");
  if (human) await ports.event("human_handoff");
  if (input.unknownQuestion || intent === "unknown") await ports.event("unknown", { question: s.slots.unknownQuestion, courseId: s.slots.courseId || null, stage: input.nodeId || null, intent, at: now.toISOString() }, false);
  if (input.fast) await ports.event("deterministic_reply", { intent: input.fast }, false);
  await ports.save();

  // 8) the way out of the stage, when there is a reason for it
  let exit: string | null = null;
  if (human) exit = "human";
  else if (noInterest) exit = "sem_interesse";
  else if (s.readyForProposal) exit = "proposta";
  else if (followUp) exit = "follow_up";
  else if (input.unknownQuestion || intent === "unknown") exit = "off";

  const changed: Record<string, [any, any]> = {};
  const after: Record<string, any> = { ...s.slots, temperature: s.temperature, commercialScore: s.commercialScore, nextAction: s.nextAction, readyForProposal: s.readyForProposal };
  Object.keys(after).forEach(k => { if (k !== "intentsSeen" && JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed[k] = [before[k] ?? null, after[k] ?? null]; });
  return {
    exit,
    trace: { intent, changed, crmBefore, crmAfter, actions: ports.audit.splice(0), temperature: s.temperature, score: s.commercialScore, nextAction: s.nextAction, readyForProposal: s.readyForProposal }
  };
};
