import { AuditLine, CommercialPorts } from "./Ports";
import { OBJECTION_LIMIT, canAutoMove, confirmsNoInterest, hashOf, intentLabel, interestOf, INTEREST_LABEL, isQualified, missingOf, nextActionOf, noteOf, readyForConsultantOf, scoreOf, targetStageKey, temperatureOf } from "./Rules";
import { STAGE_SPECS, StageKey } from "./Pipeline";
import { cleanPatch } from "./Slots";
import { defaultFollowUp, parseFollowUp, ymdOf } from "./Hours";

// After every turn of the AI the system updates the lead by itself. The model only brought what it understood (the intent, the
// data the person gave); here the state, the score, the temperature, the next action, the column of the CRM, the tasks, the note and the
// milestones are decided by rules. The result of this function is the same wherever it runs (the real CRM or the simulator).
export interface TurnInput {
  userText: string;
  intent?: string | null;
  // the system itself recognised the intent (a request for a person, a price): no model was called
  fast?: "human" | "price" | "enrollment" | "proposal" | "tutoring" | "secretary" | null;
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
  // the lead already has a polo (the team of the tutoring or of the secretary is found by it)
  hasPolo?: boolean;
  // the answer of this turn ends with a question: the person has something to answer before anyone takes over
  endsWithQuestion?: boolean;
  // the person took back the interest in buying ("ainda não vou me matricular")
  retract?: boolean;
  // a step of the checklist of the stage is still pending: the happy-path exits (proposal, qualified handover) wait for it
  stepsPending?: boolean;
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
  // why each thing happened, in plain words (the timeline of the tester reads this)
  reasons: string[];
  // the column of the CRM now, by name
  stageName?: string | null;
  // what is still missing for the lead to be qualified
  missing: string[];
  // the way out of the stage chosen in this turn and why (null: the conversation goes on)
  exitWhy: string | null;
}

const TOPIC_FLAG: Record<string, string> = {
  "institutional/platform": "platformExplained", "institutional/tutoring": "tutoringExplained", "institutional/faculty": "facultyExplained"
};


export const commercialTurn = async (ports: CommercialPorts, input: TurnInput): Promise<{ exit: string | null; why?: string; ask?: "city"; trace: CommercialTrace }> => {
  const now = input.now || new Date();
  const s = ports.state;
  const reasons: string[] = [];
  const before: Record<string, any> = { ...s.slots, temperature: s.temperature, commercialScore: s.commercialScore, nextAction: s.nextAction, readyForProposal: s.readyForProposal };
  const crmBefore = await ports.stageKeyNow();

  // 1) what was found out
  // the catalogue and the polos recognise the course and the city in the words of the person; what the model brings explicitly wins
  const auto = input.replied && ports.detect ? cleanPatch(await ports.detect(input.userText).catch(() => ({}))) : {};
  Object.entries(auto).forEach(([k, v]) => {
    if (v && JSON.stringify(s.slots[k]) !== JSON.stringify(v) && (k === "courseName" || k === "city")) reasons.push(k === "courseName" ? `Curso reconhecido na mensagem: ${v}.` : `Cidade reconhecida na mensagem: ${v}.`);
  });
  const patch = { ...auto, ...cleanPatch(input.patch) };
  s.slots = { ...s.slots, ...patch };
  const used = new Set(input.tools);
  // what the person wants, read from their words and revised at each message (a person who said "quero me matricular" and later asks about the grade is still a prospect)
  if (input.replied) {
    const kind = interestOf(input.userText, s.slots);
    if (kind && kind !== s.slots.interestKind) {
      reasons.push(`Interesse identificado: ${INTEREST_LABEL[kind]}.`);
      s.slots.interestKind = kind;
    }
    if (!s.slots.interestKind && !kind && (s.slots.courseId || s.slots.courseName)) { s.slots.interestKind = "graduacao"; reasons.push(`Interesse identificado: ${INTEREST_LABEL.graduacao} (curso informado).`); }
    if (kind === "transferencia" && (!s.slots.entryType || s.slots.entryType === "unknown")) s.slots.entryType = "transfer";
    if (kind === "segunda_graduacao" && (!s.slots.entryType || s.slots.entryType === "unknown")) s.slots.entryType = "second_degree";
  }
  if (input.hadText) {
    if (used.has("buscar_curso")) s.slots.courseExplained = true;
    if (used.has("buscar_regra_modalidade")) { s.slots.modalityExplained = true; if (s.slots.mecImpacted) s.slots.mecExplained = true; }
    if (used.has("buscar_estagio")) s.slots.internshipExplained = true;
    if (used.has("consultar_analise_curricular") && s.slots.analysisStatus === "completed") s.slots.analysisExplained = true;
    (input.topics || []).forEach(t => { if (TOPIC_FLAG[t]) s.slots[TOPIC_FLAG[t]] = true; });
  }
  if (input.replied) s.slots.lastInboundAt = now.toISOString();
  if (input.hadText) s.slots.lastOutboundAt = now.toISOString();
  if (input.objection) {
    s.slots.mainObjection = String(input.objection).slice(0, 200);
    // each objection counts once per message; the kinds that came up are kept for the consultant
    if (input.replied) {
      s.slots.objectionCount = Number(s.slots.objectionCount || 0) + 1;
      const kinds = new Set(String(s.slots.objectionsSeen || "").split(",").filter(Boolean));
      if (s.slots.objectionType) kinds.add(String(s.slots.objectionType));
      s.slots.objectionsSeen = [...kinds].join(",");
    }
  }
  // the person wrote back: the silence reminders start over
  if (input.replied) s.slots.nudges = 0;
  if (input.question) s.slots.mainQuestion = String(input.question).slice(0, 200);
  if (input.unknownQuestion) s.slots.unknownQuestion = String(input.unknownQuestion).slice(0, 300);
  if (s.slots.hasTranscript && s.slots.analysisStatus === "not_applicable") s.slots.analysisStatus = "waiting_document";
  if ((s.slots.entryType === "transfer" || s.slots.entryType === "second_degree") && !s.slots.hasTranscript && s.slots.analysisStatus === "not_applicable") s.slots.analysisStatus = "waiting_document";

  // 2) the intent: what the system recognised wins over the model
  // (a student who needs the team of the polo is "support_*": "tutoring" alone is a prospect asking how the tutoring works)
  const intent = input.fast === "tutoring" ? "support_tutoring" : input.fast === "secretary" ? "support_secretary" : input.fast || input.intent || null;
  s.lastIntent = intent;
  if (intent) reasons.push(input.fast ? `Intenção reconhecida pelo sistema: ${intentLabel(intent)} (resposta sem modelo de IA).` : `Intenção entendida pelo modelo: ${intentLabel(intent)}.`);
  // three questions in a row that the base does not answer: a person should take it
  if (input.replied && (intent === "unknown" || input.unknownQuestion)) s.slots.unknownStreak = Number(s.slots.unknownStreak || 0) + 1;
  else if (input.replied && intent) s.slots.unknownStreak = 0;
  const seen = new Set(String(s.slots.intentsSeen || "").split(",").filter(Boolean));
  if (intent) seen.add(intent);
  s.slots.intentsSeen = [...seen].join(",");
  if (intent === "curriculum") s.slots.gradeAsked = true;
  if (intent === "paid_internship") s.slots.internshipExplained = s.slots.internshipExplained || input.hadText;

  // a qualified lead who keeps talking is counted: after a couple of answers the consultant of the polo takes over (see readyForConsultantOf)
  const requires = ports.config ? ports.config.qualifyRequires : undefined;
  if (input.replied && isQualified(s.slots, requires)) s.slots.qualifiedReplies = Number(s.slots.qualifiedReplies || 0) + 1;
  s.slots.readyForConsultant = readyForConsultantOf(s.slots, Number(s.slots.qualifiedReplies || 0), ports.qualifyAfter, requires);

  // 3) the moments that matter
  const wantsProposal = intent === "price" || intent === "enrollment" || intent === "proposal";
  if (input.retract && !wantsProposal) s.readyForProposal = false;
  if (wantsProposal) s.readyForProposal = true;
  const human = intent === "human";
  // a student who needs the tutoring or the secretary: the team of the polo takes it (not the sales team). The city is asked once when the polo is not known
  let supportExit: string | null = null;
  let ask: "city" | undefined;
  if (input.replied) {
    if (intent === "support_tutoring") s.slots.supportNeed = "tutoring";
    else if (intent === "support_secretary") s.slots.supportNeed = "secretary";
    else if (intent && (wantsProposal || human || intent === "no_interest" || intent === "follow_up" || intent === "price")) { delete s.slots.supportNeed; delete s.slots.supportCityAsked; }
  }
  const need = String(s.slots.supportNeed || "");
  if (need && !human) {
    const knowsWhere = !!(s.slots.city || s.slots.poloId || input.hasPolo);
    if (knowsWhere || Number(s.slots.supportCityAsked || 0) >= 1) {
      supportExit = need === "secretary" ? "secretaria" : "tutoria";
      s.slots.supportKind = need;
      delete s.slots.supportNeed;
      delete s.slots.supportCityAsked;
    } else if (input.replied) {
      ask = "city";
      s.slots.supportCityAsked = 1;
    }
  }
  const followUp = intent === "follow_up";
  const noInterest = intent === "no_interest" && confirmsNoInterest(input.userText);
  // the person is back and talking about something else: the old "I'll think about it" no longer applies
  if (input.replied && intent && intent !== "follow_up" && (s.followUpReason || s.followUpAt)) { s.followUpReason = null; s.followUpAt = null; }
  if (followUp) {
    s.followUpReason = (input.followUp?.reason || "Pediu um tempo para pensar").slice(0, 300);
    // the day the person gave (09:00 of Porto Velho); a day that makes no sense never erases the one saved, and "vou pensar" always has a day
    s.followUpAt = parseFollowUp(input.followUp?.at, now) || s.followUpAt || defaultFollowUp(now);
  }
  if (noInterest) s.followUpReason = (input.followUp?.reason || input.userText || "Sem interesse").slice(0, 300);

  // 4) score, temperature, next action, summary
  const { score, ledger } = scoreOf(s.slots, s.readyForProposal, intent);
  s.slots.intentsSeen = [...new Set([...(String(s.slots.intentsSeen || "").split(",").filter(Boolean)), ...ledger])].join(",");
  s.commercialScore = score;
  s.temperature = temperatureOf(s.slots, s.readyForProposal);
  // the administrator chose to hand over any lead that turned hot, without waiting for the price or the enrollment to be asked
  if (!s.readyForProposal && ports.config && ports.config.hotHandoff === "hot" && input.replied && s.temperature === "hot" && !human && !noInterest) {
    s.readyForProposal = true;
    reasons.push("Lead quente: a configuração manda encaminhar assim que esquenta.");
    s.nextAction = nextActionOf(s, { human, lost: noInterest });
  }
  s.nextAction = nextActionOf(s, { human, lost: noInterest });
  s.summary = noteOf(s);

  // 5) the funnel
  const target = targetStageKey(s, { intent, replied: input.replied, firstContactSent: input.firstContactSent, human, followUp, noInterest });
  if (input.firstContactSent) await ports.markContact("out");
  let moved = false;
  if (target && canAutoMove(crmBefore, target)) moved = await ports.moveStage(target as StageKey, STAGE_SPECS[target as StageKey] ? `${intent || "andamento do atendimento"}` : "andamento do atendimento");
  const crmAfter = moved ? (target as StageKey) : crmBefore;
  if (moved) reasons.push(`CRM: o lead foi para a coluna ${crmAfter} (${intent ? intentLabel(intent) : "andamento do atendimento"}).`);
  if (crmAfter) s.stageKey = crmAfter;

  // 6) tasks (one per reason) and the note (only when it changed)
  if (s.readyForProposal) await ports.task("proposal:ready", "Gerar e apresentar proposta", new Date(now.getTime() + 60 * 60000), "proposta");
  if (target === "waiting_transcript" || nextActionOf(s) === "wait_transcript") await ports.task("transcript:wait", "Aguardar histórico acadêmico", new Date(now.getTime() + 2 * 86400000), "documentos");
  if (followUp && s.followUpAt) await ports.task(`follow_up:${ymdOf(new Date(s.followUpAt))}`, `Retomar contato: ${s.followUpReason}`, s.followUpAt, "whatsapp");
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
  let exitWhy: string | null = null;
  if (human) { exit = "human"; exitWhy = "A pessoa pediu para falar com alguém da equipe."; }
  else if (supportExit) { exit = supportExit; exitWhy = supportExit === "secretaria" ? "Aluno que precisa da secretaria do polo." : "Aluno que precisa da tutoria do polo."; }
  else if (ask) exit = null;
  else if (noInterest) { exit = "sem_interesse"; exitWhy = "A pessoa confirmou que não tem interesse."; }
  else if (s.readyForProposal && !input.stepsPending) { exit = "proposta"; exitWhy = intent === "price" ? "Pediu valores: quem apresenta as condições é o consultor." : intent === "enrollment" ? "Quer se matricular: o consultor conduz a matrícula." : intent === "proposal" ? "Pediu proposta ou link de inscrição." : "Lead quente: encaminhado ao consultor."; }
  else if (followUp) { exit = "follow_up"; exitWhy = "Pediu um tempo: o retorno ficou agendado."; }
  else if (input.unknownQuestion || intent === "unknown") {
    const limit = ports.config ? ports.config.maxClarifications : 3;
    exit = Number(s.slots.unknownStreak || 0) >= limit ? "human" : "off";
    exitWhy = exit === "human" ? `${limit} mensagens seguidas sem resposta confirmada: uma pessoa assume.` : "Informação não confirmada na base: o agente avisa que vai confirmar e a pergunta vai para a equipe.";
  }
  // qualified and out of questions: a person of the polo takes it, ready (the brief says what the lead wants)
  else if (Number(s.slots.objectionCount || 0) >= OBJECTION_LIMIT && input.objection) { exit = "human"; exitWhy = "Objeções repetidas: um consultor assume a negociação."; }
  // a qualified lead is handed to the consultant when nothing is left hanging: not while a grade was asked and not sent, and not in the same
  // message that asks the person something (unless the conversation already went on for two more answers)
  else if (s.slots.readyForConsultant && !input.stepsPending && input.replied && !(intent === "curriculum" && !s.slots.gradeSent) && (!input.endsWithQuestion || Number(s.slots.qualifiedReplies || 0) >= (ports.qualifyAfter || 2) + 2)) { exit = "human"; exitWhy = "Lead qualificado: todos os dados necessários estão no cadastro."; }
  if (exitWhy) reasons.push(`Transferência: ${exitWhy}`);
  const why =
    supportExit ? (supportExit === "secretaria" ? "secretary" : "tutoring") :
    exit === "human" && !human && !input.unknownQuestion && intent !== "unknown"
      ? Number(s.slots.objectionCount || 0) >= OBJECTION_LIMIT && input.objection ? "objection" : s.slots.readyForConsultant ? "qualified" : undefined
      : undefined;

  const changed: Record<string, [any, any]> = {};
  const after: Record<string, any> = { ...s.slots, temperature: s.temperature, commercialScore: s.commercialScore, nextAction: s.nextAction, readyForProposal: s.readyForProposal };
  Object.keys(after).forEach(k => { if (!["intentsSeen", "crmSeen", "lastBriefHash", "unknownStreak", "audioAsked"].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed[k] = [before[k] ?? null, after[k] ?? null]; });
  return {
    exit,
    ...(why ? { why } : {}),
    ...(ask ? { ask } : {}),
    trace: { intent, changed, crmBefore, crmAfter, actions: ports.audit.splice(0), temperature: s.temperature, score: s.commercialScore, nextAction: s.nextAction, readyForProposal: s.readyForProposal, reasons, missing: missingOf(s.slots, ports.config ? ports.config.qualifyRequires : undefined), exitWhy, stageName: crmAfter ? await ports.stageName(crmAfter) : null }
  };
};
