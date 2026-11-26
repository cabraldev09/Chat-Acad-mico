import { parseUsage } from "../helpers/ApiUsage";
import { Request, Response } from "express";
import { Op } from "sequelize";

import ApiToken from "../models/ApiToken";
import Polo from "../models/Polo";
import AppError from "../errors/AppError";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { API_SCOPES, cleanTokenInput, hashToken, newToken, prefixOf } from "../helpers/ApiTokens";
import { LEGACY_TOKEN_SETTING, legacyTokenEnabled } from "../middleware/isAuthApi";
import { logger } from "../utils/logger";

// API e webhooks → Tokens de API (administrator only, routes with isSystemAdmin). A token is shown once, when created; then only its prefix.
export const index = async (_req: Request, res: Response): Promise<Response> =>
  res.json(await ApiToken.findAll({ order: [["id", "DESC"]] }));

// what the screen offers: the scopes with their names in Portuguese
export const scopes = async (_req: Request, res: Response): Promise<Response> =>
  res.json(Object.entries(API_SCOPES).map(([key, label]) => ({ key, label })));

export const store = async (req: Request, res: Response): Promise<Response> => {
  const input = cleanTokenInput(req.body);
  if (input.poloIds && (await Polo.count({ where: { id: { [Op.in]: input.poloIds } } })) !== input.poloIds.length) throw new AppError("ERR_API_TOKEN_POLOS", 400);
  const token = newToken();
  const row = await ApiToken.create({
    name: input.name,
    token: null,
    tokenHash: hashToken(token),
    tokenPrefix: prefixOf(token),
    scopes: JSON.stringify(input.scopes),
    poloIds: input.poloIds ? JSON.stringify(input.poloIds) : null,
    expiresAt: input.expiresAt,
    legacy: false,
    createdById: Number(req.user.id)
  } as any);
  logger.info(`Token de API #${row.id} criado por ${req.user.id}: ${input.scopes.join(", ")}`);
  // the full token is shown only here, once (it is not kept: only its hash)
  return res.status(201).json({ ...row.toJSON(), token });
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const row = await ApiToken.findByPk(req.params.id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  await row.destroy();
  logger.info(`Token de API #${row.id} excluído por ${req.user.id}`);
  return res.json({ message: "deleted" });
};

// the old single token of Configurações: on or off, and when it was last used (Decision: on by default, the screen recommends turning it off)
export const legacyShow = async (_req: Request, res: Response): Promise<Response> =>
  res.json({
    enabled: await legacyTokenEnabled(),
    lastUsedAt: (await getSetting("api_legacy_token_used_at", "")) || null,
    // the routes it was used for (helpers/ApiUsage): which integration still depends on it
    usage: parseUsage(await getSetting("api_legacy_token_usage", ""))
  });

export const legacySave = async (req: Request, res: Response): Promise<Response> => {
  if (typeof req.body?.enabled !== "boolean") throw new AppError("ERR_INVALID_SETTING", 400);
  await setSetting(LEGACY_TOKEN_SETTING, req.body.enabled ? "true" : "false");
  logger.warn(`Token antigo de Configurações ${req.body.enabled ? "ligado" : "desligado"} por ${req.user.id}`);
  return legacyShow(req, res);
};
