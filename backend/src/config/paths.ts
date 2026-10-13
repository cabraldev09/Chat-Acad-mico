import path from "path";

// Uploaded media, generated PDFs and logos. On Railway point UPLOAD_DIR at the
// persistent volume (e.g. /data/public) so files survive deploys.
export const PUBLIC_DIR =
  process.env.UPLOAD_DIR || path.resolve(__dirname, "..", "..", "public");

// WhatsApp Web (QR code) session profiles. Must live on persistent storage.
export const WWEBJS_AUTH_DIR =
  process.env.WWEBJS_AUTH_PATH || path.resolve(__dirname, "..", "..", ".wwebjs_auth");
