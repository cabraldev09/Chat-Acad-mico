import "./bootstrap";
import "reflect-metadata";
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";

import "./database";
import uploadConfig from "./config/upload";
import AppError from "./errors/AppError";
import routes from "./routes";
import { logger } from "./utils/logger";
import webchatRoutes from "./routes/webchatRoutes";
import metaWebhookRoutes from "./routes/metaWebhookRoutes";
import leadFormRoutes from "./routes/leadFormRoutes";
import proposalPublicRoutes from "./routes/proposalPublicRoutes";
import efiWebhookRoutes from "./routes/efiWebhookRoutes";

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = express();

// Public endpoints (embedded web chat, provider webhooks): no cookies, any origin
app.use("/webchat", cors({ origin: true }), express.json(), webchatRoutes);
app.use("/leadform", cors({ origin: true }), leadFormRoutes);
app.use("/p", proposalPublicRoutes);
app.use(
  "/webhooks",
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }),
  metaWebhookRoutes,
  efiWebhookRoutes
);

app.use(
  cors({
    credentials: true,
    origin: process.env.FRONTEND_URL
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(Sentry.Handlers.requestHandler());
app.use("/public", express.static(uploadConfig.directory));
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
