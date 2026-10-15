// Types the migrated analysis code expects (they came from the Prisma client of the original system).
export type AnalysisStatus = "UPLOADED" | "PARSING" | "AI_EXTRACTION" | "NORMALIZING" | "CALCULATING" | "VALIDATING" | "AI_AUDIT" | "WAITING_REVIEW" | "COMPLETED" | "FAILED" | "AI_ERROR";
