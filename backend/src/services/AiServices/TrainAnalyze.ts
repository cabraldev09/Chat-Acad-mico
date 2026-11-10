import AiAgent from "../../models/AiAgent";
import { askModel } from "./Training";
import { TrainResult, emptyResult, mergeResults, normalizeResult, parseJson } from "./TrainingText";
import { chunkLines } from "./ChatExport";

// Reads a conversation of the team (or a document of the process) and proposes what the agent should learn. Nothing is saved here: the owner reviews first.

export const MAX_CHUNKS = 6;
const CHUNK = 14000;

const FORMAT = [
  "Responda SOMENTE com um objeto JSON, sem texto fora dele:",
  '{"style":["..."],"steps":[{"title":"...","objective":"...","say":"...","ask":"...","collect":["..."],"advanceWhen":"..."}],"knowledge":[{"title":"...","content":"..."}],"examples":[{"customer":"...","answer":"..."}]}',
  "- style: o jeito de falar do atendente (tom, tamanho das mensagens, saudação, expressões que ele repete, uso de emoji). Frases curtas e práticas, no máximo 8.",
  "- steps: o passo a passo que o atendente segue do primeiro contato até passar para o fechamento, NA ORDEM em que acontece. Cada passo: title curto; objective (o que se quer nesse passo); say (o que ele diz, no jeito dele); ask (o que ele pergunta); collect (dados que ele descobre, ex.: \"cidade\", \"curso\"); advanceWhen (o que precisa acontecer para ir ao próximo). Só passos que realmente aparecem.",
  "- knowledge: fatos concretos da instituição que o atendente informa (cursos, prazos, condições, como funciona). Nada de dados pessoais de clientes e nenhum valor combinado só com uma pessoa.",
  "- examples: até 3 pares de pergunta do cliente e resposta exemplar do atendente, copiados no jeito dele.",
  "Se uma lista não tem nada, devolva []. Nunca invente o que não está no texto."
].join("\n");

const systemFor = (kind: "whatsapp" | "document"): string =>
  kind === "whatsapp"
    ? ["Você estuda conversas reais de atendimento de WhatsApp (linhas ATENDENTE e CLIENTE) para ensinar um robô a atender igual ao melhor atendente.", FORMAT].join("\n\n")
    : ["Você estuda um documento da empresa (roteiro, manual, procedimento de atendimento ou material de vendas) para ensinar um robô a atender seguindo exatamente esse processo.", FORMAT].join("\n\n");

const readChunk = async (agent: AiAgent, kind: "whatsapp" | "document", text: string): Promise<TrainResult> => {
  const raw = await askModel(agent, systemFor(kind), [{ role: "user", content: text }], 2200);
  return normalizeResult(parseJson(raw));
};

const CONSOLIDATE = [
  "Você recebe resultados parciais da leitura de um mesmo arquivo, em JSON. Junte tudo em UM resultado final no mesmo formato JSON:",
  "- remova repetições e ordene os steps na ordem real do atendimento (fundindo passos iguais);",
  "- style no máximo 8 itens, knowledge no máximo 20, examples no máximo 6;",
  "- não invente nada que não esteja nos resultados parciais.",
  FORMAT
].join("\n");

// how many pieces a text has and how many model calls the analysis makes (shown before the owner confirms)
export const planOf = (text: string): { chunks: number; used: number; calls: number } => {
  const chunks = chunkLines(text, CHUNK).length;
  const used = Math.min(chunks, MAX_CHUNKS);
  return { chunks, used, calls: used + (used > 1 ? 1 : 0) };
};

// long files: the pieces are spread over the whole file (the beginning, the middle and the end have different conversations)
export const pick = <T>(list: T[], max: number): T[] => {
  if (list.length <= max) return list;
  const out: T[] = [];
  for (let i = 0; i < max; i += 1) out.push(list[Math.floor((i * (list.length - 1)) / (max - 1))]);
  return out;
};

export const analyze = async (agent: AiAgent, kind: "whatsapp" | "document", text: string): Promise<TrainResult> => {
  const pieces = pick(chunkLines(text, CHUNK), MAX_CHUNKS);
  if (!pieces.length) return emptyResult();
  const parts: TrainResult[] = [];
  // three at a time: fast enough and gentle with the provider's limits
  for (let i = 0; i < pieces.length; i += 3) {
    // eslint-disable-next-line no-await-in-loop
    parts.push(...(await Promise.all(pieces.slice(i, i + 3).map(p => readChunk(agent, kind, p)))));
  }
  if (parts.length === 1) return parts[0];
  const merged = mergeResults(parts);
  try {
    const raw = await askModel(agent, CONSOLIDATE, [{ role: "user", content: JSON.stringify(merged).slice(0, 40000) }], 3000);
    const final = normalizeResult(parseJson(raw));
    // the consolidation can only help: if it came back empty, keep the plain merge
    return final.steps.length || final.style.length || final.knowledge.length ? final : merged;
  } catch (err) {
    return merged;
  }
};
