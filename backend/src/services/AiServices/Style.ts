import AiAgent from "../../models/AiAgent";

// The four simple switches of "Como o agente fala" (kept in the persona of the agent). Nothing set = how the agent always behaved.
export interface Style {
  emoji: boolean | null; // true: may use emojis; false: none; null: the default (almost none)
  limitSubjects: boolean; // only the institution's subjects
  splitMessages: boolean; // long answers go out as short messages
  signMessages: boolean; // the name of the assistant opens the answer
}

export const styleOf = (agent: Pick<AiAgent, "persona"> | null | undefined): Style => {
  const p: any = (agent && agent.persona) || {};
  return {
    emoji: p.emoji === true ? true : p.emoji === false ? false : null,
    limitSubjects: p.limitSubjects !== false,
    splitMessages: p.splitMessages !== false,
    signMessages: p.signMessages === true
  };
};

// lines for the prompt: what the team chose wins over the general rules
export const styleRules = (agent: Pick<AiAgent, "persona"> | null | undefined): string | null => {
  const s = styleOf(agent);
  const lines: string[] = [];
  if (s.emoji === true) lines.push("- Pode usar emojis com naturalidade (até dois por mensagem). Esta regra vale mais que qualquer outra sobre emoji.");
  if (s.emoji === false) lines.push("- Não use emojis. Esta regra vale mais que qualquer outra sobre emoji.");
  if (s.limitSubjects) lines.push("- Fale apenas de assuntos da instituição (cursos, matrícula, polos, estudo, atendimento). Para qualquer outro assunto, diga com gentileza que não pode ajudar com isso e volte ao tema.");
  return lines.length ? `Estilo definido pela equipe:\n${lines.join("\n")}` : null;
};

// the name that signs an answer: the assistant's name when there is one, else the name of the agent
export const signatureOf = (agent: Pick<AiAgent, "persona" | "name">): string => String(((agent.persona as any) || {}).assistantName || agent.name || "").trim();

export const signed = (text: string, agent: Pick<AiAgent, "persona" | "name">): string => {
  const s = styleOf(agent);
  const name = signatureOf(agent);
  if (!s.signMessages || !name || !String(text || "").trim()) return text;
  return `*${name}:*\n${String(text).trim()}`;
};

// What the administrator turned off in "what the agent may ask" (commercial attendance): the model is told not to ask it, ever
const ASK_LABEL: Record<string, string> = {
  name: "o nome da pessoa", course: "o curso de interesse", city: "a cidade ou o polo", entry: "se é a primeira graduação ou se já tem formação anterior", modality: "a modalidade desejada", mainQuestion: "a principal dúvida"
};
export const askRules = (agent: Pick<AiAgent, "persona"> | null | undefined): string | null => {
  const ask: Record<string, boolean> = (agent && (agent.persona as any) && (agent.persona as any).commercial && (agent.persona as any).commercial.ask) || {};
  const off = Object.keys(ASK_LABEL).filter(k => ask[k] === false).map(k => ASK_LABEL[k]);
  return off.length ? `Perguntas que a equipe NÃO quer que você faça (só use se a pessoa disser por conta própria): ${off.join("; ")}.` : null;
};
