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
import leadFormRoutes from "./routes/leadFormRoutes";
import proposalPublicRoutes from "./routes/proposalPublicRoutes";
import efiWebhookRoutes from "./routes/efiWebhookRoutes";
import securityHeaders from "./middleware/securityHeaders";
import rateLimit from "./middleware/rateLimit";

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = express();

app.disable("x-powered-by");
// behind a reverse proxy/tunnel the real client IP comes in X-Forwarded-For
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY);
app.use(securityHeaders);

// Railway/Docker health check: answers only when the database does too
app.get("/health", async (_req: Request, res: Response) => {
  try {
    await sequelize.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ ok: false });
  }
});

// brute-force / abuse protection on the unauthenticated entry points
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 600 });
app.use("/auth/login", loginLimiter);
app.use("/auth/signup", loginLimiter);
// every page load renews the session, so this one is far more generous
app.use("/auth/refresh_token", rateLimit({ windowMs: 15 * 60 * 1000, max: 400 }));

// Public endpoints (embedded web chat, provider webhooks): no cookies, any origin
app.use("/webchat", publicLimiter, cors({ origin: true }), express.json(), webchatRoutes);
app.use("/leadform", publicLimiter, cors({ origin: true }), leadFormRoutes);
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
app.use(Sentry.Handlers.requestHandler());
app.use(
  "/public",
  express.static(uploadConfig.directory, {
    index: false,
    dotfiles: "deny",
    setHeaders: (res, filePath) => {
      // never let an uploaded html/svg/js run in the app's origin
      if (/\.(html?|svg|xml|js|mjs)$/i.test(filePath)) {
        res.setHeader("Content-Disposition", "attachment");
      }
    }
  })
);
app.use(routes);

app.use(Sentry.Handlers.errorHandler());

app.use(async (err: Error, req: Request, res: Response, _: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(err);
    return res.status(err.statusCode).json({ error: err.message });
  }

  logger.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

export default app;
