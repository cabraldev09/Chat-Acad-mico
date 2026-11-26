import fs from "fs";
import path from "path";
import { PUBLIC_DIR } from "../config/paths";
import AppError from "../errors/AppError";

// API clients refer to files by name, never by path. Resolve symlinks too.
// The one folder allowed is the profile pictures ("avatars/<file>"), and only where the caller asks for it (the file server, which shows
// the pictures): a message, a campaign or a schedule never attaches a profile picture by name. The file part follows the same rules.
export const publicFile = (name: unknown, mustExist = true, opts: { allowAvatar?: boolean } = {}): string => {
  const avatar = !!opts.allowAvatar && typeof name === "string" && name.startsWith("avatars/");
  const base = avatar ? (name as string).slice("avatars/".length) : name;
  if (typeof base !== "string" || !base || base !== path.basename(base) || /[\\/\x00]/.test(base) || base === "." || base === "..") {
    throw new AppError("ERR_MEDIA_NOT_FOUND", 400);
  }
  const top = fs.realpathSync(PUBLIC_DIR);
  const root = avatar ? path.join(top, "avatars") : top;
  const file = path.join(root, base);
  if (!fs.existsSync(file)) {
    if (mustExist) throw new AppError("ERR_MEDIA_NOT_FOUND", 404);
    return file;
  }
  const resolved = fs.realpathSync(file);
  if (path.dirname(resolved) !== (avatar ? fs.realpathSync(path.join(top, "avatars")) : top) || !fs.statSync(resolved).isFile()) throw new AppError("ERR_MEDIA_NOT_FOUND", 400);
  return resolved;
};
