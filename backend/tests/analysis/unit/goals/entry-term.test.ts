import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/models/Goal", () => ({ default: {} }));
import { countsInGoal, goalTerm, normTerm, termOfTitle } from "../../../../src/helpers/EntryTerm";
import { goalStatusOf } from "../../../../src/controllers/EnrollmentController";

describe("a matrícula conta no semestre do período de entrada do aluno", () => {
  it("lê o período de entrada e o do nome da meta", () => {
    expect(normTerm("2026/2")).toBe("2026/2");
    expect(normTerm("2026.2")).toBe("2026/2");
    expect(normTerm("2026-1")).toBe("2026/1");
    expect(normTerm("")).toBeNull();
    expect(normTerm("2026/3")).toBeNull();
    expect(termOfTitle("Graduação 2º semestre de 2026")).toBe("2026/2");
    expect(termOfTitle("Graduação 1o semestre de 2027")).toBe("2027/1");
    expect(termOfTitle("Meta de novembro")).toBeNull();
    expect(goalTerm({ entryTerm: "2027/1", title: "Graduação 2º semestre de 2026" })).toBe("2027/1");
    expect(goalTerm({ entryTerm: null, title: "Graduação 2º semestre de 2026" })).toBe("2026/2");
  });

  it("um aluno de 2026/2 matriculado em 23/11 conta no 2026.2 (que terminou em 15/11) e não no 2027.1", () => {
    const known = new Set(["2026/2", "2027/1"]);
    const g262 = { term: "2026/2", start: "2026-05-14", end: "2026-11-15" };
    const g271 = { term: "2027/1", start: "2026-11-17", end: "2027-05-03" };
    expect(countsInGoal({ entryTerm: "2026/2", day: "2026-11-23" }, g262, known)).toBe(true);
    expect(countsInGoal({ entryTerm: "2026/2", day: "2026-11-23" }, g271, known)).toBe(false);
    // a student of 2027/1 enrolled before the 2027.1 period starts counts in 2027.1
    expect(countsInGoal({ entryTerm: "2027/1", day: "2026-11-10" }, g271, known)).toBe(true);
    expect(countsInGoal({ entryTerm: "2027/1", day: "2026-11-10" }, g262, known)).toBe(false);
  });

  it("sem período no aluno, ou com um período que nenhuma meta tem, vale a data", () => {
    const known = new Set(["2026/2", "2027/1"]);
    const g271 = { term: "2027/1", start: "2026-11-17", end: "2027-05-03" };
    expect(countsInGoal({ entryTerm: null, day: "2026-11-23" }, g271, known)).toBe(true);
    expect(countsInGoal({ entryTerm: "", day: "2026-11-16" }, g271, known)).toBe(false);
    expect(countsInGoal({ entryTerm: "2025/1", day: "2026-11-23" }, g271, known)).toBe(true);
    // a goal without a term counts by the day
    expect(countsInGoal({ entryTerm: "2026/2", day: "2026-11-23" }, { term: null, start: "2026-11-17", end: "2027-05-03" }, known)).toBe(true);
  });

  it("a lista de Matrículas realizadas usa a mesma regra", () => {
    const known = new Set(["2026/2", "2027/1"]);
    const periods = [
      { title: "Graduação 2º semestre de 2026", start: "2026-05-14", end: "2026-11-15", term: "2026/2" },
      { title: "Graduação 1º semestre de 2027", start: "2026-11-17", end: "2027-05-03", term: "2027/1" }
    ];
    expect(goalStatusOf("2026-11-23", periods, "2026/2", known)).toEqual({ inGoal: true, goal: "Graduação 2º semestre de 2026" });
    expect(goalStatusOf("2026-11-23", periods, null, known)).toEqual({ inGoal: true, goal: "Graduação 1º semestre de 2027" });
  });
});
