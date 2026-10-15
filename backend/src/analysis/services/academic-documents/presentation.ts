import type { AcademicGridSnapshot } from "../../domain/academic-analysis/types";
import type { AcademicDocumentType } from "./classifier";
import { academicFingerprint } from "../student-portal/fingerprints";
/** Add source-only facts without changing the version or undoing tutor corrections. */
export function presentAcademicSnapshot(version: {
  snapshot: unknown;
  preferredSource?: {
    documentType: AcademicDocumentType;
    parsedSnapshot?: unknown;
  } | null;
}): AcademicGridSnapshot {
  const snapshot = version.snapshot as AcademicGridSnapshot;
  const source = version.preferredSource;
  const parsed = source?.parsedSnapshot as
    AcademicGridSnapshot | null | undefined;
  return {
    ...(parsed && academicFingerprint(parsed) === academicFingerprint(snapshot)
      ? { ...snapshot, ...parsed }
      : snapshot),
    documentType: source?.documentType ?? snapshot.documentType,
  };
}
