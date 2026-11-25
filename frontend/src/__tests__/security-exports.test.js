import { describe, expect, it } from "vitest";
import { enrollmentsCsv } from "../utils/enrollmentsCsv";
import { API_ADDRESS_MARKER, publicApiBase } from "../utils/publicApiBase";

const rows = [
  { leadId: 41, enrollmentId: null, name: "Maria Souza", rgm: "1234567", course: "Pedagogia", polo: "Centro", owner: "João", at: "2026-11-20T15:00:00Z", inGoal: true, goal: "2026.2", proofId: 9 },
  { leadId: 42, enrollmentId: 3, name: "=HYPERLINK(1)", rgm: "7654321", course: "Direito", polo: "Norte", owner: "Ana", at: "2026-11-21T15:00:00Z", inGoal: false, goal: null, proofId: null }
];

describe("planilha de Matrículas realizadas", () => {
  it("fora da administração não leva nome nem RGM, só o identificador do lead", () => {
    const csv = enrollmentsCsv(rows, { full: false });
    expect(csv).not.toMatch(/Maria Souza|1234567|7654321|HYPERLINK/);
    expect(csv.split("\n")[0]).toMatch(/^"Lead";"Curso"/);
    expect(csv).toMatch(/"#41"/);
    expect(csv).toMatch(/"#42"/);
  });
  it("a administração recebe nome e RGM, e uma célula com fórmula vira texto", () => {
    const csv = enrollmentsCsv(rows, { full: true });
    expect(csv.split("\n")[0]).toMatch(/^"Aluno";"RGM";"Curso"/);
    expect(csv).toMatch(/"Maria Souza";"1234567"/);
    expect(csv).toMatch(/"'=HYPERLINK\(1\)"/);
  });
  it("sem linhas, só o cabeçalho", () => {
    expect(enrollmentsCsv(null).split("\n")).toHaveLength(1);
  });
});

describe("endereço mostrado na documentação da API", () => {
  it("nunca mostra IP nem nome que só soletra um IP", () => {
    for (const url of ["https://187.77.10.20", "https://187-77-10-20.sslip.io", "https://api.187.77.10.20.sslip.io/", "http://187.77.10.20.nip.io:8080", "http://[2804::1]:8080", "http://localhost:8080", "", null, "não é url"]) {
      expect(publicApiBase(url)).toBe(API_ADDRESS_MARKER);
    }
  });
  it("mostra o domínio público configurado", () => {
    expect(publicApiBase("https://api.chatacademico.com.br/")).toBe("https://api.chatacademico.com.br");
  });
});
