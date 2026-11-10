import { describe, expect, it } from "vitest";

import { splitRegistered } from "../../../src/helpers/RegisteredNumber";

describe("the answer of WhatsApp about a number (phone or internal id)", () => {
  it("keeps the typed phone when WhatsApp answers the same phone", () => {
    expect(splitRegistered("5569992979581", "5569992979581")).toEqual({ phone: "5569992979581" });
  });

  it("follows the registered variant of a Brazilian number (the 9th digit)", () => {
    expect(splitRegistered("5569992979581", "556992979581")).toEqual({ phone: "556992979581" });
    expect(splitRegistered("556992979581", "5569992979581")).toEqual({ phone: "5569992979581" });
  });

  it("recognises WhatsApp's internal id: the phone stays the typed one and the id is kept apart", () => {
    expect(splitRegistered("556992979581", "146303933743178")).toEqual({ phone: "556992979581", lid: "146303933743178" });
  });

  it("uses the typed phone when WhatsApp does not know the number", () => {
    expect(splitRegistered("5569992979581", "")).toEqual({ phone: "5569992979581" });
    expect(splitRegistered("5569992979581", undefined as any)).toEqual({ phone: "5569992979581" });
  });
});
