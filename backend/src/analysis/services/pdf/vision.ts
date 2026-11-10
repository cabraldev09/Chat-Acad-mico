import axios from "axios";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { logger } from "../../../utils/logger";
import { anthropicAccess, openaiAccess } from "../../../services/AiServices/Keys";
import type { DetectedRow } from "./table-detector";
import type { LocalExtraction } from "./parser";

// Some printouts have no text at all: the browser drew the letters as shapes ("Save as PDF" with outlined fonts), so the local reader finds nothing.
// For those, and only those, the model reads the pages like a person would and hands back the same two lists the local reader builds for the unified
// enrollment result (disciplines exempted and disciplines to attend). The result goes through the very same normalization and checks: the totals written in
// the document headings are kept as claims, so a row the model missed is flagged by the engine instead of passing silently.
const ANTHROPIC_URL = () => process.env.ANTHROPIC_API_URL || "https://api.anthropic.com";
const MODEL = process.env.ANALYSIS_VISION_MODEL || "claude-sonnet-5-5";
const OPENAI_URL = () => process.env.OPENAI_API_URL || "https://api.openai.com";
const OPENAI_MODEL = process.env.ANALYSIS_VISION_OPENAI_MODEL || "gpt-4o";
const TOOL = "registrar_analise";

const SYSTEM =
  "Você lê o PDF de uma análise curricular (resultado de matrícula unificada: transferência ou 2ª graduação) e devolve os dados chamando a ferramenta. " +
  "Copie os nomes das disciplinas exatamente como estão escritos, sem corrigir nem traduzir. NUNCA complete a lista com disciplinas que você supõe existir na grade: registre só o que está impresso, na ordem do documento, e não pule nenhuma. O PDF tem duas listas, " +
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

// why the model could not read it, in words the person can act on (the technical reason also goes to the log)
// the same file read again within the hour is not paid for twice
const READ_CACHE = new Map<string, { at: number; input: any }>();
const READ_CACHE_MS = 3600000;

export class VisionFailure extends Error {}

const reasonOf = (err: any): string => {
  const status = Number(err?.response?.status || 0);
  const detail = String(err?.response?.data?.error?.message || err?.message || "").slice(0, 200);
  logger.warn(`Análise curricular: leitura do PDF sem texto falhou (${status || "sem resposta"}): ${detail}`);
  if (status === 401 || status === 403) return "a chave de IA foi recusada pelo provedor";
  if (status === 429) return "o limite ou o saldo da IA acabou";
  if (status === 404 || status === 400) return `o provedor recusou o pedido (${detail || status})`;
  return "a IA não respondeu a tempo";
};

const sh = promisify(execFile);

// The pages as pictures (poppler): the model reads them like a person would, much more reliably than a file with no text
const renderPages = async (bytes: Buffer): Promise<Buffer[] | null> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "analise-"));
  try {
    await fs.writeFile(path.join(dir, "in.pdf"), bytes);
    await sh("pdftoppm", ["-r", "130", "-png", path.join(dir, "in.pdf"), path.join(dir, "p")], { timeout: 60000 });
    const files = (await fs.readdir(dir)).filter(f => /^p-\d+\.png$/.test(f)).sort();
    if (!files.length) return null;
    return await Promise.all(files.map(f => fs.readFile(path.join(dir, f))));
  } catch (err) {
    logger.warn(`Análise curricular: as páginas não foram desenhadas (${String((err as any)?.message || err).slice(0, 120)}); o PDF vai inteiro`);
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
};

// one call to the provider the company has a key for (Anthropic first); gives back what the tool received
const askModel = async (bytes: Buffer, pages: Buffer[] | null, anthropicKey: string, openaiKey: string, hint: string): Promise<any> => {
  const instruction = `Leia o documento e registre todas as disciplinas das duas listas.${hint ? ` ${hint}` : ""}`;
  if (anthropicKey) {
    const parts: any[] = pages
      ? pages.map(p => ({ type: "image", source: { type: "base64", media_type: "image/png", data: p.toString("base64") } }))
      : [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }];
    const { data } = await axios.post(
      `${ANTHROPIC_URL()}/v1/messages`,
      {
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        tools: [SCHEMA],
        tool_choice: { type: "tool", name: TOOL },
        messages: [{ role: "user", content: [...parts, { type: "text", text: instruction }] }]
      },
      { headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, timeout: 180000, maxBodyLength: Infinity }
    );
    return (data?.content || []).find((b: any) => b.type === "tool_use" && b.name === TOOL)?.input;
  }
  const parts: any[] = pages
    ? pages.map(p => ({ type: "image_url", image_url: { url: `data:image/png;base64,${p.toString("base64")}`, detail: "high" } }))
    : [{ type: "file", file: { filename: "analise.pdf", file_data: `data:application/pdf;base64,${bytes.toString("base64")}` } }];
  const { data } = await axios.post(
    `${OPENAI_URL()}/v1/chat/completions`,
    {
      model: OPENAI_MODEL,
      max_tokens: 16000,
      temperature: 0,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: [...parts, { type: "text", text: instruction }] }],
      tools: [{ type: "function", function: { name: TOOL, description: SCHEMA.description, parameters: SCHEMA.input_schema } }],
      tool_choice: { type: "function", function: { name: TOOL } }
    },
    { headers: { Authorization: `Bearer ${openaiKey}`, "content-type": "application/json" }, timeout: 180000, maxBodyLength: Infinity }
  );
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  return args ? JSON.parse(args) : null;
};

export const readWithVision = async (bytes: Buffer, pageCount: number): Promise<LocalExtraction | null> => {
  const anthropicKey = (await anthropicAccess()).apiKey;
  const openaiKey = anthropicKey ? "" : (await openaiAccess()).apiKey;
  if (!anthropicKey && !openaiKey) {
    logger.warn("Análise curricular: PDF sem texto e nenhuma chave de IA cadastrada");
    throw new VisionFailure("não há chave de IA cadastrada (Configurações ou um agente de IA)");
  }
  let failure = "";
  let input: any = null;
  let hint = "";
  const key = createHash("sha256").update(bytes).digest("hex");
  const cached = READ_CACHE.get(key);
  if (cached && Date.now() - cached.at < READ_CACHE_MS) {
    input = cached.input;
  } else {
    const pages = pageCount <= 12 ? await renderPages(bytes) : null;
    // every page is read at the same time (a few seconds each, instead of one long answer for the whole document)
    const readAll = async (extra: string): Promise<any> => {
      if (!pages) return askModel(bytes, null, anthropicKey, openaiKey, extra);
      const got = await Promise.all(pages.map((p, i) => askModel(bytes, [p], anthropicKey, openaiKey, `Esta é a página ${i + 1} de ${pages.length}: registre só as linhas desta página (ela pode ter só uma das listas, ou nenhuma). ${extra}`.trim())));
      const some = <T>(pick: (g: any) => T | undefined | null): T | undefined => got.map(g => (g ? pick(g) : undefined)).find(v => v !== undefined && v !== null && (v as any) !== "" && (v as any) !== 0) as T | undefined;
      return {
        course: some(g => g.course), campus: some(g => g.campus), entryPeriod: some(g => g.entryPeriod),
        exemptedTotal: some(g => g.exemptedTotal), pendingTotal: some(g => g.pendingTotal),
        exempted: got.flatMap(g => (g && Array.isArray(g.exempted) ? g.exempted : [])),
        pending: got.flatMap(g => (g && Array.isArray(g.pending) ? g.pending : []))
      };
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const got = await readAll(hint);
        if (!got || !Array.isArray(got.exempted) || !Array.isArray(got.pending)) continue;
        input = got;
        // the rows must agree with the totals written in the headings: otherwise the model is told and tries again
        const wantE = Number(got.exemptedTotal) || 0;
        const wantP = Number(got.pendingTotal) || 0;
        const offE = wantE > 0 && wantE !== got.exempted.length;
        const offP = wantP > 0 && wantP !== got.pending.length;
        if (!offE && !offP) { failure = ""; break; }
        failure = `a leitura não bateu com os totais do documento (${got.exempted.length} de ${wantE} dispensadas e ${got.pending.length} de ${wantP} a cursar)`;
        hint = `Na tentativa anterior o total foi ${got.exempted.length} dispensadas e ${got.pending.length} a cursar, mas os títulos do documento dizem ${wantE} e ${wantP}. Releia com atenção, sem omitir nem inventar linhas.`;
      } catch (err) {
        failure = reasonOf(err);
      }
    }
    if (!failure && input) READ_CACHE.set(key, { at: Date.now(), input });
  }
  // a reading that never agreed with the totals of the document is not used: a wrong forecast is worse than none
  if (failure) throw new VisionFailure(failure);
  if (!input) {
    logger.warn("Análise curricular: a IA não devolveu as disciplinas do PDF sem texto");
    throw new VisionFailure("a IA não devolveu as disciplinas");
  }
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
