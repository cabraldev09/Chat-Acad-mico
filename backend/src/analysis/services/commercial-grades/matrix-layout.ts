import type { ParsedPage, TextPart } from "../pdf/parser";
import type { CommercialTrack } from "./course-metadata";

/**
 * Leitura determinística da "Matriz Curricular" emitida pelo SIAA (páginas em paisagem, já endireitadas pelo parser):
 * cabeçalho ("Matriz Curricular - 91 - NUTRIÇÃO (BACHARELADO)", "GRADUAÇÃO EAD", "Seq.: 20252", "Prazo Min. 8"),
 * blocos "Série: N" com uma linha por disciplina (código, descrição, H. Relógio, tipo) e a página de resumo
 * ("Estágio Curricular Supervisionado" / "Total de horas de Estágio" e "Total em Horas Relógio").
 */

export interface MatrixInternship {
  semester: number;
  name: string;
  workload: number | null;
}

export interface MatrixLayoutReading {
  courseName: string | null;
  modality: string | null;
  curriculumTerm: string | null;
  durationSemesters: number | null;
  /** Total declarado no resumo (0 quando o resumo traz a linha sem horas); null se o resumo não existe. */
  totalInternshipHours: number | null;
  totalCourseHours: number | null;
  hasTcc: boolean;
  /** Soma das disciplinas do tipo "Extensão" (null quando a matriz não tem). */
  extensionHours: number | null;
  internships: MatrixInternship[];
  tracks: CommercialTrack[];
  /** Quantidade de disciplinas encontradas nos blocos "Série: N". */
  componentCount: number;
}

interface Row {
  page: number;
  y: number;
  semester: number;
  type: string | null;
  workload: number | null;
  name: Array<{ y: number; text: string }>;
}

const COMPONENT_TYPES = /^(Normal|Estágio|TCC|Optativa|Extensão|Facultativa|Especial EAD|Eletiva)$/i;
/** Coluna da descrição: começa logo depois do código e termina antes de "Grp". */
const NAME_MIN_X = 35;
const NAME_MAX_X = 255;
/** Linhas de continuação do nome ficam a até ~11 pt da linha do código. */
const NAME_ATTACH_DISTANCE = 12;
const DEFAULT_WORKLOAD_CENTER = 345;

const TRACK_TAGS: Array<{ name: string; tag: RegExp }> = [
  { name: "Bacharelado", tag: /\s*\(BACHAREL(?:ADO)?\)/i },
  { name: "Licenciatura", tag: /\s*\(LICENCIATURA\)/i },
];

const center = (part: TextPart) => part.x + part.w / 2;

/** Número em formato brasileiro ("3.240,00", "1280", "16,5"); "-" e textos viram null. */
export function parseMatrixNumber(value: string): number | null {
  const text = value.trim();
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)) return Number(text.replace(/\./g, "").replace(",", "."));
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return Number(text.replace(",", "."));
  return null;
}

function rowNumbers(parts: TextPart[]): number[] {
  return parts.map((part) => parseMatrixNumber(part.text)).filter((value): value is number => value !== null);
}

export function readMatrixLayout(pages: ParsedPage[] | undefined): MatrixLayoutReading | null {
  if (!pages?.length) return null;
  let courseName: string | null = null;
  let modality: string | null = null;
  let curriculumTerm: string | null = null;
  let minimumTerm: number | null = null;
  let summaryInternship: number | null = null;
  let summaryTotal: number | null = null;
  const rows: Row[] = [];
  const nameLines: Array<{ page: number; y: number; text: string }> = [];

  for (const page of pages) {
    let semester = 0;
    const workloadHeader = page.lines.flatMap((line) => line.parts).find((part) => /^H\.\s*Rel[oó]gio$/i.test(part.text));
    const workloadCenter = workloadHeader ? center(workloadHeader) : DEFAULT_WORKLOAD_CENTER;
    for (const line of page.lines) {
      const text = line.text.replace(/\s+/g, " ").trim();
      const first = line.parts[0]?.text.trim() ?? "";

      const title = text.match(/Matriz Curricular\s*-\s*\d+\s*-\s*(.+)$/i)?.[1];
      if (title && !courseName) courseName = title.replace(/\s*\(\d+(?:[.,]\d+)?\)\s*$/, "").trim() || null;
      const graduation = text.match(/GRADUA[ÇC][ÃA]O\s+(EAD|SEMIPRESENCIAL|PRESENCIAL)/i)?.[1];
      if (graduation && !modality) modality = graduation.toUpperCase() === "EAD" ? "EAD" : graduation.charAt(0).toUpperCase() + graduation.slice(1).toLowerCase();
      const term = text.match(/Seq\.?:\s*(20\d{2})([12])\b/i) ?? text.match(/\b(20\d{2})\s*\/\s*([12])\b/);
      if (term && !curriculumTerm) curriculumTerm = `${term[1]}.${term[2]}`;
      const prazo = text.match(/Prazo\s+M[ií]n\.?\s*(\d{1,2})/i)?.[1];
      if (prazo && minimumTerm === null) minimumTerm = Number(prazo);

      const series = first.match(/^S[ée]rie:\s*(\d{1,2})$/i)?.[1];
      if (series) { semester = Number(series); continue; }

      // Rótulos do resumo ficam na margem esquerda; o nome de uma disciplina ("ESTÁGIO CURRICULAR SUPERVISIONADO") fica na coluna da descrição.
      const summaryLabel = (line.parts[0]?.x ?? Infinity) < NAME_MIN_X;
      if (summaryLabel && /^(Estágio Curricular Supervisionado|Total de horas de Estágio)$/.test(first)) {
        summaryInternship = rowNumbers(line.parts.slice(1)).reduce((sum, value) => sum + value, 0);
        continue;
      }
      if (summaryLabel && /^Total em Horas? Rel[óo]gio:?$/.test(first)) {
        summaryTotal = rowNumbers(line.parts.slice(1))[0] ?? null;
        continue;
      }
      if (!semester || /^(Total|Cod\.|Descri|C\.H\.|Teoria|Grp)/i.test(first)) continue;

      const code = /^\d{2,6}$/.test(first) && line.parts[0].x < NAME_MIN_X;
      if (code) {
        const namePart = line.parts.find((part) => part.x >= NAME_MIN_X && part.x < NAME_MAX_X && !/^[-\d.,]+$/.test(part.text));
        const type = line.parts.find((part) => COMPONENT_TYPES.test(part.text.trim()))?.text.trim() ?? null;
        const candidates = line.parts.filter((part) => part.x >= NAME_MAX_X && parseMatrixNumber(part.text) !== null && Math.abs(center(part) - workloadCenter) <= 20);
        const nearest = candidates.sort((a, b) => Math.abs(center(a) - workloadCenter) - Math.abs(center(b) - workloadCenter))[0];
        rows.push({ page: page.page, y: line.y, semester, type, workload: nearest ? Math.round(parseMatrixNumber(nearest.text) ?? 0) : null, name: namePart ? [{ y: line.y, text: namePart.text }] : [] });
      } else if (line.parts.every((part) => part.x >= NAME_MIN_X && part.x < NAME_MAX_X)) {
        nameLines.push({ page: page.page, y: line.y, text });
      }
    }
  }

  // Nomes longos quebram em linhas acima/abaixo da linha do código: cada pedaço vai para a disciplina mais próxima.
  for (const piece of nameLines) {
    let best: Row | null = null;
    for (const row of rows) {
      if (row.page !== piece.page) continue;
      const distance = Math.abs(row.y - piece.y);
      if (distance <= NAME_ATTACH_DISTANCE && (!best || distance < Math.abs(best.y - piece.y))) best = row;
    }
    best?.name.push({ y: piece.y, text: piece.text });
  }

  if (!courseName && rows.length === 0) return null;

  const components = rows.map((row) => ({ ...row, fullName: row.name.sort((a, b) => b.y - a.y).map((part) => part.text).join(" ").replace(/\s+/g, " ").trim() }));
  // The SIAA type "Estágio" is not reliable: it also marks Ambientação Digital, Plano de Acompanhamento de Carreira, Seminários Temáticos,
  // Práticas de Ensino and even Atividades de Extensão. What is told to the student as an internship is a component named "Estágio ...".
  const internships = components
    .filter((row) => /^EST[ÁA]GIO\b/i.test(row.fullName))
    .map((row) => ({ semester: row.semester, name: row.fullName || "Estágio supervisionado", workload: row.workload && row.workload > 0 ? row.workload : null }))
    .sort((a, b) => a.semester - b.semester);
  const hasTcc = components.some((row) => /^TCC$/i.test(row.type ?? "") || /TRABALHO DE (?:CONCLUS[ÃA]O|CURSO)\b|\bTCC\b/i.test(row.fullName));
  const extensionTotal = components.filter((row) => /^Extens[ãa]o$/i.test(row.type ?? "")).reduce((sum, row) => sum + (row.workload ?? 0), 0);
  const largestSemester = components.reduce((max, row) => Math.max(max, row.semester), 0);
  const declaredInternships = internships.reduce((sum, row) => sum + (row.workload ?? 0), 0);

  return {
    courseName,
    modality,
    curriculumTerm,
    durationSemesters: largestSemester || minimumTerm,
    // the hours told to the student are those of the internships listed with them (the SIAA summary also counts components typed "Estágio"
    // that are not internships); without hours in some internship, the summary of the PDF is used
    totalInternshipHours: internships.length && internships.every((row) => row.workload) && declaredInternships > 0 ? declaredInternships : summaryInternship && summaryInternship > 0 ? summaryInternship : declaredInternships > 0 ? declaredInternships : summaryInternship ?? null,
    totalCourseHours: summaryTotal,
    hasTcc,
    extensionHours: extensionTotal > 0 ? extensionTotal : null,
    internships,
    tracks: tracksFrom(internships),
    componentCount: components.length,
  };
}

/** Áreas básicas de ingresso (ex.: Educação Física) marcam os estágios de cada formação com "(BACHAREL)" ou "(LICENCIATURA)". */
function tracksFrom(internships: MatrixInternship[]): CommercialTrack[] {
  return TRACK_TAGS.flatMap(({ name, tag }) => {
    const own = internships.filter((row) => tag.test(row.name)).map((row) => ({ ...row, name: row.name.replace(tag, "").trim() }));
    return own.length ? [{ name, decisionSemester: null, decisionEvidence: "A matriz não informa em que semestre a formação é escolhida.", internships: own }] : [];
  });
}
