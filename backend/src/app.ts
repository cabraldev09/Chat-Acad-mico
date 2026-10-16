import "./bootstrap";
import "reflect-metadata";
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { corsOrigin } from "./helpers/AllowedOrigins";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";

import sequelize from "./database";
import uploadConfig from "./config/upload";
import AppError from "./errors/AppError";
import routes from "./routes";
import { logger } from "./utils/logger";
import webchatRoutes from "./routes/webchatRoutes";
import metaWebhookRoutes from "./routes/metaWebhookRoutes";
import leadFormRoutes, { referralRouter } from "./routes/leadFormRoutes";
import affiliatePortalRoutes from "./routes/affiliatePortalRoutes";
import proposalPublicRoutes from "./routes/proposalPublicRoutes";
import efiWebhookRoutes from "./routes/efiWebhookRoutes";
import securityHeaders from "./middleware/securityHeaders";
import rateLimit from "./middleware/rateLimit";

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = express();

app.disable("x-powered-by");
// behind a reverse proxy/tunnel the real client IP comes in X-Forwarded-For
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY;
  app.set("trust proxy", /^\d+$/.test(value) ? Number(value) : value === "true" ? true : value === "false" ? false : value);
}
app.use(securityHeaders);

// Railway/Docker health check: answers only when the database does too
app.get("/health", async (_req: Request, res: Response) => {
  try {
    await sequelize.query("SELECT 1");
    // version: the commit Railway is running, so a deploy can be checked from outside
    // pool: connections open / in use / requests waiting for one (a growing "waiting" means the pool is too small)
    const pool: any = (sequelize as any).connectionManager?.pool;
    res.json({
      ok: true,
      version: String(process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || undefined,
      pool: pool ? { size: pool.size, using: pool.using, waiting: pool.waiting, max: pool.maxSize } : undefined
    });
  } catch (e) {
    res.status(503).json({ ok: false });
  }
});

// brute-force / abuse protection on the unauthenticated entry points
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.LOGIN_RATE_MAX) || 20 });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 600 });
app.use("/auth/login", loginLimiter);
app.use("/auth/signup", loginLimiter);
// recovery by e-mail: few tries per address and per network (the service also limits each person per hour)
app.use("/auth/forgot", rateLimit({ windowMs: 15 * 60 * 1000, max: 6 }));
app.use("/auth/reset", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
// every page load renews the session, so this one is far more generous
app.use("/auth/refresh_token", rateLimit({ windowMs: 15 * 60 * 1000, max: 400 }));

// Public endpoints (embedded web chat, provider webhooks): no cookies, any origin
app.use("/webchat", publicLimiter, cors({ origin: true }), express.json(), webchatRoutes);
app.use("/leadform", publicLimiter, cors({ origin: true }), leadFormRoutes);
app.use("/r", publicLimiter, cors({ origin: true }), referralRouter);
app.use("/affiliate-portal", publicLimiter, cors({ origin: true }), affiliatePortalRoutes);
app.use("/p", publicLimiter, proposalPublicRoutes);
app.use(
  "/webhooks",
  webhookLimiter,
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }),
  express.urlencoded({ extended: false }),
  metaWebhookRoutes,
  efiWebhookRoutes
);

app.use(
  cors({
    credentials: true,
    origin: corsOrigin()
  })
);
app.use(cookieParser());
app.use(express.json());

app.use(
  "/public",
  express.static(uploadConfig.directory, {
    index: false,
    dotfiles: "deny",
    // names are unique per file, so browsers can keep pictures, voice notes and PDFs instead of fetching them again
    maxAge: "7d",
    setHeaders: (res, filePath) => {
      // never let an uploaded html/svg/js run in the app's origin
      if (/\.(html?|svg|xml|js|mjs)$/i.test(filePath)) {
        res.setHeader("Content-Disposition", "attachment");
      }
    }
  })
);
app.use(routes);



app.use(async (err: Error, req: Request, res: Response, _: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(err);
    return res.status(err.statusCode).json({ error: err.message, ...(err.data ? { data: err.data } : {}) });
  }

  // a value that is not valid for its column (for example text where a number is expected) is the caller's
  // mistake: answer 400, not a server error
  const code = (err as any)?.parent?.code;
  if (code === "22P02" || code === "22003" || code === "22007") {
    logger.warn({ request: `${req.method} ${req.originalUrl}`, message: err.message });
    return res.status(400).json({ error: "ERR_INVALID_PARAMETER" });
  }

  // an id that is not a number reaches the query as NaN ("column nan does not exist"): nothing is there to find
  if (code === "42703" && /column "nan" does not exist/i.test(err.message)) {
    logger.warn({ request: `${req.method} ${req.originalUrl}`, message: err.message });
    return res.status(404).json({ error: "ERR_NOT_FOUND" });
  }
  // a reference to a record that does not exist (insert) is a missing thing; deleting what is still in use is a conflict
  if (code === "23503") {
    logger.warn({ request: `${req.method} ${req.originalUrl}`, message: err.message });
    return /^update or delete/i.test(err.message) ? res.status(409).json({ error: "ERR_IN_USE" }) : res.status(404).json({ error: "ERR_NOT_FOUND" });
  }

  // one line that names the request, so a 500 on the screen can be found in the log
  Sentry.captureException(err);
  logger.error({ request: `${req.method} ${req.originalUrl}`, message: err.message, err });
  return res.status(500).json({ error: "Internal server error" });
});

export default app;
