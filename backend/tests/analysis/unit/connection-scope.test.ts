import { describe, expect, it } from "vitest";

import { ticketScopeWhere, ticketVisibleIn } from "../../../src/helpers/ConnectionScope";

const scope = { all: false, own: [5], others: [7, 8] };

describe("which conversations a person may see by connection", () => {
  it("administration and coordination are not restricted", () => {
    expect(ticketScopeWhere({ all: true, own: [], others: [] }, 1)).toBeNull();
    expect(ticketVisibleIn({ all: true, own: [], others: [] }, { isGroup: true, whatsappId: 9, userId: null }, 1)).toBe(true);
  });

  it("groups and communities only from the numbers the person owns", () => {
    expect(ticketVisibleIn(scope, { isGroup: true, whatsappId: 5, userId: null }, 1)).toBe(true);
    expect(ticketVisibleIn(scope, { isGroup: true, whatsappId: 7, userId: null }, 1)).toBe(false);
    // a group of the institution's shared number is not theirs either
    expect(ticketVisibleIn(scope, { isGroup: true, whatsappId: 9, userId: null }, 1)).toBe(false);
    expect(ticketVisibleIn(scope, { isGroup: true, whatsappId: null, userId: null }, 1)).toBe(false);
  });

  it("private chats: never those of a number that belongs to someone else", () => {
    expect(ticketVisibleIn(scope, { isGroup: false, whatsappId: 7, userId: null }, 1)).toBe(false);
    expect(ticketVisibleIn(scope, { isGroup: false, whatsappId: 9, userId: null }, 1)).toBe(true);
    expect(ticketVisibleIn(scope, { isGroup: false, whatsappId: 5, userId: null }, 1)).toBe(true);
  });

  it("tutoring and support conversations are not hidden by the number they live on", () => {
    expect(ticketVisibleIn(scope, { isGroup: false, whatsappId: 7, userId: null, segment: "onboarding" }, 1)).toBe(true);
    expect(ticketVisibleIn(scope, { isGroup: false, whatsappId: 7, userId: null, segment: "sales" }, 1)).toBe(false);
    // groups stay with the owner of the number whatever the segment
    expect(ticketVisibleIn(scope, { isGroup: true, whatsappId: 7, userId: null, segment: "onboarding" }, 1)).toBe(false);
  });

  it("what is assigned to the person stays visible", () => {
    expect(ticketVisibleIn(scope, { isGroup: false, whatsappId: 7, userId: 1 }, 1)).toBe(true);
  });

  it("builds a where clause only for restricted people", () => {
    expect(ticketScopeWhere(scope, 1)).not.toBeNull();
  });
});
