import { Router } from "express";

import userRoutes from "./userRoutes";
import authRoutes from "./authRoutes";
import settingRoutes from "./settingRoutes";
import contactRoutes from "./contactRoutes";
import ticketRoutes from "./ticketRoutes";
import whatsappRoutes from "./whatsappRoutes";
import messageRoutes from "./messageRoutes";
import whatsappSessionRoutes from "./whatsappSessionRoutes";
import queueRoutes from "./queueRoutes";
import quickAnswerRoutes from "./quickAnswerRoutes";
import apiRoutes from "./apiRoutes";
import extraRoutes from "./extraRoutes";
import analysisRoutes from "./analysisRoutes";
import apiV1Routes from "./apiV1Routes";
import { clearCacheOnChange } from "../middleware/refCache";
import isAuth from "../middleware/isAuth";
import rateLimit from "../middleware/rateLimit";
import isAdmin from "../middleware/isAdmin";
import * as ClientErrors from "../controllers/ClientErrorController";

const routes = Router();

// a saved change anywhere clears the short-lived cache of reference data
routes.use(clearCacheOnChange);

// A screen that fails to draw in someone's browser is reported here and kept in the database (see Configurações > Erros de tela)
routes.post("/client-errors", isAuth, rateLimit({ windowMs: 60000, max: 20, key: req => `ce:${(req as any).user?.id || req.ip}` }), ClientErrors.store);
routes.get("/client-errors", isAuth, isAdmin, ClientErrors.index);
routes.delete("/client-errors", isAuth, isAdmin, ClientErrors.clear);

routes.use(analysisRoutes);
routes.use(userRoutes);
routes.use("/auth", authRoutes);
routes.use(settingRoutes);
routes.use(contactRoutes);
routes.use(ticketRoutes);
routes.use(whatsappRoutes);
routes.use(messageRoutes);
routes.use(whatsappSessionRoutes);
routes.use(queueRoutes);
routes.use(quickAnswerRoutes);
routes.use("/api/messages", apiRoutes);
routes.use("/api/v1", apiV1Routes);
routes.use(extraRoutes);

export default routes;
