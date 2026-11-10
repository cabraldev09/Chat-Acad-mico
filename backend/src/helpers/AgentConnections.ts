// The connections an AI agent answers on: the single one it had before (whatsappId) and the list chosen now (whatsappIds), without repeats.
// Empty means "every connection that no other agent serves".
export const cleanConnectionIds = (value: unknown): number[] => {
  const list = Array.isArray(value) ? value : typeof value === "string" && value.trim().startsWith("[") ? (() => { try { return JSON.parse(value); } catch { return []; } })() : [];
  return [...new Set((list as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 50);
};

export const connectionsOf = (agent: { whatsappId?: number | null; whatsappIds?: unknown }): number[] =>
  cleanConnectionIds([agent.whatsappId, ...cleanConnectionIds(agent.whatsappIds)]);
