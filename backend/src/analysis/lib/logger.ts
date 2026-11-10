import { logger as appLogger } from "../../utils/logger";

// The migrated code logs with (message, context); the system logger takes one string.
const line = (message: string, ctx?: Record<string, unknown>): string => (ctx ? `${message} ${JSON.stringify(ctx).slice(0, 400)}` : message);

export const logger = {
  debug: (message: string, ctx?: Record<string, unknown>) => appLogger.debug(line(message, ctx)),
  info: (message: string, ctx?: Record<string, unknown>) => appLogger.info(line(message, ctx)),
  warn: (message: string, ctx?: Record<string, unknown>) => appLogger.warn(line(message, ctx)),
  error: (message: string, ctx?: Record<string, unknown>) => appLogger.error(line(message, ctx))
};
