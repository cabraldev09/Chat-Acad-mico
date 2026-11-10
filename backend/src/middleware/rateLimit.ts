import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";

interface Options {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
  // count only the answers that failed (login: a person who gets the password right is never blocked by the others who got it wrong)
  failuresOnly?: boolean;
}

// Small in-memory fixed-window limiter (single process, no extra dependency).
const rateLimit = ({ windowMs, max, key, failuresOnly }: Options) => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    hits.forEach((v, k) => {
      if (v.resetAt <= now) hits.delete(k);
    });
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const id = key ? key(req) : req.ip || "unknown";
    const now = Date.now();
    const entry = hits.get(id);

    if (failuresOnly) {
      if (entry && entry.resetAt > now && entry.count >= max) {
        res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
        throw new AppError("ERR_TOO_MANY_REQUESTS", 429);
      }
      res.on("finish", () => {
        if (res.statusCode < 400 || res.statusCode === 429) return;
        const at = Date.now();
        const current = hits.get(id);
        if (!current || current.resetAt <= at) hits.set(id, { count: 1, resetAt: at + windowMs });
        else current.count += 1;
      });
      return next();
    }

    if (!entry || entry.resetAt <= now) {
      hits.set(id, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      throw new AppError("ERR_TOO_MANY_REQUESTS", 429);
    }
    return next();
  };
};

export default rateLimit;
