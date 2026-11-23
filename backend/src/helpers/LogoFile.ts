import fs from "fs";
import path from "path";

import { PUBLIC_DIR } from "../config/paths";

// a logo saved by the screens (an institution's logo) as a data: URI, to put inside a page or a PDF with no extra request
export const logoDataUri = (file?: string | null): string | null => {
  if (!file) return null;
  try {
    const full = path.join(PUBLIC_DIR, path.basename(file));
    const ext = path.extname(full).slice(1).toLowerCase() || "png";
    const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    return `data:${mime};base64,${fs.readFileSync(full).toString("base64")}`;
  } catch (e) {
    return null;
  }
};
