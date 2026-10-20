import axios from "axios";
import { anthropicAccess } from "../../../services/AiServices/Keys";
import type { DetectedRow } from "./table-detector";
import type { LocalExtraction } from "./parser";

// Some printouts have no text at all: the browser drew the letters as shapes ("Save as PDF" with outlined fonts), so the local reader finds nothing.
// For those, and only those, the model reads the pages like a person would and hands back the same two lists the local reader builds for the unified
// enrollment result (disciplines exempted and disciplines to attend). The result goes through the very same normalization and checks: the totals written in
// the document headings are kept as claims, so a row the model missed is flagged by the engine instead of passing silently.
const ANTHROPIC_URL = () => process.env.ANTHROPIC_API_URL || "https://api.anthropic.com";
const MODEL = process.env.ANALYSIS_VISION_MODEL || "claude-sonnet-5-5";
const TOOL = "registrar_analise";

const SYSTEM =
  "Você lê o PDF de uma análise curricular (resultado de matrícula unificada: transferência ou 2ª graduação) e devolve os dados chamando a ferramenta. " +
  "Copie os nomes das disciplinas exatamente como estão escritos, sem corrigir nem traduzir. Não invente linhas e não pule nenhuma: o PDF tem duas listas, " +
  "“Disciplinas dispensadas” (colunas Disciplina Dispensada, C.H., Usada na Dispensa, Situação) e “Disciplinas a cursar” (colunas Disciplina, Série, C.H., Tipo, Situação). " +
  "Nomes que quebram em duas linhas são um só nome. C.H. é um número de horas (0h é 0). Série é o número antes do º. " +
  "Informe também os totais escritos nos títulos das listas (ex.: “DISPENSADAS — 24”) e o semestre de entrada do cabeçalho.";

const SCHEMA = {
  name: TOOL,
  description: "Registra o conteúdo do PDF da análise curricular.",
  input_schema: {
    type: "object",
    properties: {
      course: { type: "string", description: "Curso, como escrito no cabeçalho" },
      campus: { type: "string" },
      entryPeriod: { type: "integer", description: "Semestre de entrada do cabeçalho (ex.: 5 para “5º Semestre”)" },
      exemptedTotal: { type: "integer", description: "Número escrito no título “Disciplinas dispensadas”" },
      pendingTotal: { type: "integer", description: "Número escrito no título “Disciplinas a cursar”" },
      exempted: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string" }, workload: { type: "integer" }, used: { type: "string", description: "Texto da coluna Usada na Dispensa" } }, required: ["name", "workload"] }
      },
      pending: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string" }, period: { type: "integer" }, workload: { type: "integer" } }, required: ["name", "period", "workload"] }
      }
    },
    required: ["exempted", "pending"]
  }
};

const BOX = { x: 0, y: 0, w: 0, h: 0 };

export const noTextLayer = (local: LocalExtraction): boolean => local.pageCount > 0 && local.textByPage.every(t => !String(t || "").trim());

export const readWithVision = async (bytes: Buffer, pageCount: number): Promise<LocalExtraction | null> => {
  const { apiKey } = await anthropicAccess();
  if (!apiKey) return null;
  let input: any = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await axios.post(
        `${ANTHROPIC_URL()}/v1/messages`,
        {
          model: MODEL,
          max_tokens: 16000,
          system: SYSTEM,
          tools: [SCHEMA],
          tool_choice: { type: "tool", name: TOOL },
          messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }, { type: "text", text: "Leia o documento e registre todas as disciplinas das duas listas." }] }]
        },
        { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, timeout: 180000, maxBodyLength: Infinity }
      );
      const got = (data?.content || []).find((b: any) => b.type === "tool_use" && b.name === TOOL)?.input;
      if (!got || !Array.isArray(got.exempted) || !Array.isArray(got.pending)) continue;
      input = got;
      // the rows must agree with the totals of the headings: one more try when they do not (the engine flags what is left)
      const off = (got.exemptedTotal && got.exemptedTotal !== got.exempted.length) || (got.pendingTotal && got.pendingTotal !== got.pending.length);
      if (!off) break;
    } catch (err) {
      // keep what the first try gave
    }
  }
  if (!input) return null;

  const entry = Number(input.entryPeriod) >= 1 && Number(input.entryPeriod) <= 20 ? Number(input.entryPeriod) : 1;
  const rows: DetectedRow[] = [];
  (input.exempted as any[]).forEach((r, i) => {
    const name = String(r.name || "").replace(/\s+/g, " ").trim();
    if (!name) return;
    rows.push({ page: 1, rowIndex: i + 1, code: null, name, workload: Number(r.workload) || 0, period: entry, usedSubject: String(r.used || "").trim() || "DISPENSADA", bbox: BOX, pageBreakDuplicate: false });
  });
  (input.pending as any[]).forEach((r, i) => {
    const name = String(r.name || "").replace(/\s+/g, " ").trim();
    const period = Number(r.period);
    if (!name || !Number.isInteger(period) || period < 1) return;
    rows.push({ page: 2, rowIndex: i + 1, code: null, name, workload: Number(r.workload) || 0, period, usedSubject: null, bbox: BOX, pageBreakDuplicate: false });
  });
  if (!rows.length) return null;

  const freeText: Record<number, string[]> = { 1: [], 2: [] };
  if (Number.isInteger(input.exemptedTotal)) freeText[1].push(`Total de disciplinas dispensadas: ${input.exemptedTotal}`);
  if (Number.isInteger(input.pendingTotal)) freeText[2].push(`Total de disciplinas a cursar: ${input.pendingTotal}`);
  const headerFields: Record<string, string> = { "semestre de entrada": `${entry}º Semestre` };
  if (input.course) headerFields.curso = String(input.course);
  if (input.campus) headerFields.campus = String(input.campus);
  return {
    pageCount,
    pages: Array.from({ length: pageCount }, (_, i) => ({ page: i + 1, width: 595, height: 842, lines: [] })) as any,
    textByPage: Array.from({ length: pageCount }, () => ""),
    parserVersion: "vision-1",
    table: { rows, headers: {}, freeText },
    headerFields
  };
};
