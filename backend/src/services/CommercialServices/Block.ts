import Lead from "../../models/Lead";
import { FlowNode } from "../FlowServices/Graph";
import { briefContext } from "./Brief";
import { AcademicCtx, runAcademicTool } from "./Academic";
import { commercialTurn } from "./Hook";
import { CommercialPorts } from "./Ports";
import { STAGE_SPECS, StageKey } from "./Pipeline";
import { briefOf, canAutoMove, hashOf, noteOf } from "./Rules";
import { mirror } from "./Slots";

// The block "Estado comercial" of the canvas: the steps of the journey that are not a conversation (find the lead, put it in a
// column, create a task, write the note, prepare the handoff, start the analysis). They run by the same rules as the turns of the AI.
export interface BlockDeps {
  ports: CommercialPorts;
  ticketId?: number | null;
  sandbox: boolean;
  // the real handoff writes (event in the conversation); the simulator only shows the brief
  writeBrief?: (brief: string) => Promise<void>;
  academic: AcademicCtx;
  now?: Date;
}

// to a column: only forward, only when the column exists and the lead is in a column of the journey
const goTo = async (ports: CommercialPorts, key: StageKey, reason: string): Promise<void> => {
  const current = await ports.stageKeyNow();
  if (canAutoMove(current, key)) await ports.moveStage(key, reason);
  else if (!current) ports.audit.push({ kind: "crm", text: `Ficaria em “${STAGE_SPECS[key].name}”, mas o lead está em uma coluna fora da jornada (respeitada).` });
};

// the slots as flat text for the variables of the flow
export const varsOf = (ports: CommercialPorts): Record<string, string> => {
  const out: Record<string, string> = {};
  Object.entries(mirror(ports.state)).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== "" && typeof v !== "object" && !["intentsSeen", "lastBriefHash"].includes(k)) out[k] = String(v); });
  return out;
};

export const runCommercialBlock = async (node: FlowNode, d: BlockDeps): Promise<Record<string, string>> => {
  const data = node.data || {};
  const { ports } = d;
  const s = ports.state;
  const now = d.now || new Date();
  switch (data.op) {
    case "ensure_lead":
      await ports.event("lead_received");
      break;
    case "sync_stage": {
      const key = String(data.stageKey) as StageKey;
      if (!STAGE_SPECS[key]) break;
      if (key === "contact_started") {
        s.slots.lastOutboundAt = now.toISOString();
        await ports.markContact("out");
        await ports.event("contact_started");
      }
      if (key === "in_service") await ports.event("replied");
      if (key === "ready_for_proposal") { s.readyForProposal = true; await ports.event("ready_for_proposal"); }
      await goTo(ports, key, String(data.reason || node.data?.title || STAGE_SPECS[key].name));
      s.stageKey = (await ports.stageKeyNow()) || s.stageKey;
      break;
    }
    case "task":
      await ports.task(`block:${node.id}`, String(data.title || "Tarefa do atendimento"), new Date(now.getTime() + (Number(data.minutes) || 60) * 60000));
      break;
    case "note": {
      const note = noteOf(s);
      if (note && hashOf(note) !== s.lastNoteHash) { await ports.note(note); s.lastNoteHash = hashOf(note); }
      break;
    }
    case "handoff_brief": {
      s.summary = noteOf(s);
      const ctx = d.sandbox ? { source: null, lastMessages: [] as string[] } : await briefContext(d.ticketId || null, await Lead.findByPk(s.leadId));
      const brief = briefOf(s, { stageName: await ports.stageName(await ports.stageKeyNow()), ...ctx });
      if (d.writeBrief) await d.writeBrief(brief);
      ports.audit.push({ kind: "note", text: "Preparou o resumo para o consultor" });
      await ports.event("handoff_brief");
      break;
    }
    case "start_analysis": {
      const out = await runAcademicTool("iniciar_analise_curricular", {}, d.academic);
      s.slots = { ...s.slots, ...d.academic.patch };
      if (out.iniciada || out.simulado || out.jaExiste) {
        await ports.event("analysis_requested");
        if (s.slots.analysisStatus === "completed") await ports.event("analysis_completed");
        await goTo(ports, s.slots.analysisStatus === "completed" ? "analysis_done" : "curricular_analysis", "histórico recebido");
      } else if (out.motivo === "sem_arquivo") {
        await goTo(ports, "waiting_transcript", "histórico ainda não enviado");
        await ports.task("transcript:wait", "Aguardar histórico acadêmico", new Date(now.getTime() + 2 * 86400000), "documentos");
      }
      break;
    }
    default:
      break;
  }
  await ports.save();
  return varsOf(ports);
};

export { commercialTurn };
