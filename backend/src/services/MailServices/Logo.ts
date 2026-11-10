import fs from "fs";
import path from "path";

// The brand logo that heads every e-mail. It travels inside the message (an inline attachment the HTML points to by
// its "cid"), so it shows even where the mail app blocks images from the web, and it is not a separate file for the
// person to open. The same folder holds it when running from src (tests) and from dist (production).
export const LOGO_CID = "logo-cruzeiro-virtual";
export const LOGO_FILE = path.join(__dirname, "..", "..", "..", "assets", "mail", "logo.png");

let cached: Buffer | null = null;
export const logoBytes = (): Buffer | null => {
  if (cached) return cached;
  try {
    cached = fs.readFileSync(LOGO_FILE);
  } catch (e) {
    cached = null;
  }
  return cached;
};

// the attachment to send along when the message uses the logo (nothing when the file is missing: the alt text stays)
export const logoAttachments = (html: string) => {
  if (!html.includes(`cid:${LOGO_CID}`)) return [];
  const content = logoBytes();
  return content ? [{ filename: "logo-cruzeiro-do-sul-virtual.png", content, cid: LOGO_CID, contentType: "image/png", contentDisposition: "inline" as const }] : [];
};

// for showing the message on a screen (the preview), where a "cid" does not exist: the same image as data
export const inlineLogoForScreen = (html: string): string => {
  const content = logoBytes();
  return content ? html.split(`cid:${LOGO_CID}`).join(`data:image/png;base64,${content.toString("base64")}`) : html;
};
