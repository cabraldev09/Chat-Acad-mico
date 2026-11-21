import fs from "fs";
import { NextFunction, Request, Response } from "express";

import AppError from "../errors/AppError";

// a cap on the whole batch of a multi-file upload (multer only limits each file): over it, the files already on disk are erased and the
// request is refused
export const batchLimit = (maxBytes: number) => (req: Request, _res: Response, next: NextFunction): void => {
  const files = ((req as any).files as Express.Multer.File[] | undefined) || [];
  const total = files.reduce((n, f) => n + (f.size || 0), 0);
  if (total > maxBytes) {
    files.forEach(f => { if (f.path) fs.unlink(f.path, () => undefined); });
    return next(new AppError("ERR_UPLOAD_TOO_LARGE", 413));
  }
  return next();
};
