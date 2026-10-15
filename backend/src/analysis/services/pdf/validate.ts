export interface PdfValidationResult {
  ok: true;
  mimeType: "application/pdf";
}

export class PdfValidationError extends Error {
  readonly code: "TOO_LARGE" | "NOT_PDF" | "EMPTY" | "TOO_MANY_PAGES";
  constructor(code: PdfValidationError["code"], message: string) {
    super(message);
    this.name = "PdfValidationError";
    this.code = code;
  }
}

/** Server-side check of the file: size and the PDF signature (the real content is read by the parser right after). */
export async function validatePdfBytes(bytes: Buffer, opts: { maxBytes: number }): Promise<PdfValidationResult> {
  if (bytes.length === 0) throw new PdfValidationError("EMPTY", "O arquivo está vazio.");
  if (bytes.length > opts.maxBytes) {
    throw new PdfValidationError("TOO_LARGE", `O arquivo excede o limite de ${Math.round(opts.maxBytes / 1024 / 1024)} MB.`);
  }
  const header = bytes.subarray(0, 5).toString("latin1");
  if (header !== "%PDF-") throw new PdfValidationError("NOT_PDF", "O arquivo não é um PDF válido.");
  return { ok: true, mimeType: "application/pdf" };
}
