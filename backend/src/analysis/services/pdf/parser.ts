import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "../../lib/logger";
import { detectTables, type DetectedTable } from "./table-detector";

export interface TextPart {
  x: number;
  w: number;
  text: string;
}

export interface TextLine {
  /** Coordenadas no espaço do PDF (origem no canto inferior esquerdo), em pontos. */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** Fragmentos com posição X real (usados pelo detector de tabela). */
  parts: TextPart[];
}

export interface ParsedPage {
  page: number;
  width: number;
  height: number;
  lines: TextLine[];
}

export interface LocalExtraction {
  /** Known vector outline of the institutional VISUALIZAÇÃO PRÉVIA watermark. */
  visualPreviewWatermark?: boolean;
  pageCount: number;
  pages: ParsedPage[];
  /** Texto corrido por página (linhas separadas por \n). */
  textByPage: string[];
  parserVersion: string;
  /** Tabela reconstruída deterministicamente (ver table-detector.ts). */
  table?: DetectedTable;
  /** Campos "Chave: valor" encontrados fora da tabela (ex.: Curso, Série, Grade). */
  headerFields?: Record<string, string>;
}

export const PARSER_VERSION = "pdfjs-table-1.3";

const Y_TOLERANCE = 3.5;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Folder of the pdfjs-dist package (this build is CommonJS: require.resolve finds it). */
function pdfjsDir(): string {
  try {
    return path.dirname(require.resolve("pdfjs-dist/package.json"));
  } catch {
    return path.join(process.cwd(), "node_modules", "pdfjs-dist");
  }
}

// pdf.js is an ES module: a real dynamic import() is needed (the compiler would turn a plain one into require)
// eslint-disable-next-line no-new-func
const importEsm = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;

const loadModule = async (href: string): Promise<any> => {
  try {
    return await importEsm(href);
  } catch (err) {
    // some runners (test VMs) have no native import(): the compiler's own import() works there
    return import(/* @vite-ignore */ href);
  }
};

async function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= loadModule(pathToFileURL(path.join(pdfjsDir(), "legacy", "build", "pdf.mjs")).href).then((mod: PdfJs) => {
    // Node: pdf.js loads a "fake worker" through a dynamic import(); the absolute path makes sure it is found.
    const workerPath = path.join(pdfjsDir(), "legacy", "build", "pdf.worker.mjs");
    mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    return mod;
  });
  return pdfjsPromise;
}

function fontOptions() {
  const dir = pdfjsDir();
  return {
    standardFontDataUrl: pathToFileURL(path.join(dir, "standard_fonts") + path.sep).href,
    cMapUrl: pathToFileURL(path.join(dir, "cmaps") + path.sep).href,
    cMapPacked: true,
  };
}

interface RawItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

/**
 * Páginas giradas (as matrizes curriculares do SIAA vêm com /Rotate 90 e o texto também girado): no espaço do PDF cada
 * "linha" seria uma coluna. Aqui o texto vai para a orientação em que a página é exibida, mantendo a origem embaixo.
 */
function toDisplaySpace(items: RawItem[], viewport: { transform: number[]; height: number }, util: PdfJs["Util"]): RawItem[] {
  return items.map((item) => {
    const [a, b, c, d, e, f] = util.transform(viewport.transform, item.transform);
    // O viewport tem y para baixo; as linhas usam y para cima, como o espaço do PDF.
    return { ...item, transform: [a, -b, -c, -d, e, viewport.height - f] };
  });
}

function groupIntoLines(items: RawItem[]): TextLine[] {
  const positioned = items
    .filter((i) => i.str && i.str.trim().length > 0)
    .map((i) => ({
      x: i.transform[4],
      y: i.transform[5],
      w: i.width,
      h: i.height || Math.abs(i.transform[3]) || 10,
      text: i.str,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Array<{ x: number; y: number; w: number; h: number; parts: Array<{ x: number; w: number; text: string }> }> = [];
  for (const it of positioned) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Y_TOLERANCE);
    if (line) {
      line.parts.push({ x: it.x, w: it.w, text: it.text });
      line.x = Math.min(line.x, it.x);
      line.w = Math.max(line.x + line.w, it.x + it.w) - line.x;
      line.h = Math.max(line.h, it.h);
    } else {
      lines.push({ x: it.x, y: it.y, w: it.w, h: it.h, parts: [{ x: it.x, w: it.w, text: it.text }] });
    }
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const parts = l.parts.sort((a, b) => a.x - b.x);
      let text = "";
      let cursor: number | null = null;
      for (const p of parts) {
        if (cursor !== null) {
          const gap = p.x - cursor;
          // gap grande = célula/coluna diferente → separador de tabulação
          text += gap > 12 ? "\t" : gap > 1.5 ? " " : "";
        }
        text += p.text;
        cursor = p.x + p.w;
      }
      // funde fragmentos contíguos (mesma célula) em uma única parte
      const merged: TextPart[] = [];
      for (const p of parts) {
        const last = merged[merged.length - 1];
        if (last && p.x - (last.x + last.w) <= 12) {
          const gap = p.x - (last.x + last.w);
          last.text += (gap > 1.5 ? " " : "") + p.text;
          last.w = p.x + p.w - last.x;
        } else {
          merged.push({ x: p.x, w: p.w, text: p.text });
        }
      }
      return { x: l.x, y: l.y, w: l.w, h: l.h, text: text.replace(/[ \t]+$/g, ""), parts: merged.map((m) => ({ ...m, text: m.text.trim() })).filter((m) => m.text) };
    });
}

/** Extrai texto com posições de todas as páginas usando pdf.js (sem canvas). */
export async function parsePdf(bytes: Buffer, opts?: { maxPages?: number }): Promise<LocalExtraction> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
    ...fontOptions(),
  });
  const doc = await task.promise;

  try {
    const pageCount = doc.numPages;
    const limit = opts?.maxPages ? Math.min(pageCount, opts.maxPages) : pageCount;
    let visualPreviewWatermark = false;
    const pages: ParsedPage[] = [];
    const textByPage: string[] = [];
    for (let p = 1; p <= limit; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items as unknown as RawItem[];
      const lines = groupIntoLines(page.rotate % 180 !== 0 ? toDisplaySpace(items, viewport, pdfjs.Util) : items);
      if (p === 1 && /HIST[ÓO]RICO ESCOLAR/i.test(lines.map(l => l.text).join(" "))) {
        const operators = await page.getOperatorList();
        for (let i = 0; i < operators.fnArray.length; i++) {
          if (operators.fnArray[i] !== pdfjs.OPS.constructPath) continue;
          const shape = JSON.stringify(operators.argsArray[i]);
          if (shape.length > 1000 && createHash("sha256").update(shape).digest("hex") === "b01418f610afb1413f200e31f11524a1c9c0cfeee48932ebbc2dd59fbf08a096") visualPreviewWatermark = true;
        }
      }
      pages.push({ page: p, width: viewport.width, height: viewport.height, lines });
      textByPage.push(lines.map((l) => l.text).join("\n"));
      page.cleanup();
    }
    const table = detectTables(pages);
    const headerFields = { ...extractHeaderFields(Object.values(table.freeText).flat()), ...extractUnifiedEnrollmentHeader(pages) };
    return { pageCount, pages, textByPage, visualPreviewWatermark, parserVersion: PARSER_VERSION, table, headerFields };
  } finally {
    await task.destroy().catch((e: unknown) => logger.debug("pdf.destroy", { err: String(e) }));
  }
}

/** Extrai pares "Chave: valor" de linhas de texto livre (cabeçalho do documento). */
export function extractHeaderFields(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  // "Chave: valor" — várias chaves podem dividir a mesma linha ("Curso: X   Matriz: Y   RGM: Z")
  const re = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ./ ]{0,30}?):\s*(.+?)(?=\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ./]{2,30}:\s|\t|$)/g;
  for (const raw of lines) {
    for (const piece of raw.split("\t")) {
      for (const m of piece.matchAll(re)) {
        const key = m[1]
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();
        const value = m[2].trim();
        if (key && value && !(key in out)) out[key] = value;
      }
    }
  }
  return out;
}

/** O resultado de matrícula unificada usa rótulos em uma linha e valores alinhados
 * logo abaixo, sem os dois-pontos presentes no SIAA antigo. */
function extractUnifiedEnrollmentHeader(pages: ParsedPage[]): Record<string, string> {
  const out: Record<string, string> = {};
  const first = pages[0];
  if (!first) return out;
  const labels = first.lines.find((line) => {
    const normalized = line.text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return normalized.includes("campus / unidade") && normalized.includes("curso") && normalized.includes("semestre de entrada");
  });
  if (!labels) return out;
  const campusX = labels.parts.find((part) => /campus\s*\/\s*unidade/i.test(part.text))?.x;
  const courseX = labels.parts.find((part) => /^curso$/i.test(part.text.trim()))?.x;
  const entryX = labels.parts.find((part) => /semestre\s+de\s+entrada/i.test(part.text))?.x;
  if (campusX === undefined || courseX === undefined || entryX === undefined) return out;
  // Inclui a quebra de linha do nome do curso, mas para antes da próxima linha de rótulos
  // ("DATA DA ANÁLISE" / "SITUAÇÃO DE INGRESSO"): campo vazio no SIAA continua vazio aqui.
  const isLabel = (text: string) => /^(data da analise|situacao de ingresso|resumo do aproveitamento)$/.test(text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase());
  const nextLabels = first.lines.find((line) => line.y < labels.y - 2 && line.parts.some((part) => isLabel(part.text)));
  const floor = Math.max(labels.y - 35, nextLabels ? nextLabels.y + 2 : -Infinity);
  const values = first.lines.filter((line) => line.y < labels.y - 2 && line.y > floor);
  const readColumn = (from: number, to: number) => values
    .flatMap((line) => line.parts.filter((part) => part.x >= from - 4 && part.x < to - 4).map((part) => ({ y: line.y, text: part.text.trim() })))
    .sort((a, b) => b.y - a.y)
    .map((part) => part.text)
    .filter(Boolean)
    .join(" ");
  const campus = readColumn(campusX, courseX);
  const course = readColumn(courseX, entryX);
  const entry = readColumn(entryX, Number.POSITIVE_INFINITY);
  if (campus) out.campus = campus;
  if (course) out.curso = course;
  if (entry) out["semestre de entrada"] = entry;
  return out;
}

/** Apenas a contagem de páginas (rápido, usado na validação do upload). */
export async function countPdfPages(bytes: Buffer): Promise<number> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, ...fontOptions() });
  const doc = await task.promise;
  try {
    return doc.numPages;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
