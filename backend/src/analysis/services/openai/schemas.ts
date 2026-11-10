// What the table reader hands to the normalization step. In the original system the same shape was the structured
// answer of the AI; here it always comes from the local reading of the PDF (the AI is off).
export type Readability = "CLEAR" | "UNCLEAR" | "UNREADABLE";

export interface ExtractedSubject {
  code: string | null;
  name: string;
  workload: number;
  period: number;
  usedSubject: string | null;
  sourcePage: number;
  sourceRow: number;
  readability: Readability;
  note: string | null;
}

export type DocumentClaimType = "PENDING_TOTAL" | "EXEMPTED_TOTAL" | "TOTAL_SUBJECTS" | "ENTRY_PERIOD" | "OTHER";

export interface CurriculumExtraction {
  document: {
    course: string | null;
    matrix: string | null;
    campus: string | null;
    modality: string | null;
    candidateLabel: string | null;
    detectedEntryPeriod: number | null;
    detectedEntryPeriodEvidence: string | null;
  };
  subjects: ExtractedSubject[];
  documentClaims: Array<{ type: DocumentClaimType; value: number | null; sourcePage: number; rawText: string }>;
  ambiguities: Array<{ sourcePage: number; sourceRow: number | null; message: string }>;
}
