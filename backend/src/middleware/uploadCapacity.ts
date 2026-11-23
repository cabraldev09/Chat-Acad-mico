import fs from "fs";
import { NextFunction, Request, Response } from "express";

import AppError from "../errors/AppError";
import { PUBLIC_UPLOAD_MIN_FREE_BYTES } from "../helpers/PublicUploadPolicy";
import { PUBLIC_DIR } from "../config/paths";

let reserved = 0;

// Reserve the route's maximum possible body size until the response closes. This keeps concurrent
// uploads from consuming the safety margin between checking free space and Multer writing files.
export const uploadCapacity = (maxRequestBytes: number) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let allocated = false;
  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) return next(new AppError("ERR_FILE_TOO_LARGE", 413));
  // Use the declared complete multipart size when present; chunked requests reserve the route's
  // maximum because their eventual disk use is unknown before Multer starts writing.
  const reservation = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : maxRequestBytes;
  try {
    const stat = await fs.promises.statfs(PUBLIC_DIR);
    const available = Number(stat.bavail) * Number(stat.bsize);
    if (available - reserved - reservation < PUBLIC_UPLOAD_MIN_FREE_BYTES) throw new AppError("ERR_UPLOAD_STORAGE_FULL", 507);
    reserved += reservation;
    allocated = true;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      reserved = Math.max(0, reserved - reservation);
    };
    res.once("finish", release);
    res.once("close", release);
    return next();
  } catch (err) {
    if (allocated) reserved = Math.max(0, reserved - reservation);
    if (err instanceof AppError) return next(err);
    return next(new AppError("ERR_UPLOAD_STORAGE_FULL", 507));
  }
};
