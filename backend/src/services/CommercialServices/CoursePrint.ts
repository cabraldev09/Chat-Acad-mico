import axios from "axios";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

import { anthropicAccess, openaiAccess } from "../AiServices/Keys";
import { logger } from "../../utils/logger";

// The print of a course that the institution sends to the commercial team: the model reads it like a person would and hands back the course, the format,
// the share of presential (and live) classes and the text approved to tell the student. Nothing read here is used before the management confirms it.
const ANTHROPIC_URL = () => process.env.ANTHROPIC_API_URL || "https://api.anthropic.com";
const OPENAI_URL = () => process.env.OPENAI_API_URL || "https://api.openai.com";
const MODEL = process.env.ANALYSIS_VISION_MODEL || "claude-sonnet-5-5";
const OPENAI_MODEL = process.env.ANALYSIS_VISION_OPENAI_MODEL || "gpt-4o";
export const PRINT_TOOL = "registrar_print_curso";

const SYSTEM =
  "Você lê o print de um curso enviado pela instituição para a equipe comercial e devolve os dados chamando a ferramenta. " +
  "Copie o texto como está escrito, sem inventar nem completar. Se o print não informar um dado, deixe o campo vazio. " +
  "Percentuais são números de 0 a 100 (40% → 40). Formato: EAD, Semipresencial ou Presencial, como o print disser.";

const SCHEMA = {
  name: PRINT_TOOL,
  description: "Registra o que o print do curso informa.",
  input_schema: {
    type: "object",
    properties: {
      curso: { type: "string", description: "Nome do curso, como escrito no print" },
      formato: { type: "string", description: "EAD, Semipresencial ou Presencial" },
      percentualPresencial: { type: "number", description: "Percentual de carga horária presencial (prática), 0 a 100" },
      percentualSincrono: { type: "number", description: "Percentual de atividades ao vivo/síncronas, 0 a 100" },
      textoAprovado: { type: "string", description: "O texto que a instituição aprovou para explicar o formato ao aluno, copiado do print" }
    },
    required: ["textoAprovado"]
  }
};

export interface PrintReading {
  course: string | null;
  format: "EAD" | "Semipresencial" | "Presencial" | null;
  percent: number | null;
  syncPercent: number | null;
  text: string | null;
}

const pct = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace("%", ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
};

// what the tool received, cleaned: a format the system knows, percentages from 0 to 100, no emoji and no runaway text
export const cleanPrintReading = (input: any): PrintReading => {
  const i = input && typeof input === "object" ? input : {};
  const f = String(i.formato || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const format = /semi/.test(f) ? "Semipresencial" : /presencial/.test(f) ? "Presencial" : /ead|distancia|online/.test(f) ? "EAD" : null;
  const text = String(i.textoAprovado || "").replace(/\p{Extended_Pictographic}/gu, "").replace(/[ \t]+/g, " ").trim().slice(0, 2000);
  const course = String(i.curso || "").replace(/\s+/g, " ").trim().slice(0, 200);
  return { course: course || null, format, percent: pct(i.percentualPresencial), syncPercent: pct(i.percentualSincrono), text: text || null };
};

const sh = promisify(execFile);
// a PDF print goes to the model as the picture of its first page
const firstPageOf = async (bytes: Buffer): Promise<Buffer | null> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-"));
  try {
    await fs.writeFile(path.join(dir, "in.pdf"), bytes);
    await sh("pdftoppm", ["-r", "130", "-png", "-f", "1", "-l", "1", path.join(dir, "in.pdf"), path.join(dir, "p")], { timeout: 60000 });
    const file = (await fs.readdir(dir)).find(f => /^p-\d+\.png$/.test(f));
    return file ? await fs.readFile(path.join(dir, file)) : null;
  } catch (err) {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
};

export class PrintReadError extends Error {}

export const readCoursePrint = async (bytes: Buffer, mime: string, courseName: string): Promise<PrintReading> => {
  const [anthropic, openai] = await Promise.all([anthropicAccess(), openaiAccess()]);
  if (!anthropic.apiKey && !openai.apiKey) throw new PrintReadError("Não há chave de IA cadastrada: preencha o texto e o percentual à mão.");
  let image = bytes;
  let media = mime;
  if (mime === "application/pdf") {
    const page = await firstPageOf(bytes);
    if (!page) throw new PrintReadError("Não consegui abrir o PDF do print. Envie uma imagem (PNG ou JPG).");
    image = page;
    media = "image/png";
  }
  const instruction = `Este é o print do curso de ${courseName}. Registre o que ele informa.`;
  try {
    if (anthropic.apiKey) {
      const { data } = await axios.post(`${ANTHROPIC_URL()}/v1/messages`, {
        model: MODEL, max_tokens: 2000, system: SYSTEM, tools: [SCHEMA], tool_choice: { type: "tool", name: PRINT_TOOL },
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: media, data: image.toString("base64") } }, { type: "text", text: instruction }] }]
      }, { headers: { "x-api-key": anthropic.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, timeout: 120000, maxBodyLength: Infinity });
      return cleanPrintReading((data?.content || []).find((b: any) => b.type === "tool_use" && b.name === PRINT_TOOL)?.input);
    }
    const { data } = await axios.post(`${OPENAI_URL()}/v1/chat/completions`, {
      model: OPENAI_MODEL, max_tokens: 2000, temperature: 0,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: [{ type: "image_url", image_url: { url: `data:${media};base64,${image.toString("base64")}`, detail: "high" } }, { type: "text", text: instruction }] }],
      tools: [{ type: "function", function: { name: PRINT_TOOL, description: SCHEMA.description, parameters: SCHEMA.input_schema } }],
      tool_choice: { type: "function", function: { name: PRINT_TOOL } }
    }, { headers: { Authorization: `Bearer ${openai.apiKey}`, "content-type": "application/json" }, timeout: 120000, maxBodyLength: Infinity });
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return cleanPrintReading(args ? JSON.parse(args) : null);
  } catch (err: any) {
    const status = Number(err?.response?.status || 0);
    logger.warn(`Print do curso: leitura falhou (${status || "sem resposta"}): ${String(err?.response?.data?.error?.message || err?.message || "").slice(0, 200)}`);
    throw new PrintReadError(status === 401 || status === 403 ? "A chave de IA foi recusada pelo provedor: preencha à mão." : status === 429 ? "O limite da IA acabou: preencha à mão ou tente mais tarde." : "A IA não conseguiu ler o print agora: preencha à mão ou tente de novo.");
  }
};
