import { randomBytes } from "crypto";
import path from "path";

// The name a file gets when it is stored under the public folder. The sender of a WhatsApp media (or a visitor of the web chat) chooses the
// "filename" that comes with the file: it can carry "../" to leave the folder, or an extension that a browser runs (html, svg, js...). Nothing of it is
// trusted: the folder part is cut, the characters are limited, the extension comes from a list, and the unique part comes from a secure source.
const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

// 5 characters (the screen hides "~xxxxx" before the extension to show the real name)
export const randomId = (length = 5): string => {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += ID_CHARS[bytes[i] % ID_CHARS.length];
  return out;
};

// what a browser or the server would run or render as a page
const ACTIVE = new Set(["html", "htm", "xhtml", "xht", "shtml", "svg", "svgz", "xml", "xsl", "xslt", "js", "mjs", "cjs", "ts", "php", "phtml", "asp", "aspx", "jsp", "cgi", "sh", "bash", "bat", "cmd", "ps1", "exe", "dll", "msi", "jar", "swf", "hta", "wasm", "json", "css", "map"]);

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
  "audio/aac": "aac", "audio/wav": "wav", "audio/webm": "webm", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/3gpp": "3gp",
  "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv", "application/zip": "zip",
  "application/msword": "doc", "application/vnd.ms-excel": "xls", "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx"
};

export const extensionFromMime = (mimetype?: string | null): string => {
  const mime = String(mimetype || "").split(";")[0].trim().toLowerCase();
  return MIME_EXT[mime] || "bin";
};

export const safeStoredName = (original?: string | null, mimetype?: string | null): string => {
  const unique = randomId(5);
  const raw = String(original || "").replace(/\\/g, "/").split("/").pop() || "";
  // letters (with accents), digits and a few separators; nothing that has a meaning for the file system
  const clean = raw.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^\p{L}\p{N} ._()\-]/gu, "_");
  const dot = clean.lastIndexOf(".");
  const base = (dot > 0 ? clean.slice(0, dot) : clean).replace(/^\.+/, "").replace(/\.+/g, ".").trim().slice(0, 100);
  let ext = dot > 0 ? clean.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  if (!ext || ACTIVE.has(ext)) ext = extensionFromMime(mimetype);
  if (ACTIVE.has(ext)) ext = "bin";
  return base ? `${base}~${unique}.${ext}` : `${unique}-${Date.now()}.${ext}`;
};

// the file system path of a stored name, never outside the folder
export const insideFolder = (folder: string, name: string): string => {
  const base = path.resolve(folder);
  const full = path.resolve(base, name);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("file name outside of the public folder");
  return full;
};
