import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import { ApiCaller, ApiScope, hasScope } from "../helpers/ApiTokens";

// Each route of the API v1 asks for one scope of the token (helpers/ApiTokens.API_SCOPES). Runs after isAuthApi.
export const apiCaller = (req: Request): ApiCaller => {
  const caller = (req as any).apiToken as ApiCaller | undefined;
  if (!caller) throw new AppError("ERR_SESSION_EXPIRED", 401);
  return caller;
};

const requireScope = (scope: ApiScope) => (req: Request, _res: Response, next: NextFunction): void => {
  if (!hasScope(apiCaller(req).scopes, scope)) throw new AppError("ERR_API_TOKEN_SCOPE", 403);
  next();
};

export const canReadLeads = requireScope("leads:read");
export const canWriteLeads = requireScope("leads:write");
export const canReadContacts = requireScope("contacts:read");
export const canWriteContacts = requireScope("contacts:write");
export const canReadTickets = requireScope("tickets:read");
export const canReadConnections = requireScope("connections:read");
export const canReadIndicators = requireScope("indicators:read");
export const canSendMessages = requireScope("messages:send");
