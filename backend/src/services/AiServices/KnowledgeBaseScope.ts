// Shared documents (agentId = null) are intentionally visible to every agent; all other documents
// must match the agent named in the parent route.
export const kbDocumentBelongsToAgent = (documentAgentId: number | null, agentId: number): boolean =>
  documentAgentId === null || Number(documentAgentId) === Number(agentId);
