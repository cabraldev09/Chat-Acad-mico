import { Request, Response, NextFunction } from "express";

import { forget, peek, put } from "../helpers/TtlCache";

// Reference data (courses, funnel stages, tags, queues, settings...) is read by every screen of every user and changes
// rarely. The answer is kept for a short time per user and address; any successful change (POST/PUT/PATCH/DELETE)
// clears all of it, so the person who saved something never sees the old list. Use after isAuth.
export const cached =
  (ttlMs = 45000) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const key = `ref:${req.user?.id}:${req.originalUrl}`;
    const hit = peek<any>(key, ttlMs);
    if (hit !== undefined) {
      res.json(hit);
      return;
    }
    const send = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode === 200) put(key, JSON.parse(JSON.stringify(body)));
      return send(body);
    };
    next();
  };

export const clearCacheOnChange = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    res.on("finish", () => {
      if (res.statusCode < 400) forget("ref:");
    });
  }
  next();
};
