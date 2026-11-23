import { describe, expect, it, vi } from "vitest";
import { resolveAgentInstitutionId } from "../../../src/services/AiServices/AgentInstitution";

describe("quick agent institution selection", () => {
  it("creates in selected active institution B even when institution A is the default", async () => {
    const findActive = vi.fn(async (id: number) => [1, 2].includes(id) ? { id } : null);
    await expect(resolveAgentInstitutionId(2, 1, findActive)).resolves.toBe(2);
    expect(findActive).toHaveBeenCalledWith(2);
  });

  it("keeps the default for older clients that omit the field and rejects inactive/unknown ids", async () => {
    const findActive = vi.fn(async (id: number) => id === 1 ? { id } : null);
    await expect(resolveAgentInstitutionId(undefined, 1, findActive)).resolves.toBe(1);
    await expect(resolveAgentInstitutionId(2, 1, findActive)).rejects.toMatchObject({ message: "ERR_INSTITUTION_NOT_FOUND" });
  });
});
