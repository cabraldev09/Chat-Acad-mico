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

// the writes of every minute that never touch reference data: sending and reading messages, moving conversations, the copilot, the
// activities and tasks of a lead and the reports of screen errors. Before, each of them emptied the cache of every user, so during the
// working day the cache was almost always empty. Any other change still clears it.
const NOT_REFERENCE = /^\/(messages|client-errors|tickets|copilot|forward|typing|outbound|notifications)(\/|$|\?)|^\/leads\/\d+\/(activities|tasks)(\/|$|\?)/;

export const clearCacheOnChange = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS" && !NOT_REFERENCE.test(req.path)) {
    res.on("finish", () => {
      if (res.statusCode < 400) forget("ref:");
    });
  }
  next();
};
