import { describe, expect, it } from "vitest";
import { agendaModeOf, bestPhoneName, isPlaceholderName, namesToComplete } from "../../src/helpers/PhoneNames";

describe("names from the phone", () => {
  it("a contact that is only the number gets the name of the address book", () => {
    const out = namesToComplete(
      [{ id: 1, name: "5511972454710", number: "5511972454710" }],
      [{ number: "5511972454710", name: "Maria Souza", pushname: "Mari" }]
    );
    expect(out).toEqual([{ id: 1, name: "Maria Souza" }]);
  });

  it("without the address book, the profile name; then the business name", () => {
    expect(namesToComplete([{ id: 2, name: "+55 69 9340-6285", number: "556993406285" }], [{ number: "556993406285", pushname: "Joana" }]))
      .toEqual([{ id: 2, name: "Joana" }]);
    expect(bestPhoneName({ verifiedName: "Auto Seguros" })).toBe("Auto Seguros");
    expect(bestPhoneName({ pushname: "5511999" })).toBe("");
  });

  it("a name somebody typed is never replaced", () => {
    expect(isPlaceholderName({ id: 3, name: "Cliente da feira", number: "5511900000000" })).toBe(false);
    expect(namesToComplete([{ id: 3, name: "Cliente da feira", number: "5511900000000" }], [{ number: "5511900000000", name: "Outro" }])).toEqual([]);
  });

  it("matches by the internal id when the phone does not show the number", () => {
    expect(namesToComplete([{ id: 4, name: "123456789012345", number: null, lid: "123456789012345" }], [{ lid: "123456789012345", pushname: "Carlos" }]))
      .toEqual([{ id: 4, name: "Carlos" }]);
  });

  it("a consultant's or tutor's own number creates nobody from its address book", () => {
    expect(agendaModeOf("consultor")).toBe("complete");
    expect(agendaModeOf("tutor")).toBe("complete");
    expect(agendaModeOf("admin")).toBe("import");
    expect(agendaModeOf(null)).toBe("import");
  });
});
