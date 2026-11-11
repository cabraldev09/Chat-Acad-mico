import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

import { PUBLIC_DIR } from "../config/paths";
import { logger } from "../utils/logger";

// The PDF of an analysis, kept to be checked against what was read. The name is random and the file is only served by the authenticated
// route of the analysis. Failing to keep it never fails the analysis.
const DIR = path.join(PUBLIC_DIR, "analysis-docs");

export const saveAnalysisDocument = (bytes: Buffer): string | null => {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const name = `${randomBytes(18).toString("hex")}.pdf`;
    fs.writeFileSync(path.join(DIR, name), bytes);
    return name;
  } catch (err) {
    logger.warn({ err }, "analysis document not kept");
    return null;
  }
};

export const analysisDocumentPath = (filePath: string | null | undefined): string | null => {
  if (!filePath || !/^[a-f0-9]{36}\.pdf$/.test(filePath)) return null;
  const full = path.join(DIR, filePath);
  return fs.existsSync(full) ? full : null;
};

export const removeAnalysisDocument = (filePath: string | null | undefined): void => {
  const full = analysisDocumentPath(filePath);
  if (full) fs.rmSync(full, { force: true });
};
