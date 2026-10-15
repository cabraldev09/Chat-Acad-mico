import { describe, expect, it } from "vitest";
import { classifyCurricularAnalysisText, validateCurricularDocumentMetadata } from "@/services/pdf/document-classifier";

describe("classificador de documento curricular", () => {
  it("aceita o resultado de análise curricular do SIAA", () => {
    const result = classifyCurricularAnalysisText(
      "Análise Curricular Solicitação de Transferência Resumo do Aproveitamento Disciplinas Dispensadas — 10 Disciplinas a Cursar — 42 Disciplina C.H. Situação",
    );
    expect(result.accepted).toBe(true);
  });

  it("bloqueia documentos incompatíveis", () => {
    const result = classifyCurricularAnalysisText(
      "Boleto bancário contrato e comprovante de pagamento",
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("outro tipo de documento");
  });

  it("rejects incomplete transfer-analysis forms with missing academic identifiers", () => {
    const text = "Solicitação de Transferência ou 2ª Graduação — Análise Curricular Campus / Unidade Curso Semestre de Entrada Resumo do Aproveitamento Disciplinas Dispensadas Disciplinas a Cursar Situação de Ingresso Data da Análise C.H.";
    const initial = classifyCurricularAnalysisText(text);
    expect(initial.accepted).toBe(true);

    const rejected = validateCurricularDocumentMetadata(text, {
      campus: "",
      curso: "",
      "semestre de entrada": "0º Semestre",
    }, initial);
    expect(rejected.accepted).toBe(false);
    expect(rejected.missing).toEqual(["course", "entryPeriod"]);
    expect(rejected.reason).toBe("O PDF do SIAA veio sem curso e semestre de entrada. Informe esses dados no envio para iniciar a análise.");
  });

  it("aceita o PDF com cabeçalho em branco quando curso e semestre de entrada são informados no envio", () => {
    const text = "Solicitação de Transferência ou 2ª Graduação — Análise Curricular Campus / Unidade Curso Semestre de Entrada Resumo do Aproveitamento Disciplinas Dispensadas Disciplinas a Cursar Situação de Ingresso Data da Análise C.H.";
    const initial = classifyCurricularAnalysisText(text);
    const blank = { "semestre de entrada": "º Semestre" };
    expect(validateCurricularDocumentMetadata(text, blank, initial, { courseName: "CST EM GESTÃO PÚBLICA", entryPeriod: 1 }).accepted).toBe(true);
    const onlyCourse = validateCurricularDocumentMetadata(text, blank, initial, { courseName: "CST EM GESTÃO PÚBLICA" });
    expect(onlyCourse.missing).toEqual(["entryPeriod"]);
    expect(onlyCourse.reason).toContain("sem semestre de entrada. Informe esse dado");
    // O semestre do PDF continua valendo; o campus em branco não bloqueia.
    expect(validateCurricularDocumentMetadata(text, { curso: "PEDAGOGIA (LICENCIATURA)", "semestre de entrada": "4º Semestre" }, initial).accepted).toBe(true);
  });

  it("cabeçalho todo em branco (como o PDF do SIAA com campus/curso/semestre vazios) pede curso e semestre; aceita do 1º ao 20º", () => {
    const text = "Solicitação de Transferência ou 2ª Graduação — Análise Curricular Campus / Unidade Curso Semestre de Entrada Resumo do Aproveitamento Disciplinas Dispensadas Disciplinas a Cursar Situação de Ingresso Data da Análise C.H.";
    const initial = classifyCurricularAnalysisText(text);
    const blank = { "semestre de entrada": "º Semestre" };
    expect(validateCurricularDocumentMetadata(text, blank, initial).missing).toEqual(["course", "entryPeriod"]);
    for (const entryPeriod of [1, 12, 20])
      expect(validateCurricularDocumentMetadata(text, blank, initial, { courseName: "CST EM GESTÃO PÚBLICA", entryPeriod }).accepted).toBe(true);
    expect(validateCurricularDocumentMetadata(text, blank, initial, { courseName: "CST EM GESTÃO PÚBLICA", entryPeriod: 21 }).missing).toEqual(["entryPeriod"]);
  });

  it("não troca o motivo de documentos que já foram recusados", () => {
    const text = "Boleto bancário Campus / Unidade Semestre de Entrada";
    const initial = classifyCurricularAnalysisText(text);
    expect(validateCurricularDocumentMetadata(text, {}, initial)).toBe(initial);
  });

  it("accepts the transfer-analysis form when its required metadata is present", () => {
    const text = "Solicitação de Transferência — Análise Curricular Campus / Unidade Curso Semestre de Entrada Resumo do Aproveitamento Disciplinas Dispensadas Disciplinas a Cursar Situação de Ingresso Data da Análise C.H.";
    const initial = classifyCurricularAnalysisText(text);
    const accepted = validateCurricularDocumentMetadata(text, {
      campus: "POLO DIGITAL",
      curso: "SISTEMAS DE INFORMAÇÃO",
      "semestre de entrada": "4º Semestre",
    }, initial);
    expect(accepted.accepted).toBe(true);
  });
});
