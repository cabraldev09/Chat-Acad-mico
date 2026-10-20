import { describe, expect, it } from "vitest";
import { reconcileWithMatrix, similarity, type MatrixComponent } from "@/services/pipeline/reconcile";

const m = (semester: number, name: string): MatrixComponent => ({ semester, code: null, name, workload: 40, type: null });
const matrix = [
  m(2, "ATIVIDADES DE EXTENSÃO: INTEGRAÇÃO DE COMPETÊNCIAS DOCENTES EM QUÍMICA I"),
  m(3, "ATIVIDADES DE EXTENSÃO: INTEGRAÇÃO DE COMPETÊNCIAS DOCENTES EM QUÍMICA II"),
  m(4, "ATIVIDADES DE EXTENSÃO: INTEGRAÇÃO DE COMPETÊNCIAS DOCENTES EM QUÍMICA III"),
  m(5, "QUÍMICA ORGÂNICA II"),
  m(6, "QUÍMICA ORGÂNICA III"),
  m(8, "LÍNGUA PORTUGUESA"),
  m(8, "PSICOLOGIA DA EDUCAÇÃO")
];
const row = (name: string, period: number, usedSubject: string | null, periodKnown = true) => ({ name, period, usedSubject, periodKnown });

describe("a leitura da IA é conferida com a matriz oficial do curso", () => {
  it("o numeral romano lido errado é corrigido pela série (a cursar)", () => {
    const r = reconcileWithMatrix([row("ATIVIDADES DE EXTENSÃO: INTEGRAÇÃO DE COMPETÊNCIAS DOCENTES EM QUÍMICA II", 4, null), row("QUÍMICA ORGÂNICA II", 6, null)], matrix);
    expect(r.subjects[0].name).toMatch(/QUÍMICA III$/);
    expect(r.subjects[0].period).toBe(4);
    expect(r.subjects[1].name).toBe("QUÍMICA ORGÂNICA III");
    expect(r.subjects[1].period).toBe(6);
  });
  it("a dispensada sem série recebe o semestre da matriz só para mostrar", () => {
    const r = reconcileWithMatrix([row("LINGUA PORTUGUESA", 5, "LÍNGUA PORTUGUESA", false), row("PSICOLOGIA DA EDUCAÇAO", 5, "PSICOLOGIA DA EDUCAÇÃO", false)], matrix);
    expect(r.subjects.map((s) => s.matrixPeriod)).toEqual([8, 8]);
    expect(r.subjects.map((s) => s.period)).toEqual([5, 5]);
  });
  it("uma dispensada com numeral errado fica com a disciplina que ninguém levou", () => {
    const r = reconcileWithMatrix([row("QUÍMICA ORGÂNICA II", 5, "X", false), row("QUÍMICA ORGÂNICA II", 5, "Y", false)], matrix);
    expect(r.subjects.map((s) => s.name).sort()).toEqual(["QUÍMICA ORGÂNICA II", "QUÍMICA ORGÂNICA III"]);
  });
  it("o que não casa é só avisado, e o que a matriz tem a mais também", () => {
    const r = reconcileWithMatrix([row("DISCIPLINA QUE NÃO EXISTE NA MATRIZ", 1, null)], matrix);
    expect(r.unmatched).toEqual(["DISCIPLINA QUE NÃO EXISTE NA MATRIZ"]);
    expect(r.missing.length).toBe(matrix.length);
    expect(r.warnings.every((w) => w.severity === "INFO")).toBe(true);
    expect(r.subjects[0].name).toBe("DISCIPLINA QUE NÃO EXISTE NA MATRIZ");
  });
  it("numerais diferentes nunca parecem a mesma disciplina", () => {
    expect(similarity("QUÍMICA ORGÂNICA II", "QUÍMICA ORGÂNICA III")).toBeLessThan(0.8);
    expect(similarity("Química Orgânica II", "QUIMICA ORGANICA II")).toBe(1);
  });
});
