import fs from "fs";
import path from "path";
import multer from "multer";
import { randomBytes } from "crypto";
import { PUBLIC_DIR } from "./paths";
import AppError from "../errors/AppError";

// Affiliate material is NOT in /public (served to anyone who knows the name): it sits next to it and is delivered
// only by endpoints that check who is asking.
export const AFFILIATE_DIR = path.resolve(PUBLIC_DIR, "..", "affiliate-files");

const ALLOWED = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".mp4", ".webm", ".mov",
  ".docx", ".xlsx", ".pptx", ".txt", ".zip"
]);

export const affiliateUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(AFFILIATE_DIR, { recursive: true });
      cb(null, AFFILIATE_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
      cb(null, `${Date.now()}-${randomBytes(12).toString("hex")}${ext}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(path.extname(file.originalname).toLowerCase())) {
      return cb(new AppError("ERR_AFFILIATE_FILE_TYPE", 400) as any);
    }
    return cb(null, true);
  }
});

export const removeAffiliateFile = (name?: string | null): void => {
  if (!name) return;
  fs.unlink(path.join(AFFILIATE_DIR, path.basename(name)), () => undefined);
};
