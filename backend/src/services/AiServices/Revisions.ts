import AiAgent from "../../models/AiAgent";
import AiAgentRevision from "../../models/AiAgentRevision";
import AppError from "../../errors/AppError";

// What counts as "how the agent behaves": these fields are kept in the history and put back by a restore (never the key, the connection or on/off)
export const TRACKED: Array<[string, string]> = [
  ["name", "Nome"],
  ["systemPrompt", "Quem é o agente"],
  ["handoffMessage", "Mensagem ao passar para a equipe"],
  ["persona", "Como fala (tom, regras, estilo)"],
  ["slots", "O que descobrir do cliente"],
  ["functions", "Ações automáticas"],
  ["provider", "Provedor de IA"],
  ["model", "Modelo de IA"],
  ["maxTokens", "Tamanho da resposta"],
  ["dailyTokenCap", "Limite diário de tokens"],
  ["handoffAfterTurns", "Passar para a equipe após N respostas"],
  ["waitSeconds", "Espera antes de responder"],
  ["learnFromTeam", "Aprender com a equipe"],
  ["queueId", "Fila"],
  ["whatsappId", "Conexão"],
  ["whatsappIds", "Conexões"]
];

const KEYS = TRACKED.map(([k]) => k);
const MAX_PER_AGENT = 60;

export const snapshotOf = (agent: any): Record<string, any> => {
  const row = agent && typeof agent.get === "function" ? agent.get({ plain: true }) : agent || {};
  return KEYS.reduce((o: Record<string, any>, k) => ({ ...o, [k]: row[k] === undefined ? null : row[k] }), {});
};

const same = (a: any, b: any): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// the labels of what differs between two snapshots
export const changedLabels = (before: Record<string, any>, after: Record<string, any>): string[] =>
  TRACKED.filter(([k]) => !same(before[k], after[k])).map(([, label]) => label);

// kept after a change (the first change also keeps how the agent was before it, so the beginning can be restored)
export const recordRevision = async (agentId: number, before: Record<string, any>, after: Record<string, any>, userId: number | null, note?: string): Promise<void> => {
  const changed = changedLabels(before, after);
  if (!changed.length) return;
  if (!(await AiAgentRevision.count({ where: { agentId } }))) {
    await AiAgentRevision.create({ agentId, userId: null, note: "Como estava antes da primeira alteração registrada", fields: JSON.stringify([]), snapshot: JSON.stringify(before) } as any);
  }
  await AiAgentRevision.create({ agentId, userId, note: note || null, fields: JSON.stringify(changed), snapshot: JSON.stringify(after) } as any);
  const extra = await AiAgentRevision.findAll({ where: { agentId }, order: [["id", "DESC"]], offset: MAX_PER_AGENT, attributes: ["id"] });
  if (extra.length) await AiAgentRevision.destroy({ where: { id: extra.map(r => r.id) } });
};

export const restoreRevision = async (agent: AiAgent, revisionId: number, userId: number): Promise<AiAgent> => {
  const rev = await AiAgentRevision.findOne({ where: { id: revisionId, agentId: agent.id } });
  if (!rev) throw new AppError("ERR_NO_REVISION", 404);
  const snap = JSON.parse(rev.snapshot);
  const before = snapshotOf(agent);
  const patch: Record<string, any> = {};
  KEYS.forEach(k => { if (k in snap) patch[k] = snap[k]; });
  await agent.update(patch);
  await recordRevision(agent.id, before, snapshotOf(agent), userId, `Restaurado da versão de ${new Date(rev.createdAt).toLocaleString("pt-BR", { timeZone: "America/Porto_Velho" })}`);
  return agent;
};
