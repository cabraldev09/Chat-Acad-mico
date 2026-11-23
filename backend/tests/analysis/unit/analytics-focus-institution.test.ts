import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn(async () => []) }));
vi.mock("../../../src/database", () => ({ default: { query } }));

import { focusFor } from "../../../src/services/AnalyticsServices/Focus";

describe("consultant focus institution scope", () => {
  beforeEach(() => query.mockClear());

  it("scopes tasks, follow-ups and tickets to the selected institution", async () => {
    await focusFor(23, { id: 7, isDefault: false, isLegacy: false });

    expect(query).toHaveBeenCalledTimes(3);
    for (const [sql, options] of query.mock.calls) {
      expect(String(sql)).toMatch(/"institutionId" = :institutionId/);
      expect((options as any).replacements.institutionId).toBe(7);
      expect((options as any).replacements.includeLegacy).toBe(false);
    }
  });

  it("includes NULL legacy leads and tickets only for the migration-time institution", async () => {
    await focusFor(23, { id: 3, isDefault: false, isLegacy: true });

    expect(query).toHaveBeenCalledTimes(3);
    for (const [sql, options] of query.mock.calls) {
      expect(String(sql)).toMatch(/"institutionId" IS NULL/);
      expect((options as any).replacements.institutionId).toBe(3);
      expect((options as any).replacements.includeLegacy).toBe(true);
    }
  });
});
