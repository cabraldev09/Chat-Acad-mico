import { sign, verify } from "jsonwebtoken";
import path from "path";
import auth from "../config/auth";

// The link of a file is the same for a whole hour (the token is signed for a fixed hour window, valid until the end of the next one):
// before, every read of a conversation produced a new link, so the browser downloaded every photo and audio again on each refresh.
const WINDOW = 3600;
// The only folder inside public/ a link may name: the profile pictures (workers/ProfilePicSync saves "avatars/<file>"). Anything else is a
// plain file name. Before, the folder was dropped from the link ("public/<file>"), the file was not found and every picture failed.
export const AVATAR_FOLDER = "avatars";
export const fileKey = (filename: string): string => {
  const raw = String(filename || "").replace(/\\/g, "/");
  const base = path.basename(raw);
  return raw === `${AVATAR_FOLDER}/${base}` ? `${AVATAR_FOLDER}/${base}` : base;
};
export const signedFileUrl = (filename: string, messageId?: string, now: number = Date.now()): string => {
  const file = fileKey(filename);
  const iat = Math.floor(now / 1000 / WINDOW) * WINDOW;
  const token = sign({ purpose: "file", file, ...(messageId ? { messageId } : {}), iat, exp: iat + 2 * WINDOW }, auth.secret, { algorithm: "HS256" });
  const base = process.env.BACKEND_URL || "";
  const port = process.env.PROXY_PORT;
  const origin = /^https:\/\//.test(base) || !port ? base : `${base}:${port}`;
  return `${origin}/public/${file.split("/").map(encodeURIComponent).join("/")}?access=${token}`;
};
export const verifyFileToken = (token: string, filename: string): { file: string; messageId?: string } => {
  const claims = verify(token, auth.secret, { algorithms: ["HS256"] }) as any;
  if (claims.purpose !== "file" || claims.file !== filename || filename !== fileKey(filename)) throw new Error("Invalid file capability");
  return claims;
};
