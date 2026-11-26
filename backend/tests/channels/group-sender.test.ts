import { describe, expect, it } from "vitest";
import { nameOrNotify } from "../../src/helpers/ParticipantName";
import { betterNameOf } from "../../src/services/ContactServices/CreateOrUpdateContactService";

describe("quem escreveu no grupo", () => {
  it("o nome que a pessoa mostra no WhatsApp entra no lugar do número ou do Contato sem telefone", () => {
    expect(nameOrNotify({ name: "Contato sem telefone", number: "", lid: "123" }, "Pedro Tutor")).toBe("Pedro Tutor");
    expect(nameOrNotify({ name: "5569911112222", number: "5569911112222" }, "Laura")).toBe("Laura");
    expect(nameOrNotify({ name: "", number: "" }, "")).toBe("Participante");
  });

  it("um nome salvo no celular não é trocado pelo do perfil", () => {
    expect(nameOrNotify({ name: "Adriele Tutora", number: "5569900000001" }, "Dri")).toBe("Adriele Tutora");
  });

  it("um nome de perfil que é só número não vale", () => {
    expect(nameOrNotify({ name: "5569911112222", number: "5569911112222" }, "+55 69 9111")).toBe("5569911112222");
  });
});

describe("nome do contato", () => {
  it("um grupo renomeado no WhatsApp muda de nome aqui", () => {
    expect(betterNameOf("Polo Vilhena", "Ambientação Vilhena", "120363000000000001", true)).toBe(true);
    expect(betterNameOf("Ambientação Vilhena", "Ambientação Vilhena", "120363000000000001", true)).toBe(false);
    // the generic name of a community never replaces a real one
    expect(betterNameOf("Polo Vilhena", "Comunidade", "120363000000000002", true)).toBe(false);
  });

  it("de uma pessoa, só troca o número ou um nome provisório; o nome digitado fica", () => {
    expect(betterNameOf("Contato sem telefone", "Pedro Tutor", "")).toBe(true);
    expect(betterNameOf("5569911112222", "Laura", "5569911112222")).toBe(true);
    expect(betterNameOf("Laura da Secretaria", "Laura", "5569911112222")).toBe(false);
  });
});
