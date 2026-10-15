import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf, extractHeaderFields } from "@/services/pdf/parser";
import { effectiveRows, mergeContinuation, tableToText } from "@/services/pdf/table-detector";
import { crossCheckWithLocalTable, readHeaderMetadata } from "@/services/pipeline/cross-check";
import { redactPersonalData } from "@/services/pdf/redaction";

const synthetic = readFileSync(path.join(__dirname, "../../fixtures/sample-analise.pdf"));
const realPath = path.join(process.cwd(), "samples/analise-real-01.pdf");

describe("table-detector (fixture sintética)", () => {
  it("reconstrói as 28 linhas com C.H., série e disciplina utilizada", async () => {
    const local = await parsePdf(synthetic);
    const rows = effectiveRows(local.table!);
    expect(rows).toHaveLength(28);
    const r = rows.find((x) => x.name === "ACOMPANHAMENTO DE CARREIRA")!;
    expect(r.workload).toBe(0);
    expect(r.period).toBe(2);
    expect(r.usedSubject).toBe("CONTABILIDADE BASICA");
    expect(rows.filter((x) => x.usedSubject === null)).toHaveLength(20);
    expect(tableToText(local.table!)).toContain("[p1 l8]");
    expect(local.headerFields?.curso).toContain("DIREITO - EAD");
  });
});

describe("mergeContinuation", () => {
  it("remove a sobreposição repetida na quebra de página", () => {
    expect(mergeContinuation("TEORIA DOS GRAFOS", "GRAFOS")).toBe("TEORIA DOS GRAFOS");
    expect(mergeContinuation("AVALIAÇÃO EM CIÊNCIA DA", "CIÊNCIA DA COMPUTAÇÃO I")).toBe("AVALIAÇÃO EM CIÊNCIA DA COMPUTAÇÃO I");
    expect(mergeContinuation("COMPUTABILIDADE E COMPLEXIDADE", "E COMPLEXIDADE DE ALGORITMOS")).toBe("COMPUTABILIDADE E COMPLEXIDADE DE ALGORITMOS");
  });
});

describe("extractHeaderFields / readHeaderMetadata", () => {
  it("lê Curso, Série (ingresso) e Grade", () => {
    const f = extractHeaderFields(["Campus: CRUZEIRO - GRADUAÇÃO EAD", "Curso: CIÊNCIA DA COMPUTAÇÃO (BACHARELADO)", "Série: 4", "Período: EAD", "Grade: 20221/2023-2"]);
    const m = readHeaderMetadata({ pageCount: 1, pages: [], textByPage: [], parserVersion: "x", headerFields: f });
    expect(m.entryPeriod).toBe(4);
    expect(m.course).toBe("CIÊNCIA DA COMPUTAÇÃO (BACHARELADO)");
    expect(m.matrix).toBe("20221/2023-2");
    expect(m.modality).toBe("EAD");
  });
  it("lê os campos do cabeçalho alinhado do resultado de matrícula unificada", async () => {
    const pages = [{
      page: 1, width: 595, height: 842,
      lines: [
        { x: 58, y: 740, w: 430, h: 10, text: "CAMPUS / UNIDADE\tCURSO\tSEMESTRE DE ENTRADA", parts: [{ x: 58, w: 120, text: "CAMPUS / UNIDADE" }, { x: 224, w: 40, text: "CURSO" }, { x: 390, w: 100, text: "SEMESTRE DE ENTRADA" }] },
        { x: 58, y: 729, w: 430, h: 10, text: "CRUZEIRO - GRADUAÇÃO EAD\tCIÊNCIAS BIOLÓGICAS\t1º Semestre", parts: [{ x: 58, w: 150, text: "CRUZEIRO - GRADUAÇÃO EAD" }, { x: 224, w: 130, text: "CIÊNCIAS BIOLÓGICAS" }, { x: 390, w: 70, text: "1º Semestre" }] },
        { x: 224, y: 718, w: 90, h: 10, text: "(LICENCIATURA)", parts: [{ x: 224, w: 90, text: "(LICENCIATURA)" }] },
      ],
    }];
    // parsePdf é responsável por aplicar esse leitor; aqui reproduzimos o PDF
    // mínimo via uma chamada ao detector para assegurar que o layout não seja SIAA.
    const { detectTables } = await import("@/services/pdf/table-detector");
    const table = detectTables(pages);
    const local = { pageCount: 1, pages, textByPage: [], parserVersion: "x", table, headerFields: { campus: "CRUZEIRO - GRADUAÇÃO EAD", curso: "CIÊNCIAS BIOLÓGICAS (LICENCIATURA)", "semestre de entrada": "1º Semestre" } };
    expect(readHeaderMetadata(local).entryPeriod).toBe(1);
    expect(readHeaderMetadata(local).course).toBe("CIÊNCIAS BIOLÓGICAS (LICENCIATURA)");
  });
  it("mascara o CPF presente na URL do rodapé", () => {
    expect(redactPersonalData("...jsf?inicio=1&codigoEmpresa=12&cpfCandidato=1729124402&nrInscricao=2")).toContain("cpfCandidato=[CPF]");
  });
});

describe("table-detector (PDF real em samples/, pulado se ausente)", () => {
  it("reconstrói 74 linhas lógicas, resolve quebras de página e lê o cabeçalho", async (ctx) => {
    if (!existsSync(realPath)) return ctx.skip();
    const local = await parsePdf(readFileSync(realPath));
    const rows = effectiveRows(local.table!);
    expect(rows).toHaveLength(74);
    expect(local.table!.rows.length - rows.length).toBe(1); // repetição do código 3710 na quebra de página
    expect(rows.find((r) => r.code === "3710")?.name).toBe("COMPUTABILIDADE E COMPLEXIDADE DE ALGORITMOS");
    expect(rows.find((r) => r.code === "11319")?.name).toBe("AVALIAÇÃO INTEGRADA DE COMPETÊNCIAS EM CIÊNCIA DA COMPUTAÇÃO I");
    expect(rows.find((r) => r.code === "11330")?.name).toBe("TEORIA DOS GRAFOS");
    expect(rows.every((r) => r.code && r.period && r.workload !== null)).toBe(true);
    const byPeriod = rows.reduce<Record<number, number>>((a, r) => ((a[r.period!] = (a[r.period!] ?? 0) + 1), a), {});
    expect(byPeriod).toEqual({ 1: 11, 2: 9, 3: 9, 4: 9, 5: 9, 6: 9, 7: 9, 8: 9 });
    expect(rows.filter((r) => r.usedSubject).length).toBe(28);
    // textos longos da coluna "Disciplina Utilizada" começam à esquerda do centro da coluna
    expect(rows.find((r) => r.code === "3583")?.usedSubject).toContain("ESTRUTURA DE DADOS");
    const meta = readHeaderMetadata(local);
    expect(meta.entryPeriod).toBe(4);
    expect(meta.course).toContain("CIÊNCIA DA COMPUTAÇÃO");
    // cruzamento: extração idêntica não gera alertas; uma linha a menos gera alertas
    const asExtracted = rows.map((r, i) => ({ rowHash: `h${i}`, code: r.code, name: r.name, workload: r.workload!, period: r.period!, usedSubject: r.usedSubject, status: "PENDING" as const, readability: "CLEAR" as const, sourcePage: r.page, sourceRow: r.rowIndex, bbox: null, note: null, sortIndex: i }));
    expect(crossCheckWithLocalTable(local, asExtracted)).toEqual([]);
    const missing = crossCheckWithLocalTable(local, asExtracted.slice(1));
    expect(missing.map((w) => w.code)).toEqual(["LOCAL_ROW_COUNT_MISMATCH", "LOCAL_ROW_NOT_EXTRACTED"]);
  });
});

describe("table-detector (PDF real 2 — Pedagogia, pulado se ausente)", () => {
  it("64 linhas, 16 aproveitamentos, ingresso 4", async (ctx) => {
    const p = path.join(process.cwd(), "samples/analise-real-02-pedagogia.pdf");
    if (!existsSync(p)) return ctx.skip();
    const local = await parsePdf(readFileSync(p));
    const rows = effectiveRows(local.table!);
    expect(rows).toHaveLength(64);
    expect(rows.filter((r) => r.usedSubject).length).toBe(16);
    expect(rows.find((r) => r.code === "13472")?.usedSubject).toContain("FUNCIONAMENTO DA EDUCAÇÃO");
    expect(readHeaderMetadata(local).entryPeriod).toBe(4);
    expect(readHeaderMetadata(local).course).toContain("PEDAGOGIA");
  });
});

describe("matrícula unificada — lista de disciplinas a cursar", () => {
  const line = (y: number, parts: Array<[number, string]>) => ({ x: parts[0][0], y, w: 400, h: 10, text: parts.map((p) => p[1]).join("\t"), parts: parts.map(([x, text]) => ({ x, w: 60, text })) });

  it("lê todas as linhas mesmo com 'C.H. Tipo' colado no cabeçalho e nomes quebrados em duas linhas", async () => {
    const { detectTables } = await import("@/services/pdf/table-detector");
    const pages = [
      { page: 1, width: 595, height: 842, lines: [
        line(565, [[51, "DISCIPLINAS DISPENSADAS — 1"]]),
        line(542, [[57, "Disciplina Dispensada"], [328, "C.H."], [356, "Usada na Dispensa"], [484, "Situação"]]),
        line(493, [[57, "SISTEMAS OPERACIONAIS"], [329, "60h"], [356, "Sistemas Operacionais"]]),
        line(1, [[51, "4º Semestre"]]),
      ] },
      { page: 2, width: 595, height: 842, lines: [
        line(792, [[51, "DISCIPLINAS A CURSAR — 3"]]),
        line(768, [[57, "Disciplina"], [385, "Série"], [417, "C.H. Tipo"], [504, "Situação"]]),
        line(752, [[57, "AMBIENTAÇÃO DIGITAL"], [391, "1º"], [419, "20h"], [451, "Adaptação"], [506, "A cursar"]]),
        line(717, [[57, "ATIVIDADES DE EXTENSÃO: INTEGRAÇÃO DE COMPETÊNCIAS PARA"]]),
        line(712, [[391, "1º"], [419, "50h"], [451, "Adaptação"], [506, "A cursar"]]),
        line(708, [[57, "TRANSFORMAR O EU"]]),
        line(691, [[57, "PROJETO INTEGRADOR EM ANÁLISE"], [391, "4º"], [419, "20h"], [456, "Regular"]]),
        line(687, [[57, "DE SISTEMAS II"]]),
      ] },
    ];
    const rows = effectiveRows(detectTables(pages));
    const pending = rows.filter((r) => r.usedSubject === null);
    expect(rows).toHaveLength(4);
    expect(pending.map((r) => [r.name, r.workload, r.period])).toEqual([
      ["AMBIENTAÇÃO DIGITAL", 20, 1],
      ["ATIVIDADES DE EXTENSÃO: INTEGRAÇÃO DE COMPETÊNCIAS PARA TRANSFORMAR O EU", 50, 1],
      ["PROJETO INTEGRADOR EM ANÁLISE DE SISTEMAS II", 20, 4],
    ]);
  });
});
