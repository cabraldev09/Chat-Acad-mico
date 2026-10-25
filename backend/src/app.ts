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
import * as ChannelOAuth from "./controllers/ChannelOAuthController";
import leadFormRoutes, { referralRouter } from "./routes/leadFormRoutes";
import courseLandingRoutes from "./routes/courseLandingRoutes";
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
    // version: the commit that is running, so a deploy can be checked from outside (nothing else about the server is told to an anonymous caller)
    res.json({
      ok: true,
      version: String(process.env.GIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || undefined
    });
  } catch (e) {
    res.status(503).json({ ok: false });
  }
});

// brute-force / abuse protection on the unauthenticated entry points
// login: only WRONG answers count, per person (IP + e-mail: 10 in 15 min) and per network (60), so a polo behind one address is not locked out
// by a colleague's typo and a right password is never refused
const loginPerAccount = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.LOGIN_RATE_MAX) || 10, failuresOnly: true, key: req => `${req.ip}|${String(req.body?.email || "").trim().toLowerCase()}` });
const loginPerNetwork = rateLimit({ windowMs: 15 * 60 * 1000, max: (Number(process.env.LOGIN_RATE_MAX) || 10) * 6, failuresOnly: true });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.LOGIN_RATE_MAX) || 20 });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 600 });
app.use("/auth/login", express.json({ limit: "20kb" }), loginPerNetwork, loginPerAccount);
// recovery by e-mail: few tries per address and per network (the service also limits each person per hour)
app.use("/auth/forgot", rateLimit({ windowMs: 15 * 60 * 1000, max: 6 }));
app.use("/auth/reset", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
// every page load renews the session, so this one is far more generous
app.use("/auth/refresh_token", rateLimit({ windowMs: 15 * 60 * 1000, max: 400 }));

// Public endpoints (embedded web chat, provider webhooks): no cookies, any origin
app.use("/webchat", publicLimiter, cors({ origin: true }), express.json(), webchatRoutes);
app.use("/leadform", publicLimiter, cors({ origin: true }), leadFormRoutes);
app.use("/r", publicLimiter, cors({ origin: true }), referralRouter);
app.use("/public/courses", publicLimiter, cors({ origin: true }), courseLandingRoutes);
app.use("/affiliate-portal", publicLimiter, cors({ origin: true }), affiliatePortalRoutes);
app.use("/p", publicLimiter, proposalPublicRoutes);
// where Instagram sends the person back after the login (signed state; no cookie needed)
app.use("/oauth/instagram/callback", publicLimiter, (req, res, next) => ChannelOAuth.callback(req, res).catch(next));
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
// 2 MB: flow drawings and proposal snapshots are larger than the 100 KB default
app.use(express.json({ limit: "2mb" }));

app.use(
  "/public",
  express.static(uploadConfig.directory, {
    index: false,
    dotfiles: "deny",
    // names are unique per file, so browsers can keep pictures, voice notes and PDFs instead of fetching them again
    maxAge: "7d",
    setHeaders: (res, filePath) => {
      // an uploaded file never runs in the origin of the API (it could use the session of whoever opens it): only pictures, sounds, videos and PDFs open
      // inside the browser; any other type (html, xhtml, svg, svgz, xml, js...) is a download
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (!/\.(jpe?g|png|gif|webp|avif|bmp|ico|mp3|ogg|oga|opus|m4a|aac|wav|mp4|webm|mov|3gp|pdf)$/i.test(filePath)) {
        res.setHeader("Content-Disposition", "attachment");
      } else if (!/\.pdf$/i.test(filePath)) {
        res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
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

  // the request itself was refused by a parser: tell the person what to do (not a server error, nothing for Sentry)
  const kind = (err as any)?.type;
  if (kind === "entity.too.large") return res.status(413).json({ error: "ERR_PAYLOAD_TOO_LARGE" });
  if (kind === "entity.parse.failed") return res.status(400).json({ error: "ERR_INVALID_JSON" });
  if (err.name === "MulterError") {
    return (err as any).code === "LIMIT_FILE_SIZE" ? res.status(413).json({ error: "ERR_FILE_TOO_LARGE" }) : res.status(400).json({ error: "ERR_UPLOAD" });
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
  // never the whole object: a database error carries the SQL and its parameters (names, phones, CPF of the request)
  const parent: any = (err as any).parent;
  logger.error({ request: `${req.method} ${req.originalUrl}`, message: err.message, name: err.name, dbCode: parent?.code, stack: err.stack });
  return res.status(500).json({ error: "Internal server error" });
});

export default app;
