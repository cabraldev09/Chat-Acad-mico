export type CommercialTrack = {
  name: string;
  decisionSemester: number | null;
  decisionEvidence: string | null;
  internships: Array<{ semester: number; name: string; workload: number | null }>;
};

export type CourseCatalogMetadata = {
  degree: string | null;
  knowledgeArea: string | null;
  durationSemesters: number | null;
};

const DISPLAY_DEGREES: Record<string, string> = {
  BACHARELADO: "Bacharelado",
  LICENCIATURA: "Licenciatura",
  "ÁREA BÁSICA": "Área básica de ingresso",
  "AREA BASICA": "Área básica de ingresso",
  TECNÓLOGO: "Tecnólogo",
  TECNOLOGO: "Tecnólogo",
};

export function normalizeCatalogMetadata(input: Partial<CourseCatalogMetadata> & { courseName?: string | null }): CourseCatalogMetadata {
  const inferredDegree = inferDegree(input.courseName ?? "");
  return {
    degree: normalizeDegree(input.degree) ?? inferredDegree,
    knowledgeArea: cleanText(input.knowledgeArea) ?? inferKnowledgeArea(input.courseName ?? ""),
    durationSemesters: Number.isInteger(input.durationSemesters) && Number(input.durationSemesters) > 0 ? Number(input.durationSemesters) : null,
  };
}

export function inferDegree(courseName: string): string | null {
  const normalized = courseName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (normalized.includes("AREA BASICA")) return "Área básica de ingresso";
  // "(LICENCIATURA)" e "(LICENCIADOS EM ...)" são licenciatura; "(BACHARELADO)" e "(BACH P/ EGRESSO ...)", bacharelado.
  if (normalized.includes("LICENCIATURA") || normalized.includes("LICENCIADOS") || /\(LIC\b/.test(normalized)) return "Licenciatura";
  // Matrizes de segundo curso para egressos de bacharelados ("(P EGRESSO ...)", "(PARA BACH ...)") também são bacharelado.
  if (normalized.includes("BACHARELADO") || /\(BACH\b|PARA BACH|EGRESSO/.test(normalized)) return "Bacharelado";
  if (normalized.includes("CST") || normalized.includes("TECNOLOG")) return "Tecnólogo";
  return null;
}

/** Área ampla do curso pelo nome, na ordem das regras (a primeira que combinar vale). */
const KNOWLEDGE_AREAS: Array<[RegExp, string]> = [
  [/FARMACIA|ESTETICA|COSMETICA|RADIOLOGIA|NUTRICAO|EDUCACAO FISICA|ENFERMAGEM|FISIOTERAPIA|BIOMEDICINA|ODONTOLOGIA|PSICOLOGIA/, "Saúde"],
  [/AGRONOMIA|VETERINARIA|ZOOTECNIA|AGRONEGOCIO/, "Ciências agrárias"],
  [/ARQUITETURA|URBANISMO|ENGENHARIA/, "Engenharia e arquitetura"],
  [/CIENCIAS BIOLOGICAS|BIOLOGIA|FISICA E QUIMICA/, "Ciências da natureza"],
  [/ARTES VISUAIS|DESIGN|JORNALISMO|PUBLICIDADE|MUSICA/, "Artes e comunicação"],
  [/DIREITO|CRIMINOLOGIA|CONCILIACAO|MEDIACAO|ARBITRAGEM|SEGURANCA PUBLICA/, "Direito e segurança"],
  [/CIENCIA POLITICA|CIENCIAS SOCIAIS|FILOSOFIA|GEOGRAFIA|SOCIOLOGIA/, "Humanas e sociais"],
  [/PEDAGOGIA|LETRAS|HISTORIA|MATEMATICA|EDUCACAO/, "Educação"],
  [/COMPUTACAO|SISTEMAS|TECNOLOGIA|ANALISE E DESENVOLVIMENTO|DADOS|CIBERSEGURANCA|NUVEM|CODING|BACK-END|FRONT-END|FULL STACK|DESENVOLVIMENTO/, "Tecnologia"],
  [/GESTAO|ADMINISTRACAO|CONTABEIS|ECONOMICAS|COMERCIO EXTERIOR|COACHING|MARKETING|RECURSOS HUMANOS|LOGISTICA|FINANCEIR/, "Gestão e negócios"],
];

function inferKnowledgeArea(courseName: string): string | null {
  const normalized = courseName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return KNOWLEDGE_AREAS.find(([expression]) => expression.test(normalized))?.[1] ?? null;
}

export function normalizeDegree(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const normalized = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return DISPLAY_DEGREES[normalized] ?? cleaned;
}

export function parseCourseTracks(value: unknown, internshipInfo: string | null): CommercialTrack[] {
  if (Array.isArray(value)) {
    const tracks = value.flatMap(parseTrack).filter((track): track is CommercialTrack => Boolean(track));
    if (tracks.length) return tracks;
  }
  return deriveTracksFromInternships(internshipInfo);
}

function parseTrack(value: unknown): CommercialTrack | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const name = cleanText(typeof item.name === "string" ? item.name : null);
  if (!name) return null;
  const internships = Array.isArray(item.internships) ? item.internships.flatMap((internship) => {
    if (!internship || typeof internship !== "object") return [];
    const row = internship as Record<string, unknown>;
    const semester = Number(row.semester);
    const internshipName = cleanText(typeof row.name === "string" ? row.name : null);
    if (!Number.isInteger(semester) || semester < 1 || !internshipName) return [];
    const workload = Number(row.workload);
    return [{ semester, name: internshipName, workload: Number.isFinite(workload) && workload > 0 ? workload : null }];
  }) : [];
  const decisionSemester = Number(item.decisionSemester);
  return {
    name,
    decisionSemester: Number.isInteger(decisionSemester) && decisionSemester > 0 ? decisionSemester : null,
    decisionEvidence: cleanText(typeof item.decisionEvidence === "string" ? item.decisionEvidence : null),
    internships,
  };
}

function deriveTracksFromInternships(internshipInfo: string | null): CommercialTrack[] {
  const rows = (internshipInfo ?? "").split("\n").flatMap((line) => {
    const match = line.match(/-\s*(\d+)º\s*sem\.?:\s*(.+?)(?:\s*\((\d+)h\))?$/i);
    if (!match) return [];
    return [{ semester: Number(match[1]), name: match[2].trim(), workload: match[3] ? Number(match[3]) : null }];
  });
  const labels = ["Bacharelado", "Licenciatura"];
  return labels.flatMap((name) => {
    const expression = name === "Bacharelado" ? /\(BACHAREL(?:ADO)?\)/i : /\(LICENCIATURA\)/i;
    const internships = rows.filter((row) => expression.test(row.name)).map((row) => ({ ...row, name: row.name.replace(expression, "").replace(/\s+/g, " ").trim() }));
    return internships.length ? [{ name, decisionSemester: null, decisionEvidence: null, internships }] : [];
  });
}

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || null;
}
