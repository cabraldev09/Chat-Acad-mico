/**
 * Regras acadêmicas configuráveis. Ver docs/ACADEMIC_RULES.md.
 * Este módulo é puro: sem dependências de banco, React ou OpenAI.
 */

export type AdditionalSemesterCapacityRule =
  | { type: "SAME_AS_LAST_PERIOD" }
  | { type: "FIXED_VALUE"; value: number }
  | { type: "CUSTOM_RULE"; regular: number; extra: number }
  | { type: "UNCONFIGURED" };

export type PeriodUnit = "SEMESTER" | "YEAR";
export type BacklogOrdering = "OLDEST_FIRST";

export interface AcademicRules {
  /** Disciplinas extras permitidas além da quantidade normal do semestre (regra "+3"). */
  extraSubjectsAllowed: number;
  /** Teto total de disciplinas no semestre. null mantém a fórmula período + extras. */
  maximumSubjectsPerSemester: number | null;
  /** Como calcular a capacidade de semestres além do último período oficial. */
  additionalSemesterCapacityRule: AdditionalSemesterCapacityRule;
  /** Unidade da coluna SÉRIE. */
  periodUnit: PeriodUnit;
  /** Ordem de consumo do backlog. */
  backlogOrdering: BacklogOrdering;
  /** Período de ingresso padrão quando o documento não informa (null = exigir confirmação). */
  entryPeriodDefault: number | null;
  /** Disciplinas REVISAR contam como pendentes na simulação. */
  reviewCountsAsPending: boolean;
  /** Limite de semestres adicionais simulados (proteção contra loop). */
  maxAdditionalSemesters: number;
}

export type RuleStatusKind = "CONFIRMED" | "CONFIGURABLE" | "NOT_CONFIGURED";

export interface RuleDefinition<K extends keyof AcademicRules = keyof AcademicRules> {
  key: K;
  valueType: "number" | "string" | "boolean" | "json" | "number|null";
  defaultValue: AcademicRules[K];
  status: RuleStatusKind;
  label: string;
  description: string;
}

export const RULE_DEFINITIONS: ReadonlyArray<RuleDefinition> = [
  {
    key: "extraSubjectsAllowed",
    valueType: "number",
    defaultValue: 3,
    status: "CONFIGURABLE",
    label: "Disciplinas extras por semestre",
    description:
      "Quantidade de disciplinas que o aluno pode cursar além do número normal do semestre (regra operacional atual: +3).",
  },
  {
    key: "maximumSubjectsPerSemester",
    valueType: "number|null",
    defaultValue: null,
    status: "CONFIGURABLE",
    label: "Teto total de disciplinas por semestre",
    description:
      "Limite institucional total por semestre. Quando preenchido, reduz automaticamente as extras em períodos com muitas disciplinas; vazio mantém período + extras.",
  },
  {
    key: "additionalSemesterCapacityRule",
    valueType: "json",
    defaultValue: { type: "SAME_AS_LAST_PERIOD" },
    status: "CONFIGURABLE",
    label: "Capacidade de semestre adicional",
    description:
      "Como calcular a capacidade dos semestres criados após o último período oficial quando ainda restam pendências. Padrão confirmado pelo documento de orientação da equipe: mesma capacidade do último período (ex.: 8 + 3 = 11).",
  },
  {
    key: "periodUnit",
    valueType: "string",
    defaultValue: "SEMESTER",
    status: "CONFIGURABLE",
    label: "Unidade da SÉRIE",
    description: "Se a coluna SÉRIE do documento representa semestre ou ano.",
  },
  {
    key: "backlogOrdering",
    valueType: "string",
    defaultValue: "OLDEST_FIRST",
    status: "CONFIGURABLE",
    label: "Ordem do backlog",
    description: "Prioridade de alocação das pendências de períodos anteriores (mais antigas primeiro).",
  },
  {
    key: "entryPeriodDefault",
    valueType: "number|null",
    defaultValue: null,
    status: "NOT_CONFIGURED",
    label: "Período de ingresso padrão",
    description:
      "Período assumido quando o documento não informa. Vazio = exigir confirmação manual (recomendado).",
  },
  {
    key: "reviewCountsAsPending",
    valueType: "boolean",
    defaultValue: true,
    status: "CONFIGURABLE",
    label: "REVISAR conta como pendente",
    description: "Disciplinas marcadas para revisão entram na simulação como pendentes até serem resolvidas.",
  },
  {
    key: "maxAdditionalSemesters",
    valueType: "number",
    defaultValue: 8,
    status: "CONFIGURABLE",
    label: "Máximo de semestres adicionais simulados",
    description: "Proteção contra simulações infinitas.",
  },
];

export const DEFAULT_RULES: AcademicRules = Object.fromEntries(
  RULE_DEFINITIONS.map((d) => [d.key, d.defaultValue]),
) as unknown as AcademicRules;

/** Regras institucionais reconhecidas mas ainda NÃO configuradas (exibem "REGRA NÃO CONFIGURADA"). */
export const UNCONFIGURED_TOPICS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "prerequisites", label: "Pré-requisitos" },
  { key: "corequisites", label: "Correquisitos" },
  { key: "internship", label: "Estágio" },
  { key: "tcc", label: "TCC" },
  { key: "extension", label: "Extensão" },
  { key: "annualOffer", label: "Oferta anual de disciplina" },
  { key: "complementaryActivities", label: "Atividades complementares" },
  { key: "lastPeriodLimit", label: "Limite especial do último período" },
];

/** Monta AcademicRules a partir de registros key/value (ex.: SystemRule do banco). */
export function buildRulesFromRecords(records: Array<{ key: string; value: unknown }>): AcademicRules {
  const rules: Record<string, unknown> = { ...DEFAULT_RULES };
  for (const r of records) {
    if (r.key in DEFAULT_RULES) rules[r.key] = r.value;
  }
  return rules as unknown as AcademicRules;
}
