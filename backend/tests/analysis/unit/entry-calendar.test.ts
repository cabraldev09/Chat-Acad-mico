import { describe, expect, it, vi } from "vitest";

let stored = "";
vi.mock("../../../src/helpers/AppSettings", () => ({
  getSetting: async (_k: string, fallback = "") => stored || fallback,
  setSetting: async (_k: string, v: string) => { stored = v; }
}));

import { DEFAULT_CALENDAR, dueDatesOf, getEntryCalendar, normalizeCalendar, saveEntryCalendar, startOf, turmaFor } from "../../../src/services/CrmServices/EntryCalendar";

const at = (day: string) => turmaFor(DEFAULT_CALENDAR, day);

describe("calendário de entradas 2027/1", () => {
  it("a data da matrícula escolhe a turma, inclusive no primeiro e no último dia de cada período", () => {
    expect(at("2026-11-17")?.name).toBe("Fevereiro");
    expect(at("2026-11-23")?.name).toBe("Fevereiro");
    expect(at("2027-02-01")?.name).toBe("Fevereiro");
    expect(at("2027-02-03")?.name).toBe("Março");
    expect(at("2027-03-01")?.name).toBe("Março");
    expect(at("2027-03-03")?.name).toBe("Abril");
    expect(at("2027-04-01")?.name).toBe("Abril");
    expect(at("2027-04-03")?.name).toBe("Maio");
    expect(at("2027-05-03")?.name).toBe("Maio");
  });

  it("um dia entre dois períodos fica com a próxima turma; antes do primeiro, a primeira; depois do último, nenhuma", () => {
    expect(at("2027-02-02")?.name).toBe("Março");
    expect(at("2027-04-02")?.name).toBe("Maio");
    expect(at("2026-10-01")?.name).toBe("Fevereiro");
    expect(at("2027-05-04")).toBeNull();
  });

  it("parcelas do 1º semestre por turma: fevereiro 6, março 5, abril 4, maio 3", () => {
    expect(DEFAULT_CALENDAR.map(t => [t.name, t.installments])).toEqual([["Fevereiro", 6], ["Março", 5], ["Abril", 4], ["Maio", 3]]);
  });

  it("a 1ª mensalidade vence no prazo do boleto e a 2ª no dia contratado do mês seguinte", () => {
    const fev = at("2026-12-10")!;
    expect(dueDatesOf(fev, 10)).toEqual({ firstDueDate: "2027-02-01", secondDueDate: "2027-03-10" });
    expect(dueDatesOf(at("2027-04-20")!, 31)).toEqual({ firstDueDate: "2027-05-03", secondDueDate: "2027-06-28" });
    const dez = { ...fev, boletoDeadline: "2026-12-15" };
    expect(dueDatesOf(dez, 5).secondDueDate).toBe("2027-01-05");
    expect(startOf(fev)).toEqual({ startYear: 2027, startSemester: 1 });
  });

  it("turmas incompletas ou repetidas são descartadas e a lista fica ordenada pelo prazo do boleto", () => {
    const list = normalizeCalendar([
      { term: "2027/2", name: "Agosto", from: "2027-06-01", to: "2027-08-02", boletoDeadline: "2027-08-02", installments: 6 },
      { term: "2027/1", name: "Março", from: "2027-02-03", to: "2027-03-01", boletoDeadline: "2027-03-01", installments: 5 },
      { term: "2027/1", name: "Março", from: "2027-02-03", to: "2027-03-01", boletoDeadline: "2027-03-01", installments: 5 },
      { term: "2027", name: "Sem semestre", from: "2027-02-03", to: "2027-03-01", boletoDeadline: "2027-03-01", installments: 5 },
      { term: "2027/1", name: "Fim antes do início", from: "2027-03-03", to: "2027-02-01", boletoDeadline: "2027-03-01", installments: 5 },
      { term: "2027/1", name: "Parcelas demais", from: "2027-02-03", to: "2027-03-01", boletoDeadline: "2027-03-01", installments: 20 }
    ]);
    expect(list.map(t => t.key)).toEqual(["2027/1|Março", "2027/2|Agosto"]);
  });

  it("sem calendário salvo vale o padrão; o salvo substitui o padrão", async () => {
    stored = "";
    expect((await getEntryCalendar()).length).toBe(4);
    await saveEntryCalendar([{ term: "2027/2", name: "Agosto", from: "2027-06-01", to: "2027-08-02", boletoDeadline: "2027-08-02", installments: 6 }]);
    expect((await getEntryCalendar()).map(t => t.name)).toEqual(["Agosto"]);
    stored = "";
  });
});
