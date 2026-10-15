import { beforeEach, describe, expect, it } from "vitest";
import { classifySubject } from "@/domain/curricular-analysis/engine/classify";
import { calculateBacklogCapacity, calculateMaximumCapacity } from "@/domain/curricular-analysis/engine/capacity";
import { allocateBacklogSubjects, calculatePreviousBacklog } from "@/domain/curricular-analysis/engine/backlog";
import { calculateCurriculumTotals, groupSubjectsByPeriod } from "@/domain/curricular-analysis/engine/totals";
import { buildRowHash } from "@/domain/curricular-analysis/engine/row-hash";
import { simulateSemester } from "@/domain/curricular-analysis/simulation/simulate";
import { compareDocumentClaims } from "@/domain/curricular-analysis/validators/claims";
import { makePeriod, makeSubject, resetCounter, rules } from "../../fixtures/subjects";

beforeEach(() => resetCounter());

function semester(count: number, exempted: number, backlog = 0) {
  const periodSubjects = makePeriod(4, count, exempted);
  const availableBacklog = makePeriod(1, backlog);
  return simulateSemester({
    index: 0,
    term: "2026.1",
    periodNumber: 4,
    isAdditional: false,
    periodSubjects,
    availableBacklog,
    rules: rules(),
  }).semester;
}

describe("TESTE 1–3: capacidade e bônus das dispensas", () => {
  it("8 disciplinas, 0 dispensadas → regulares 8, capacidade 11, adaptações 3", () => {
    const s = semester(8, 0);
    expect(s.regularSubjectsToTake).toBe(8);
    expect(s.maximumCapacity).toBe(11);
    expect(s.backlogCapacity).toBe(3);
  });
  it("8 disciplinas, 2 dispensadas → regulares 6, capacidade 11, adaptações 5", () => {
    const s = semester(8, 2);
    expect(s.regularSubjectsToTake).toBe(6);
    expect(s.maximumCapacity).toBe(11);
    expect(s.backlogCapacity).toBe(5);
  });
  it("8 disciplinas, 5 dispensadas → regulares 3, capacidade 11, adaptações 8", () => {
    const s = semester(8, 5);
    expect(s.regularSubjectsToTake).toBe(3);
    expect(s.maximumCapacity).toBe(11);
    expect(s.backlogCapacity).toBe(8);
  });
  it("fórmulas isoladas", () => {
    expect(calculateMaximumCapacity(8, rules())).toBe(11);
    expect(calculateBacklogCapacity(11, 6)).toBe(5);
    expect(calculateBacklogCapacity(3, 6)).toBe(0);
    expect(calculateMaximumCapacity(8, rules({ extraSubjectsAllowed: 2 }))).toBe(10);
    expect(calculateMaximumCapacity(10, rules({ maximumSubjectsPerSemester: 11 }))).toBe(11);
    expect(calculateMaximumCapacity(12, rules({ maximumSubjectsPerSemester: 11 }))).toBe(12);
  });
});

describe("TESTE 4: alocação limitada pelo backlog disponível", () => {
  it("capacidade 5, backlog 2 → adiciona apenas 2", () => {
    const s = semester(8, 2, 2);
    expect(s.backlogCapacity).toBe(5);
    expect(s.subjectsFromBacklog).toBe(2);
    expect(s.semesterLoad).toBe(8);
    expect(s.remainingBacklog).toBe(0);
  });
  it("capacidade 5, backlog 9 → adiciona 5 e sobram 4", () => {
    const s = semester(8, 2, 9);
    expect(s.subjectsFromBacklog).toBe(5);
    expect(s.semesterLoad).toBe(11);
    expect(s.remainingBacklog).toBe(4);
    expect(s.semesterLoad).toBeLessThanOrEqual(s.maximumCapacity);
  });
  it("allocateBacklogSubjects preserva ordem", () => {
    const { allocated, remaining } = allocateBacklogSubjects(["a", "b", "c"], 2);
    expect(allocated).toEqual(["a", "b"]);
    expect(remaining).toEqual(["c"]);
  });
});

describe("TESTE 5: C.H. zero", () => {
  it("mantém a disciplina com carga horária 0", () => {
    const subjects = [makeSubject({ period: 1, workload: 0 }), makeSubject({ period: 1 })];
    const totals = calculateCurriculumTotals(subjects);
    expect(totals.total).toBe(2);
    expect(groupSubjectsByPeriod(subjects).get(1)).toHaveLength(2);
  });
});

describe("TESTE 6–8: classificação", () => {
  it('"-" → PENDENTE', () => expect(classifySubject({ usedSubject: "-" })).toBe("PENDING"));
  it("null → PENDENTE", () => expect(classifySubject({ usedSubject: null })).toBe("PENDING"));
  it("vazio / espaços → PENDENTE", () => {
    expect(classifySubject({ usedSubject: "" })).toBe("PENDING");
    expect(classifySubject({ usedSubject: "   " })).toBe("PENDING");
    expect(classifySubject({ usedSubject: "—" })).toBe("PENDING");
  });
  it('"CONTABILIDADE BÁSICA" → DISPENSADA', () =>
    expect(classifySubject({ usedSubject: "CONTABILIDADE BÁSICA" })).toBe("EXEMPTED"));
  it("nome diferente da grade continua DISPENSADA", () =>
    expect(classifySubject({ usedSubject: "CONTABILIDADE BÁSICA" })).toBe("EXEMPTED"));
  it("leitura UNCLEAR → REVISAR", () =>
    expect(classifySubject({ usedSubject: "ALGO", readability: "UNCLEAR" })).toBe("REVIEW"));
});

describe("TESTE 9: repetição de disciplina utilizada", () => {
  it("mantém as três linhas", () => {
    const subjects = ["A", "B", "C"].map((n) => makeSubject({ period: 1, name: n, usedSubject: "CONTABILIDADE BÁSICA" }));
    const totals = calculateCurriculumTotals(subjects);
    expect(totals.total).toBe(3);
    expect(totals.exempted).toBe(3);
  });
});

describe("TESTE 10: divergência com o documento", () => {
  it("documento declara 20, motor calcula 21 → DOCUMENT_TOTAL_MISMATCH", () => {
    const subjects = makePeriod(1, 21);
    const totals = calculateCurriculumTotals(subjects);
    const { warnings, comparisons } = compareDocumentClaims(
      [{ type: "PENDING_TOTAL", value: 20, sourcePage: 3 }],
      totals,
      { entryPeriod: 4, previousBacklogCount: 21 },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("DOCUMENT_TOTAL_MISMATCH");
    expect(warnings[0].message).toContain("20");
    expect(warnings[0].message).toContain("21");
    expect(comparisons[0].matches).toBe(false);
  });
  it("valores iguais não geram alerta", () => {
    const totals = calculateCurriculumTotals(makePeriod(1, 20));
    const { warnings } = compareDocumentClaims([{ type: "PENDING_TOTAL", value: 20, sourcePage: 1 }], totals, { entryPeriod: null, previousBacklogCount: null });
    expect(warnings).toHaveLength(0);
  });
});

describe("Backlog (§14, §15)", () => {
  it("considera apenas pendências de períodos anteriores ao ingresso, mais antigas primeiro", () => {
    const p3 = makePeriod(3, 3, 1);
    const p1 = makePeriod(1, 2, 0);
    const p2 = makePeriod(2, 2, 1);
    const p4 = makePeriod(4, 5, 0);
    const backlog = calculatePreviousBacklog([...p3, ...p1, ...p2, ...p4], 4, rules());
    expect(backlog.map((s) => s.period)).toEqual([1, 1, 2, 3, 3]);
    // dentro do período, ordem do documento
    const p3Pending = p3.filter((s) => s.status === "PENDING").map((s) => s.id);
    expect(backlog.filter((s) => s.period === 3).map((s) => s.id)).toEqual(p3Pending);
  });
  it("disciplina REVISAR entra no backlog quando reviewCountsAsPending", () => {
    const subjects = [makeSubject({ period: 1, readability: "UNCLEAR", usedSubject: "X" })];
    expect(calculatePreviousBacklog(subjects, 2, rules())).toHaveLength(1);
    expect(calculatePreviousBacklog(subjects, 2, rules({ reviewCountsAsPending: false }))).toHaveLength(0);
  });
});

describe("Identidade da linha (§10)", () => {
  it("mesmo nome em períodos diferentes gera hashes diferentes", () => {
    const a = buildRowHash({ documentId: "d", page: 1, rowIndex: 1, subjectName: "ÉTICA", period: 1 });
    const b = buildRowHash({ documentId: "d", page: 1, rowIndex: 1, subjectName: "ÉTICA", period: 2 });
    expect(a).not.toBe(b);
    expect(a).toHaveLength(24);
  });
  it("é estável e normaliza espaços/caixa", () => {
    const a = buildRowHash({ documentId: "d", page: 2, rowIndex: 5, subjectName: "  Direito  Penal ", period: 1 });
    const b = buildRowHash({ documentId: "d", page: 2, rowIndex: 5, subjectName: "DIREITO PENAL", period: 1 });
    expect(a).toBe(b);
  });
});
