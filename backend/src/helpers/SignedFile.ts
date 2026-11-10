import { sign, verify } from "jsonwebtoken";
import path from "path";
import auth from "../config/auth";

export const signedFileUrl = (filename: string, messageId?: string): string => {
  const file = path.basename(filename);
  const token = sign({ purpose: "file", file, ...(messageId ? { messageId } : {}) }, auth.secret, { algorithm: "HS256", expiresIn: 3600 });
  const base = process.env.BACKEND_URL || "";
  const port = process.env.PROXY_PORT;
  const origin = /^https:\/\//.test(base) || !port ? base : `${base}:${port}`;
  return `${origin}/public/${encodeURIComponent(file)}?access=${token}`;
};
export const verifyFileToken = (token: string, filename: string): { file: string; messageId?: string } => {
  const claims = verify(token, auth.secret, { algorithms: ["HS256"] }) as any;
  if (claims.purpose !== "file" || claims.file !== filename || filename !== path.basename(filename)) throw new Error("Invalid file capability");
  return claims;
};
