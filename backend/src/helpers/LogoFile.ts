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

// the brand's logo (Cruzeiro do Sul Virtual), shipped with the server: used where a university of the brand has no logo of its own
const BRAND_LOGO = path.join(__dirname, "..", "..", "assets", "brand", "logo-cruzeiro-color.svg");
let brandCache: string | null | undefined;
export const brandLogoDataUri = (): string | null => {
  if (brandCache !== undefined) return brandCache;
  try {
    brandCache = `data:image/svg+xml;base64,${fs.readFileSync(BRAND_LOGO).toString("base64")}`;
  } catch (e) {
    brandCache = null;
  }
  return brandCache;
};
