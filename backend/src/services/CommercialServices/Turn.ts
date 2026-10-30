import { Op } from "sequelize";
import { getSetting } from "../../helpers/AppSettings";
import AgentTurnLog from "../../models/AgentTurnLog";
import AiAgent from "../../models/AiAgent";
import Lead from "../../models/Lead";
import Polo from "../../models/Polo";
import Ticket from "../../models/Ticket";
import { applyToLead } from "../AiServices/Tools";
import { captureUnknown } from "../AiServices/Learning";
import { ChatTurn, respond } from "../AiServices/RunAiAgent";
import { StageData } from "../FlowServices/StageSpec";
import { StageTurn } from "../FlowServices/Engine";
import { commercialTurn, CommercialTrace } from "./Hook";
import { CommercialPorts } from "./Ports";
import { matchFaq } from "../AiServices/Kb";
import { unsafeAnswer } from "./Guards";
import { ENTRY_LABEL, alreadyIntroduces, consultantMention, courseMention, entryOf, fastIntent, interestOf, hasBolsaData, humanReason, introText, isGreeting, needsBolsaData, nextQuestionOf, openingText, retractsBuying, stageFieldsDone, supportIntent, topicsOf, gradeRequest, withoutClosingQuestion } from "./Rules";
import { configOf } from "./Config";
import { detectFromText, findConsultantByName } from "./Detect";
import { AcademicCtx, closestOffered, findCourse, joinNames, offeredCourses, runAcademicTool, sendGradeFor } from "./Academic";
import { addActivity } from "../CrmServices/LeadCore";
import { BOLSA_ASKS, bolsaDataFrom, bolsaRequestFor } from "./BolsaData";
import { stripGradeAnnouncement } from "./GradeChoice";
import { studentFacts } from "./StudentFacts";
import { mirror } from "./Slots";
import { pendingSteps } from "../FlowServices/StepLock";

// One turn of the commercial agent, the same in the real conversation and in the simulator (only the ports and the history change):
//   1. what is obvious (a request for a person, a price) is answered by the system, without the model;
//   2. the rest goes to the model, once, with the little context it needs;
//   3. whatever the model understood goes through the rules (state, funnel, tasks, notes) and the exit of the stage is decided there.
export const FIXED = {
  human: "Claro! Vou chamar um consultor para continuar com você. Um momento, por favor.",
  proposal: "Ótima pergunta! Valores e bolsas dependem da sua situação e do seu polo, então quem apresenta a melhor condição é o consultor do seu polo. Vou encaminhar o seu atendimento agora para ele montar a proposta certinha. Se tiver um melhor horário para ele te chamar, é só avisar por aqui.",
  tutoring: "Entendi! Vou chamar a tutoria do seu polo para te ajudar com isso. Um momento, por favor.",
  secretary: "Entendi! Vou chamar a secretaria do seu polo para cuidar disso. Um momento, por favor.",
  askCity: "Para chamar a equipe do seu polo, em qual cidade você estuda ou mora?",
  unknown: "Essa informação eu prefiro confirmar para não te passar nada incorreto. Vou encaminhar para o consultor verificar certinho para você."
};

// the person is back after a while (the conversation did not stop an hour ago)
const returningSince = (iso: any): boolean => !!iso && Date.now() - new Date(String(iso)).getTime() > 6 * 3600000;


export interface TurnDeps {
  agent: AiAgent;
  stage: StageData;
  nodeId: string;
  flowId?: number | null;
  ports: CommercialPorts;
  ticket: Ticket | null;
  lead: Lead | null;
  // the conversation so far (the last message is the person's; at the opening it is a hint to speak first)
  history: ChatTurn[];
  // what the person wrote; null when the stage opens the conversation
  input: string | null;
  sandbox: boolean;
  contactName?: string | null;
  // how many turns this stage already had
  turns?: number;
  // what the person sent since the last answer (files, audio, stickers) and what they wrote before (for the request that repeats)
  media?: MediaItem[];
  priorUserTexts?: string[];
  // a voice note that could not be transcribed (nothing in the settings, or it failed)
  audioUnreadable?: boolean;
  // the daily limit of tokens was reached: only the answers that need no model are still given
  capped?: boolean;
  // the checklist of the stage: the steps (1-based) already done in this run, and what the lock refused to end in the last turn
  stepsDone?: number[];
  stepsHeld?: string;
}

export interface MediaItem {
  kind: "pdf" | "image" | "audio" | "video" | "sticker" | "other";
  name: string;
}

export interface CommercialTurnResult extends StageTurn {
  // why the conversation goes to a person, when the turn decided it (the Router writes it down)
  why?: string;
  trace: {
    userText: string;
    deterministic: boolean;
    intent: string | null;
    tools: Array<{ name: string; args: any; result: string }>;
    knowledge: string[];
    commercial: CommercialTrace;
    entry: string;
    llmCalls: number;
    cacheHits: number;
    tokens: { input: number; output: number; cacheRead: number };
    latencyMs: number;
  };
}

// the slots that changed, as flat text for the variables of the flow ({{courseName}}, a condition on var:entryType)
const flat = (changed: Record<string, [any, any]>): Record<string, string> => {
  const out: Record<string, string> = {};
  Object.entries(changed).forEach(([k, [, v]]) => { if (v !== null && v !== undefined && v !== "") out[k] = String(v); });
  return out;
};

const commercialAiTurnInner = async (d: TurnDeps): Promise<CommercialTurnResult> => {
  const started = Date.now();
  const lastText = d.input === null ? "" : d.input;
  const state = d.ports.state;
  // the company's rule for handing a qualified lead to the consultant (Setting ai_qualified_replies, default 2 answers; 0 turns it off)
  const qualifiedSetting = Number(await getSetting("ai_qualified_replies", "2"));
  d.ports.config = configOf(d.agent);
  d.ports.detect = detectFromText;
  d.ports.qualifyAfter = d.ports.config.qualifyAfter !== null ? d.ports.config.qualifyAfter : Number.isFinite(qualifiedSetting) && qualifiedSetting >= 0 ? qualifiedSetting : 2;
  const base = { userText: lastText, tools: [] as any[], knowledge: [] as string[], llmCalls: 0, cacheHits: 0, tokens: { input: 0, output: 0, cacheRead: 0 } };
  // a contact who is already a student is recognised before anything is explained
  if (d.lead && !d.sandbox) await studentFacts(d.lead, state.slots);

  const log = async (r: { intent: string | null; deterministic: boolean; llmCalls: number; toolCalls: number; cacheHits: number; tokens: { input: number; output: number; cacheRead: number }; outcome: string | null; latencyMs: number }) => {
    if (d.sandbox) return;
    await AgentTurnLog.create({
      agentId: d.agent.id, flowId: d.flowId || null, nodeId: d.nodeId, ticketId: d.ticket?.id || null, leadId: state.leadId || null, intent: r.intent, deterministic: r.deterministic,
      llmCalls: r.llmCalls, toolCalls: r.toolCalls, cacheHits: r.cacheHits, inputTokens: r.tokens.input, outputTokens: r.tokens.output, cacheReadTokens: r.tokens.cacheRead,
      latencyMs: r.latencyMs, outcome: r.outcome, model: d.agent.model
    } as any).catch(() => undefined);
  };

  // what a turn answered by the system returns
  const answered = async (text: string, exit: string | null, intent: string, hookInput: any, why?: string, outcome?: string | null): Promise<CommercialTurnResult> => {
    const hook = await commercialTurn(d.ports, { userText: lastText, tools: [], hadText: !!text, replied: d.input !== null, nodeId: d.nodeId, ...hookInput });
    const latencyMs = Date.now() - started;
    const out = exit || hook.exit;
    await log({ intent, deterministic: true, llmCalls: 0, toolCalls: 0, cacheHits: 0, tokens: base.tokens, outcome: outcome ?? out, latencyMs });
    if (d.lead && !d.sandbox) await syncLead(d, hook.trace.changed);
    return { text, exit: out, ...(why ? { why } : {}), collected: flat(hook.trace.changed), trace: { ...base, deterministic: true, intent, commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs } };
  };

  // files and voice notes: a sticker alone says nothing; a voice note nobody can read is asked once in writing, then a person takes it;
  // an image when the transcript is waited for asks for the PDF
  const media = d.media || [];
  const wrote = lastText.replace(/\[[^\]]*\]/g, "").trim().length > 0;
  if (d.input !== null && !wrote && media.length && media.every(m => m.kind === "sticker")) {
    return { text: "", exit: null, collected: {}, trace: { ...base, deterministic: true, intent: "other", commercial: { intent: "other", changed: {}, crmBefore: null, crmAfter: null, actions: [], temperature: state.temperature, score: state.commercialScore, nextAction: state.nextAction, readyForProposal: state.readyForProposal, reasons: ["Figurinha: sem resposta, nada a decidir."], missing: [], exitWhy: null }, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs: Date.now() - started } };
  }
  if (d.audioUnreadable && !wrote) {
    const asked = Number(state.slots.audioAsked || 0);
    state.slots.audioAsked = asked + 1;
    if (asked >= 1) return answered(d.agent.handoffMessage || FIXED.human, "human", "other", { fast: undefined }, "media");
    return answered("Ainda não consigo ouvir áudios por aqui. Pode escrever a sua mensagem? Assim eu te ajudo mais rápido.", null, "other", {});
  }
  const needsTranscript = (state.slots.entryType === "transfer" || state.slots.entryType === "second_degree") && !state.slots.hasTranscript;
  if (d.input !== null && !wrote && needsTranscript && media.some(m => m.kind === "image") && !media.some(m => m.kind === "pdf")) {
    return answered("Recebi a imagem, mas para a análise curricular eu preciso do histórico em PDF. Consegue me enviar o arquivo em PDF?", null, "analysis", {});
  }

  // a reason that needs a person (an unhappy person, a payment, a wrong number, the same request again): no model, straight to the team
  const reason = d.input === null ? null : humanReason(lastText, d.priorUserTexts || []);
  if (reason) return answered(d.agent.handoffMessage || FIXED.human, "human", "human", { fast: "human" }, reason);

  // a person names the consultant they want or already talked to ("Quero falar com João", "Já conversei com a Gabrielli"): the handoff goes to the team
  // of the polo, with that person first when they belong to it (the Router decides; nobody is promised before it confirms)
  const mention = d.input === null ? null : consultantMention(lastText);
  if (mention) {
    const person = await findConsultantByName(mention.name).catch(() => null);
    const patch = person ? { preferredConsultantId: person.id, preferredConsultantName: person.name } : { preferredConsultantName: `${mention.name} (não encontrado entre os consultores)` };
    const text = `Entendi! Vou encaminhar seu atendimento para a equipe do seu polo${person ? `, priorizando ${person.name.split(" ")[0]}` : ""}. Um momento, por favor.`;
    return answered(text, "human", "human", { fast: "human", patch }, "human_request");
  }

  // "Já sou aluno": the person is not a prospect; the system asks which team they need (tutoring or secretary) instead of selling
  if (d.input !== null && wrote && interestOf(lastText, {}) === "aluno" && !supportIntent(lastText, true) && !fastIntent(lastText) && !state.slots.supportNeed && !state.slots.enrolledStudent) {
    return answered("Entendi! Para te direcionar para a equipe certa: é sobre plataforma, atividades ou provas (tutoria), ou sobre documentos, boletos e declarações (secretaria)?", null, "other", { patch: { enrolledStudent: true, interestKind: "aluno" } });
  }

  // the full name and the CPF asked for the scholarship: read here, answered by the system (the CPF never goes to the model, the log or the brief)
  if (d.input !== null && wrote && Number(state.slots.bolsaDataAsked || 0) > 0 && !hasBolsaData(state.slots)) {
    const given = bolsaDataFrom(lastText);
    if (given.cpf || given.fullName || given.invalidCpf) {
      const patch: Record<string, any> = {};
      if (given.fullName) patch.fullName = given.fullName;
      if (given.cpf) patch.cpfGiven = true;
      if (given.cpf && d.lead && !d.sandbox) {
        const other = await Lead.findOne({ where: { cpf: given.cpf, id: { [Op.ne]: d.lead.id } } as any, attributes: ["id"] });
        if (!other) await Lead.update({ cpf: given.cpf }, { where: { id: d.lead.id } }).catch(() => undefined);
      }
      const after = { ...state.slots, ...patch };
      const missing = { name: !after.fullName, cpf: !after.cpfGiven };
      const asked = Number(state.slots.bolsaDataAsked || 0);
      const complete = !missing.name && !missing.cpf;
      patch.bolsaDataAsked = complete || asked >= BOLSA_ASKS ? asked : asked + 1;
      const first = String(after.fullName || state.slots.leadName || d.contactName || "").trim().split(/\s+/)[0];
      const text = given.invalidCpf && !given.cpf
        ? "Esse CPF não parece válido. Confere os 11 números e me envia de novo, por favor?"
        : complete
          ? `Obrigado${first ? `, ${first}` : ""}. Anotei seus dados para o consultor simular a bolsa.`
          : asked >= BOLSA_ASKS ? `Obrigado${first ? `, ${first}` : ""}. Anotei o que você enviou.` : bolsaRequestFor(missing);
      // same way out as an answer of the model: when this completes a qualified lead, the Router hears why (the warm handover message follows this text)
      const hook = await commercialTurn(d.ports, { userText: lastText.replace(/\d/g, "•"), intent: "other", patch, tools: [], hadText: true, replied: true, nodeId: d.nodeId });
      await log({ intent: "other", deterministic: true, llmCalls: 0, toolCalls: 0, cacheHits: 0, tokens: base.tokens, outcome: hook.exit, latencyMs: Date.now() - started });
      if (d.lead && !d.sandbox) await syncLead(d, hook.trace.changed);
      return { text, exit: hook.exit, ...(hook.why ? { why: hook.why } : {}), collected: flat(hook.trace.changed), trace: { ...base, deterministic: true, intent: "other", commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs: Date.now() - started } };
    }
  }

  // 0) the opening: a greeting (or nobody wrote yet) is answered by the system, with the next question, without the model
  const fresh = !state.slots.lastOutboundAt || returningSince(state.slots.lastOutboundAt);
  if (fresh && !d.turns && (d.input === null || isGreeting(lastText))) {
    const first = String(state.slots.leadName || d.contactName || "").trim().split(/\s+/)[0] || "";
    const text = openingText(state.slots, first, !!state.slots.lastOutboundAt, d.agent.persona);
    const hook = await commercialTurn(d.ports, { userText: lastText, intent: d.input === null ? null : "greeting", tools: [], hadText: true, replied: d.input !== null, firstContactSent: true, nodeId: d.nodeId });
    const latencyMs = Date.now() - started;
    await log({ intent: "greeting", deterministic: true, llmCalls: 0, toolCalls: 0, cacheHits: 0, tokens: base.tokens, outcome: null, latencyMs });
    if (d.lead && !d.sandbox) await syncLead(d, hook.trace.changed);
    return { text, exit: null, collected: flat(hook.trace.changed), trace: { ...base, deterministic: true, intent: "greeting", commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs } };
  }

  // the person says hello again (or only "quero saber mais") after the opening: the system answers short, without presenting itself again, and
  // asks the next step of the process; a stage that starts without a message in a conversation already going on does the same (no model, no
  // "cumprimente" to a person already greeted)
  const stageNeeds = d.stage.fields.filter(f => f.required).map(f => (f.key === "courseName" ? "course" : f.key === "entryType" ? "entry" : f.key));
  if (!fresh && !media.length && d.input !== null && isGreeting(lastText)) {
    const smile = (d.agent.persona as any)?.emoji === false ? "" : " 😊";
    const next = state.slots.enrolledStudent ? null : nextQuestionOf(state.slots, d.ports.config ? d.ports.config.ask : {});
    return answered(`Oi! Estou por aqui${smile}\n\n${next || "Em que posso te ajudar?"}`, null, "greeting", { intent: "greeting" });
  }
  if (!fresh && d.input === null && !state.slots.enrolledStudent) {
    const next = nextQuestionOf(state.slots, d.ports.config ? d.ports.config.ask : {}, stageNeeds);
    if (next) return answered(next, null, "greeting", {});
  }

  // a course that is not in the catalogue of the system is not offered: said at once, with the ones that are (the model never gets to talk about it)
  const named = d.input !== null && wrote ? courseMention(lastText) : null;
  if (named && !(await findCourse({ courseName: named }))) {
    const list = await offeredCourses();
    if (list.length) {
      const pretty = named.replace(/\b([a-z])/g, m => m.toUpperCase());
      const text = `Hoje a gente não oferece o curso de ${pretty}. Os cursos que oferecemos incluem ${joinNames(closestOffered(list, named, 6).map(c => c.name))}${list.length > 6 ? " e outros" : ""}. Algum deles te interessa?`;
      return answered(text, null, "other", { patch: { unofferedCourse: pretty } });
    }
  }

  // the transcript arrives (a PDF among what the person just sent): the stage that asked for it goes on without the model
  const sentFile = d.input !== null && media.some(m => m.kind === "pdf");
  if (sentFile && (state.slots.entryType === "transfer" || state.slots.entryType === "second_degree") && d.stage.outcomes.some(o => o.id === "enviou_historico")) {
    const hook = await commercialTurn(d.ports, { userText: lastText, intent: "analysis", patch: { hasTranscript: true }, tools: [], hadText: true, replied: true, nodeId: d.nodeId });
    const latencyMs = Date.now() - started;
    await log({ intent: "analysis", deterministic: true, llmCalls: 0, toolCalls: 0, cacheHits: 0, tokens: base.tokens, outcome: "enviou_historico", latencyMs });
    return {
      text: "Recebi o seu histórico, obrigado! Vou iniciar a análise curricular para verificar quais disciplinas poderão ser aproveitadas.", exit: hook.exit || "enviou_historico",
      collected: flat(hook.trace.changed), trace: { ...base, deterministic: true, intent: "analysis", commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs }
    };
  }

  // 1) the obvious: no model
  const fast = d.input === null ? null : fastIntent(lastText);
  if (fast) {
    const text = fast.intent === "human" ? d.agent.handoffMessage || FIXED.human : FIXED.proposal;
    const hook = await commercialTurn(d.ports, { userText: lastText, fast: fast.intent, tools: [], hadText: true, replied: true, retract: false, nodeId: d.nodeId });
    const latencyMs = Date.now() - started;
    await log({ intent: fast.intent, deterministic: true, llmCalls: 0, toolCalls: 0, cacheHits: 0, tokens: base.tokens, outcome: hook.exit, latencyMs });
    if (d.lead && !d.sandbox) await syncLead(d, hook.trace.changed);
    return { text, exit: hook.exit, collected: flat(hook.trace.changed), trace: { ...base, deterministic: true, intent: fast.intent, commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs } };
  }

  // a student who needs the tutoring or the secretary: the team of the polo takes it, without a sales talk (and without a model)
  const support = d.input === null ? null : supportIntent(lastText, !!state.slots.enrolledStudent);
  if (support) {
    const hook = await commercialTurn(d.ports, { userText: lastText, fast: support, tools: [], hadText: true, replied: true, retract: false, nodeId: d.nodeId, hasPolo: !!d.lead?.poloId });
    const text = hook.exit ? FIXED[support] : FIXED.askCity;
    const latencyMs = Date.now() - started;
    await log({ intent: support, deterministic: true, llmCalls: 0, toolCalls: 0, cacheHits: 0, tokens: base.tokens, outcome: hook.exit, latencyMs });
    if (d.lead && !d.sandbox) await syncLead(d, hook.trace.changed);
    return { text, exit: hook.exit, ...(hook.why ? { why: hook.why } : {}), collected: flat(hook.trace.changed), trace: { ...base, deterministic: true, intent: support, commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs } };
  }

  // the grade asked for: the system finds it and sends the PDF itself (a model that only says it will send, and never calls the tool, leaves the person without the file)
  const gradeAsk = d.input === null || d.sandbox || !d.ticket || !wrote ? null : gradeRequest(lastText);
  if (gradeAsk) {
    const ctx: AcademicCtx = { ticket: d.ticket, dryRun: false, slots: { ...state.slots }, patch: {}, cacheHits: 0, agentId: d.agent.id };
    try {
      const named2 = gradeAsk.course ? await findCourse({ courseName: gradeAsk.course }) : null;
      const course = named2 || (ctx.slots.courseId || ctx.slots.courseName ? await findCourse({ courseId: ctx.slots.courseId, courseName: ctx.slots.courseName }) : null);
      const again = /\b(de novo|novamente|outra vez|reenvia|reenviar)\b/i.test(lastText);
      if (course && !(ctx.slots.gradeSent && Number(ctx.slots.courseId) === course.id && !again)) {
        const sent = await sendGradeFor(course, ctx);
        if (sent.sent) {
          let text = sent.text || "Qualquer dúvida sobre o estágio ou a rotina do curso, é só me falar.";
          let patchOut: Record<string, any> = { ...ctx.patch, courseId: course.id, courseName: course.name, gradeAsked: true, courseExplained: true, internshipExplained: true, tutoringExplained: true };
          const probe = { ...state.slots, ...patchOut };
          // the full name and the CPF for the scholarship (same rule as after any answer)
          if (needsBolsaData(probe)) {
            text = `${text}\n\n${bolsaRequestFor({ name: !probe.fullName, cpf: !probe.cpfGiven })}`.trim();
            patchOut = { ...patchOut, bolsaDataAsked: Number(probe.bolsaDataAsked || 0) + 1 };
          }
          const hook = await commercialTurn(d.ports, { userText: lastText, intent: "curriculum", patch: patchOut, tools: ["buscar_grade", "enviar_material"], hadText: true, replied: true, nodeId: d.nodeId, hasPolo: !!d.lead?.poloId, endsWithQuestion: /\?[\s"”')]*$/.test(text) });
          const latencyMs = Date.now() - started;
          await log({ intent: "curriculum", deterministic: true, llmCalls: 0, toolCalls: 2, cacheHits: 0, tokens: base.tokens, outcome: hook.exit, latencyMs });
          if (d.lead) await syncLead(d, hook.trace.changed);
          return { text, exit: hook.exit, ...(hook.why ? { why: hook.why } : {}), collected: flat(hook.trace.changed), trace: { ...base, deterministic: true, intent: "curriculum", commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs } };
        }
      }
    } catch (err) {
      // the model answers as before when the system could not send it
    }
  }

  // an FAQ with a ready answer (the team's or one the agent learned) needs no model
  if (d.input !== null && d.stage.useKnowledge && wrote) {
    const faq = await matchFaq(d.agent.id, lastText);
    if (faq) return answered(faq.content, null, "other", {});
  }

  // the day's limit was reached: the model is not called, a person takes over
  if (d.capped) return answered(d.agent.handoffMessage || FIXED.human, "limit", "other", {}, "limit_tokens");

  // the kind of entry said in the person's words is known before the model talks ("nunca fiz faculdade", "primeira"): never left to it
  if (d.input !== null && wrote && (!state.slots.entryType || state.slots.entryType === "unknown")) {
    const entry = entryOf(lastText);
    if (entry) state.slots.entryType = entry;
  }

  // 2) the model, once
  const result = await respond(d.agent, {
    ticket: d.ticket, history: d.history, summary: state.summary, collected: null, sandbox: d.sandbox, stage: d.stage, flowId: d.flowId, nodeId: d.nodeId,
    commercial: { slots: mirror(state) }, topics: topicsOf(lastText), leadId: state.leadId || null, stepsDone: d.stepsDone, stepsHeld: d.stepsHeld
  });
  const stepsDone = result.stepsDone || d.stepsDone || [];
  const stepsPending = pendingSteps(d.stage, stepsDone).length > 0;
  const turn = result.turn || {};
  const intent = d.input === null ? null : String(turn.intent || "other");
  const unknownQuestion = turn.pergunta_sem_resposta ? String(turn.pergunta_sem_resposta) : intent === "unknown" ? lastText : null;

  // 3) what the model understood goes through the rules
  let text = result.text;
  // the grade went with its own text under the PDF: the agent does not announce it
  if (result.tools.includes("enviar_material")) text = stripGradeAnnouncement(text);
  // after the grade (or once the lead is qualified) the consultant needs the full name and the CPF to simulate the scholarship: the system asks, once the
  // answer of the model has no question of its own (or after a few answers anyway)
  let patchOut: Record<string, any> = { ...(result.academicPatch || {}) };
  const probe = { ...state.slots, ...patchOut };
  if (d.input !== null && !d.sandbox && needsBolsaData(probe) && (!/\?[\s"”')]*$/.test(String(text || "").trim()) || Number(probe.qualifiedReplies || 0) >= (d.ports.qualifyAfter || 2) + 1)) {
    text = `${String(text || "").trim()}\n\n${bolsaRequestFor({ name: !probe.fullName, cpf: !probe.cpfGiven })}`.trim();
    patchOut = { ...patchOut, bolsaDataAsked: Number(probe.bolsaDataAsked || 0) + 1 };
  }
  // The grade goes to every person who has a course, even if nobody asked for it and the model did not call the tool: it is part of the process.
  // (Not to someone who is already a student; once per course, the slot is cleared when the course changes.)
  let toolsOut = result.tools;
  const courseNow = patchOut.courseId || state.slots.courseId || patchOut.courseName || state.slots.courseName;
  if (d.input !== null && wrote && courseNow && !(patchOut.gradeSent ?? state.slots.gradeSent) && !state.slots.enrolledStudent && !result.tools.includes("enviar_material") && !result.exit) {
    try {
      const course = await findCourse({ courseId: patchOut.courseId || state.slots.courseId, courseName: patchOut.courseName || state.slots.courseName });
      if (course) {
        const live = !d.sandbox && !!d.ticket;
        const mk = (dryRun: boolean): AcademicCtx => ({ ticket: d.ticket, dryRun, slots: { ...state.slots, ...patchOut, courseId: course.id }, patch: {}, cacheHits: 0, agentId: d.agent.id });
        // checked now (the file exists?), sent after the answer: the person reads the presentation and the answer first, then receives the file
        const ctx = mk(true);
        const g = await sendGradeFor(course, ctx);
        if (live && g.simulated) {
          const ticket = d.ticket!;
          const leadId = d.lead?.id;
          setTimeout(async () => {
            // the person may have been handed to the team meanwhile: then nothing is sent by the AI
            const fresh = await Ticket.findByPk(ticket.id, { attributes: ["id", "aiActive", "userId", "status"] }).catch(() => null);
            if (fresh && (fresh.aiActive === false || fresh.userId || fresh.status === "closed")) return;
            sendGradeFor(course, mk(false)).catch(async () => {
              if (leadId) await addActivity(leadId, null, "system", `Não consegui enviar a grade do curso ${course.name}. Envie manualmente.`).catch(() => undefined);
            });
          }, 3500).unref?.();
        }
        if (g.sent || g.simulated) {
          patchOut = { ...patchOut, ...ctx.patch, courseId: course.id, courseName: course.name, gradeAsked: true, gradeSent: true, courseExplained: true, internshipExplained: true, tutoringExplained: true };
          toolsOut = [...result.tools, "buscar_grade", "enviar_material"];
          if ((g.sent || (live && g.simulated)) && g.text && g.text.length <= 450 && !/est[aá]gio/i.test(text)) text = `${String(text || "").trim()}\n\n${g.text}`.trim();
        } else if (g.missing && d.lead && !d.sandbox) {
          await addActivity(d.lead.id, null, "system", `A grade do curso ${course.name} não está cadastrada: o agente não pôde enviá-la. Envie manualmente e cadastre a grade em Grades.`).catch(() => undefined);
        }
      }
    } catch (err) {
      // the answer goes without the file; the person can ask for it and the team sees it in the health of the agent
    }
  }
  const hook = await commercialTurn(d.ports, {
    userText: lastText, intent, patch: patchOut, tools: toolsOut, hadText: !!text, replied: d.input !== null,
    followUp: intent === "follow_up" ? { reason: turn.motivo_retorno || turn.duvida_principal || null, at: turn.retorno_em || null } : null,
    unknownQuestion, objection: turn.objecao || (intent === "objection" ? lastText : null), question: turn.duvida_principal || null, topics: result.topics,
    firstContactSent: d.input === null && !!text, nodeId: d.nodeId, retract: d.input !== null && retractsBuying(lastText), hasPolo: !!d.lead?.poloId,
    endsWithQuestion: /\?[\s"”')]*$/.test(String(text || "").trim()), stepsPending
  });

  // what the person reads is also decided by the rules; what the model wrote is checked against what the tools and the base returned
  const guard = unsafeAnswer(text, `${result.evidence}\n${lastText}`);
  const moneyLike = guard.unsafe && (guard.kind === "price" || guard.kind === "percent" || guard.kind === "free");
  // a qualified lead keeps the answer to the last question; the handover message follows it (the flow says it)
  if (hook.exit === "human" && hook.why !== "qualified") text = d.agent.handoffMessage || FIXED.human;
  else if (hook.exit === "tutoria" || hook.exit === "secretaria") text = hook.exit === "secretaria" ? FIXED.secretary : FIXED.tutoring;
  else if (hook.ask === "city") text = FIXED.askCity;
  else if (hook.exit === "proposta" || moneyLike) {
    // a price was asked (the model did not notice) or the answer carries a value: the proposal is for a person
    text = FIXED.proposal;
    if (hook.exit !== "proposta") {
      const again = await commercialTurn(d.ports, { userText: lastText, fast: "price", tools: [], hadText: true, replied: true, nodeId: d.nodeId });
      hook.exit = again.exit;
      hook.trace = { ...hook.trace, ...again.trace, actions: [...hook.trace.actions, ...again.trace.actions] };
    }
  } else if (hook.exit === "off" && !text) text = FIXED.unknown;
  else if (guard.unsafe) {
    // a promise or a fact that no tool or approved text backs: the agent says it will confirm, and the question is kept for the team
    text = FIXED.unknown;
    if (d.ticket && !d.sandbox && d.agent.learnFromTeam !== false) await captureUnknown(d.agent, d.ticket, unknownQuestion || lastText, d.contactName || undefined).catch(() => undefined);
  }
  if (guard.unsafe) await d.ports.event("agent_guard", { kind: guard.kind, token: guard.token || null }, false);
  // no reason from the rules to leave: the stage ends by itself when what it asks for is known, or by the exit the model chose
  if (!hook.exit) {
    if (result.exit) hook.exit = result.exit;
    else if (stageFieldsDone(d.stage.fields, state.slots) && !stepsPending) hook.exit = "done";
  }
  // a qualified lead goes to the consultant now: the answer does not end asking something nobody will read
  if (hook.exit === "human" && hook.why === "qualified") text = withoutClosingQuestion(text);
  // the stage goes on and the answer asks nothing: the system asks the next thing the stage needs (course, city, kind of entry), once
  if (!hook.exit && d.input !== null && text && !/\?/.test(text) && !state.slots.enrolledStudent) {
    const next = nextQuestionOf(state.slots, d.ports.config ? d.ports.config.ask : {}, stageNeeds);
    if (next) text = `${String(text).trim()}\n\n${next}`;
  }
  if (hook.exit === "off" && d.ticket && !d.sandbox && d.agent.learnFromTeam !== false && unknownQuestion) {
    await captureUnknown(d.agent, d.ticket, unknownQuestion, d.contactName || undefined).catch(() => undefined);
  }
  if (d.lead && !d.sandbox) await syncLead(d, hook.trace.changed);

  const latencyMs = Date.now() - started;
  await log({ intent, deterministic: false, llmCalls: result.rounds, toolCalls: result.tools.length, cacheHits: result.cacheHits, tokens: result.tokens, outcome: hook.exit, latencyMs });
  return {
    text,
    exit: hook.exit,
    ...(hook.exit === "human" && Number(state.slots.unknownStreak || 0) >= 3 ? { why: "loop" } : hook.why ? { why: hook.why } : {}),
    collected: flat(hook.trace.changed),
    stepsDone,
    trace: {
      ...base, userText: lastText, deterministic: false, intent, tools: result.toolLog, knowledge: result.sources, commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"],
      llmCalls: result.rounds, cacheHits: result.cacheHits, tokens: result.tokens, latencyMs
    }
  };
};

// what the conversation found out goes to the CRM fields that exist (only into empty fields: a person's data is not overwritten)
const syncLead = async (d: TurnDeps, changed: Record<string, [any, any]>): Promise<void> => {
  if (!d.ticket || !Object.keys(changed).length) return;
  const s = d.ports.state.slots;
  const c: Record<string, string> = {};
  if (changed.leadName && s.leadName) c.nome = String(s.leadName);
  if (changed.email && s.email) c.email = String(s.email);
  if (changed.city && s.city) c.cidade = String(s.city);
  if (changed.state && s.state) c.estado = String(s.state);
  if (changed.shift && s.shift) c.turno = String(s.shift);
  if (changed.decisionTimeline && s.decisionTimeline) c.prazo_decisao = String(s.decisionTimeline);
  if (changed.motivation && s.motivation) c.motivacao = String(s.motivation);
  if (changed.financing && s.financing) c.financiamento = String(s.financing);
  if (changed.courseName && s.courseName) c.curso = String(s.courseName);
  if (changed.courseModality && s.courseModality) c.modalidade = String(s.courseModality);
  if (changed.entryType && s.entryType === "transfer") c.forma_ingresso = "Transferência externa";
  if (changed.entryType && s.entryType === "second_degree") c.forma_ingresso = "Portador de diploma (2ª graduação)";
  if (changed.semesterEntry && s.semesterEntry) c.semestre_transferencia = String(s.semesterEntry);
  if (Object.keys(c).length) await applyToLead(d.ticket, { ...(d.ticket.aiSlots || {}), ...c }, { allowCourseChange: !!changed.courseName });
  // the polo the tools found (or the city pointed to) belongs to the lead, so the handoff goes to that polo's commercial team
  if (s.poloId && d.lead && !d.lead.poloId) {
    await Lead.update({ poloId: Number(s.poloId) }, { where: { id: d.lead.id, poloId: null as any } }).catch(() => undefined);
    // and the conversation moves to that polo's commercial queue, with a consultant of the polo as owner
    const polo = await Polo.findByPk(Number(s.poloId));
    if (polo) {
      const { assignToPolo } = await import("./Router");
      await assignToPolo(d.ticket, await Lead.findByPk(d.lead.id), polo);
    }
  }
};

// The agent always presents itself in the first answer of a conversation, whatever the person wrote (a question, a price, a course): the opening
// that answers a greeting already does it; every other first answer gets the presentation in front.
export const commercialAiTurn = async (d: TurnDeps): Promise<CommercialTurnResult> => {
  const slots = d.ports.state.slots;
  const first = d.input !== null && !d.turns && !slots.lastOutboundAt;
  const out = await commercialAiTurnInner(d);
  if (first && out.text && out.text.trim() && !alreadyIntroduces(out.text)) {
    const name = String(slots.leadName || d.contactName || "").trim().split(/\s+/)[0] || "";
    out.text = `${introText(d.agent.persona, name)}\n\n${out.text.trim()}`;
  }
  return out;
};
