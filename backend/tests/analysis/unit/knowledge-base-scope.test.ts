import { describe, expect, it } from "vitest";
import { kbDocumentBelongsToAgent } from "../../../src/services/AiServices/KnowledgeBaseScope";

describe("knowledge-base route scope", () => {
  it("allows documents owned by the agent in the parent route", () => {
    expect(kbDocumentBelongsToAgent(17, 17)).toBe(true);
  });

  it("keeps explicitly shared documents visible to every agent", () => {
    expect(kbDocumentBelongsToAgent(null, 17)).toBe(true);
  });

  it("does not let an agent route read, update, or delete another agent's document", () => {
    expect(kbDocumentBelongsToAgent(23, 17)).toBe(false);
  });
});
