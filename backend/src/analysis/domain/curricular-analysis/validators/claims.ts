import type { AnalysisWarningInput, CurriculumTotals, DocumentClaimInput } from "../types";

export interface ClaimComparison {
  claim: DocumentClaimInput;
  calculatedValue: number | null;
  matches: boolean | null;
}

/**
 * compareDocumentClaims — confronta afirmações do PDF com os totais recalculados (§20/§21).
 * Nunca corrige; apenas gera DOCUMENT_TOTAL_MISMATCH.
 */
export function compareDocumentClaims(
  claims: DocumentClaimInput[],
  totals: CurriculumTotals,
  context: { entryPeriod: number | null; previousBacklogCount: number | null },
): { comparisons: ClaimComparison[]; warnings: AnalysisWarningInput[] } {
  const comparisons: ClaimComparison[] = [];
  const warnings: AnalysisWarningInput[] = [];

  for (const claim of claims) {
    let calculated: number | null = null;
    switch (claim.type) {
      case "PENDING_TOTAL":
        calculated = totals.pending + totals.review;
        break;
      case "EXEMPTED_TOTAL":
        calculated = totals.exempted;
        break;
      case "TOTAL_SUBJECTS":
        calculated = totals.total;
        break;
      case "ENTRY_PERIOD":
        calculated = context.entryPeriod;
        break;
      default:
        calculated = null;
    }
    const matches = claim.value === null || calculated === null ? null : claim.value === calculated;
    comparisons.push({ claim, calculatedValue: calculated, matches });

    if (matches === false) {
      const labels: Record<string, string> = {
        PENDING_TOTAL: "Total de pendências",
        EXEMPTED_TOTAL: "Total de dispensas",
        TOTAL_SUBJECTS: "Total de disciplinas",
        ENTRY_PERIOD: "Período de ingresso",
      };
      warnings.push({
        code: claim.type === "ENTRY_PERIOD" ? "ENTRY_PERIOD_MISMATCH" : "DOCUMENT_TOTAL_MISMATCH",
        severity: "CRITICAL",
        source: "VALIDATOR",
        message: `${labels[claim.type] ?? claim.type}: declarado ${claim.value}, calculado ${calculated}. Revisão necessária.`,
        sourcePage: claim.sourcePage,
      });
    }
  }
  return { comparisons, warnings };
}
