import fs from "fs";
import path from "path";
import { PUBLIC_DIR } from "../config/paths";
import AppError from "../errors/AppError";

// API clients refer to files by name, never by path. Resolve symlinks too.
export const publicFile = (name: unknown, mustExist = true): string => {
  if (typeof name !== "string" || !name || name !== path.basename(name) || /[\\/\x00]/.test(name) || name === "." || name === "..") {
    throw new AppError("ERR_MEDIA_NOT_FOUND", 400);
  }
  const root = fs.realpathSync(PUBLIC_DIR);
  const file = path.join(root, name);
  if (!fs.existsSync(file)) {
    if (mustExist) throw new AppError("ERR_MEDIA_NOT_FOUND", 404);
    return file;
  }
  const resolved = fs.realpathSync(file);
  if (path.dirname(resolved) !== root || !fs.statSync(resolved).isFile()) throw new AppError("ERR_MEDIA_NOT_FOUND", 400);
  return resolved;
};
