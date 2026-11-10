import { parsePdf } from "./parser";

/** Dados do cabeçalho da matrícula unificada que o analista pode completar quando o SIAA os deixa em branco. */
export type HeaderField = "course" | "entryPeriod";

export type DocumentClassification = {
  accepted: boolean;
  reason: string;
  matchedSignals: string[];
  /** Campos do cabeçalho ausentes no PDF e não informados no envio. */
  missing?: HeaderField[];
};

/** Valores informados no envio para suprir o cabeçalho em branco. */
export type ManualHeader = { courseName?: string | null; entryPeriod?: number | null };

const FIELD_LABELS: Record<HeaderField, string> = { course: "curso", entryPeriod: "semestre de entrada" };

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
/** Marcadores presentes no PDF de resultado emitido pelo SIAA. */
const SIAA_HEADERS = [
  "analise curricular",
  "solicitacao de transferencia",
  "solicitacao de 2a graduacao",
];
const SIAA_RESULT_SIGNALS = [
  "resumo do aproveitamento",
  "disciplinas dispensadas",
  "disciplinas a cursar",
  "situacao de ingresso",
  "data da analise",
];
const ACADEMIC_SIGNALS = [
  "disciplina",
  "dispensada",
  "a cursar",
  "c.h.",
  "carga horaria",
];
const REJECTED_DOCUMENTS = [
  "boleto",
  "nota fiscal",
  "contrato",
  "certidao",
  "diploma",
  "declaracao de matricula",
  "edital",
  "curriculo vitae",
  "comprovante de pagamento",
];

/** Classifica a amostra textual antes de qualquer análise de equivalência curricular. */
export function classifyCurricularAnalysisText(
  text: string,
): DocumentClassification {
  const source = normalize(text);
  const headers = SIAA_HEADERS.filter((signal) => source.includes(signal));
  const result = SIAA_RESULT_SIGNALS.filter((signal) =>
    source.includes(signal),
  );
  const academic = ACADEMIC_SIGNALS.filter((signal) => source.includes(signal));
  const rejected = REJECTED_DOCUMENTS.filter((signal) =>
    source.includes(signal),
  );
  if (rejected.length > 0 && headers.length === 0)
    return {
      accepted: false,
      reason:
        "O PDF parece ser outro tipo de documento, não um histórico escolar acadêmico.",
      matchedSignals: rejected,
    };
  if (headers.length >= 1 && result.length >= 1 && academic.length >= 1)
    return {
      accepted: true,
      reason: "Resultado de análise curricular do SIAA identificado.",
      matchedSignals: [...headers, ...result, ...academic],
    };
  return {
    accepted: false,
    reason:
      "Não foi possível confirmar que o arquivo é o PDF de resultado da análise curricular do SIAA.",
    matchedSignals: [...headers, ...result, ...academic],
  };
}

export function validateCurricularDocumentMetadata(
  text: string,
  fields: Record<string, string>,
  classification: DocumentClassification,
  manual: ManualHeader = {},
): DocumentClassification {
  if (!classification.accepted) return classification;
  const normalized = normalize(text);
  const unifiedRequest = normalized.includes("campus / unidade") &&
    normalized.includes("semestre de entrada");
  if (!unifiedRequest) return classification;

  // O SIAA às vezes publica o resultado com campus, curso e semestre em branco. Curso e semestre de entrada são
  // indispensáveis (identificação e previsão); quando faltam no PDF, o analista os informa no envio. O campus não
  // bloqueia: o polo escolhido no envio já identifica o atendimento.
  const course = fields.curso?.trim() || manual.courseName?.trim();
  const validPeriod = (value: number) => Number.isInteger(value) && value >= 1 && value <= 20;
  const fromPdf = Number(fields["semestre de entrada"]?.match(/^\s*(\d{1,2})\s*[ºª°]?/i)?.[1] ?? NaN);
  const validEntryPeriod = validPeriod(fromPdf) || validPeriod(Number(manual.entryPeriod ?? NaN));
  const missing: HeaderField[] = [...(!course ? ["course" as const] : []), ...(!validEntryPeriod ? ["entryPeriod" as const] : [])];
  if (missing.length === 0) return classification;

  const names = missing.map((field) => FIELD_LABELS[field]).join(" e ");
  return {
    accepted: false,
    reason: `O PDF do SIAA veio sem ${names}. Informe ${missing.length > 1 ? "esses dados" : "esse dado"} no envio para iniciar a análise.`,
    matchedSignals: [...classification.matchedSignals, ...missing.map((field) => `${FIELD_LABELS[field]} ausente`)],
    missing,
  };
}

export class InvalidCurricularDocumentError extends Error {
  readonly code = "INVALID_CURRICULAR_DOCUMENT";
  constructor(readonly classification: DocumentClassification) {
    super(
      classification.reason || "Anexe o PDF atualizado de resultado da análise curricular, com curso, período de ingresso e grade preenchidos. Confirme os dados para iniciar a análise.",
    );
    this.name = "InvalidCurricularDocumentError";
  }
}

/** Lê apenas as três primeiras páginas: suficiente para cabeçalho e início da grade, sem iniciar o pipeline. */
export async function inspectCurricularAnalysisDocument(
  bytes: Buffer,
  manual: ManualHeader = {},
): Promise<DocumentClassification> {
  const parsed = await parsePdf(bytes, { maxPages: 3 });
  const text = parsed.textByPage.join("\n");
  return validateCurricularDocumentMetadata(
    text,
    parsed.headerFields ?? {},
    classifyCurricularAnalysisText(text),
    manual,
  );
}

export async function assertCurricularAnalysisDocument(
  bytes: Buffer,
  manual: ManualHeader = {},
): Promise<DocumentClassification> {
  const classification = await inspectCurricularAnalysisDocument(bytes, manual);
  if (!classification.accepted)
    throw new InvalidCurricularDocumentError(classification);
  return classification;
}
