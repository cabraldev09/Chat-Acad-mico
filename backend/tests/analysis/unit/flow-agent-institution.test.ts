import { describe, expect, it } from "vitest";
import { sameAgentInstitution, stageAgentIds } from "../../../src/services/FlowServices/AgentInstitution";

describe("AI stage institution scope", () => {
  it("accepts the same institution and legacy rows for the historical default only", () => {
    expect(sameAgentInstitution(12, 12, 4)).toBe(true);
    expect(sameAgentInstitution(null, 4, 4)).toBe(true);
    expect(sameAgentInstitution(null, 12, 4)).toBe(false);
  });

  it("collects every selected stage agent so save and publish validate them all", () => {
    expect(stageAgentIds({ nodes: [
      { id: "a", type: "stage", data: { agentId: 12 } },
      { id: "b", type: "stage", data: { agentId: 23 } },
      { id: "c", type: "message", data: { agentId: 99 } }
    ], edges: [] } as any)).toEqual([12, 23]);
  });
});
