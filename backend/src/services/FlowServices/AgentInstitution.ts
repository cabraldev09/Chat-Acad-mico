import { cleanStage } from "./StageSpec";
import { Graph } from "./Graph";

export const sameAgentInstitution = (agentInstitutionId: number | null | undefined, targetInstitutionId: number | null | undefined, legacyInstitutionId: number | null): boolean =>
  Number(agentInstitutionId || legacyInstitutionId || 0) === Number(targetInstitutionId || legacyInstitutionId || 0);

export const stageAgentIds = (graph: Graph): number[] => [...new Set(graph.nodes
  .filter(node => node.type === "stage")
  .map(node => Number(cleanStage(node.data).agentId) || 0)
  .filter(id => id > 0))];
