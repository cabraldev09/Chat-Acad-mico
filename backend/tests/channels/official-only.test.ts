import { describe, expect, it, vi } from "vitest";

// only the official API is connected: no WhatsApp by QR Code to look numbers up
vi.mock("../../src/helpers/QrChecker", () => ({ qrChecker: async () => null }));
vi.mock("../../src/providers/WhatsApp", () => ({ whatsappProvider: { checkNumber: async () => { throw new Error("ERR_WAPP_NOT_INITIALIZED"); }, getProfilePicUrl: async () => { throw new Error("no session"); } } }));

import CheckIsValidContact from "../../src/services/WbotServices/CheckIsValidContact";
import CheckContactNumber from "../../src/services/WbotServices/CheckNumber";
import GetProfilePicUrl from "../../src/services/WbotServices/GetProfilePicUrl";

describe("contacts with only the official API", () => {
  it("a well formed number is accepted without asking a QR session", async () => {
    await expect(CheckIsValidContact("5569992283812")).resolves.toBeUndefined();
    await expect(CheckIsValidContact("69992283812")).resolves.toBeUndefined();
  });
  it("a number without area code is refused with the usual error", async () => {
    await expect(CheckIsValidContact("12345")).rejects.toMatchObject({ message: "ERR_WAPP_INVALID_CONTACT" });
  });
  it("the number is normalized (55 + area code) and there is no picture", async () => {
    expect(await CheckContactNumber("(69) 99228-3812")).toBe("5569992283812");
    expect(await GetProfilePicUrl("5569992283812")).toBeUndefined();
  });
});
