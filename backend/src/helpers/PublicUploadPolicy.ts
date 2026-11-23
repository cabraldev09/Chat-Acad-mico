import path from "path";
import AppError from "../errors/AppError";

export const PUBLIC_UPLOAD_MAX_FILE_BYTES = 30 * 1024 * 1024;
export const PUBLIC_UPLOAD_MAX_BATCH_BYTES = 50 * 1024 * 1024;
// Multer writes each file before batchLimit rejects aggregate batches above 50 MiB.
export const PUBLIC_UPLOAD_MAX_API_REQUEST_BYTES = 5 * PUBLIC_UPLOAD_MAX_FILE_BYTES + 2 * 1024 * 1024;
export const PUBLIC_UPLOAD_MIN_FREE_BYTES = Number(process.env.PUBLIC_UPLOAD_MIN_FREE_BYTES) || 256 * 1024 * 1024;

// Types used by campaign/schedule attachments, the CRM logo field, and existing WhatsApp media.
// Active content formats (HTML, SVGZ, XML, JavaScript) are never accepted; SVG uploads are served
// as attachments by app.ts and remain available for the logo field.
const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".ico", ".svg",
  ".mp3", ".ogg", ".oga", ".opus", ".m4a", ".aac", ".wav",
  ".mp4", ".webm", ".mov", ".3gp", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv"
]);

export const isAllowedPublicUpload = (name: string): boolean => ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase());
export const publicUploadWithinLimits = (fileBytes: number, totalBytes: number): boolean =>
  fileBytes >= 0 && fileBytes <= PUBLIC_UPLOAD_MAX_FILE_BYTES && totalBytes >= 0 && totalBytes <= PUBLIC_UPLOAD_MAX_BATCH_BYTES;

export const publicUploadFileFilter = (_req: any, file: { originalname: string }, cb: (error: Error | null, accept?: boolean) => void): void => {
  if (!isAllowedPublicUpload(file.originalname)) return cb(new AppError("ERR_UPLOAD_TYPE", 400) as unknown as Error);
  return cb(null, true);
};
