import type { AnalysisStatus } from "../../generated/prisma/enums";

/** Estados em que o pipeline ainda está trabalhando (nenhuma ação humana cabe). */
export const PROCESSING_STATUSES: readonly AnalysisStatus[] = ["UPLOADED", "PARSING", "AI_EXTRACTION", "NORMALIZING", "CALCULATING", "VALIDATING", "AI_AUDIT"];

/** Estados que exigem revisão, reprocessamento ou um cenário manual (documentos legados). */
export const ATTENTION_STATUSES: readonly AnalysisStatus[] = ["WAITING_REVIEW", "FAILED", "AI_ERROR"];

/** Estados terminais do pipeline (o painel de processamento para de consultar). */
export const FINAL_STATUSES: readonly AnalysisStatus[] = ["COMPLETED", "WAITING_REVIEW", "FAILED", "AI_ERROR"];

/** Motivo, em linguagem da equipe, pelo qual uma análise pede atenção. */
export const ATTENTION_REASONS: Partial<Record<AnalysisStatus, { title: string; action: string }>> = {
  WAITING_REVIEW: { title: "Revisão necessária", action: "Abra a análise, confira o resultado do PDF ou envie uma versão atualizada." },
  AI_ERROR: { title: "Falha na comunicação com a OpenAI", action: "Abra a análise e clique em Tentar novamente." },
  FAILED: { title: "Não foi possível concluir o processamento", action: "Verifique o PDF e envie novamente." },
};

export function isProcessingStatus(status: AnalysisStatus | string): boolean {
  return (PROCESSING_STATUSES as readonly string[]).includes(status);
}
