import { afterCommit } from "./TransactionContext";
import { logger } from "../utils/logger";

// Tells the triggers ("Gatilhos") that something happened. Never waits and never fails the caller: an automation must
// not be able to break the action that caused it.
export const fire = (event: string, ctx: Record<string, any>): void => {
  afterCommit(() => { import("../services/FlowServices/Events")
    .then(m => m.emitEvent(event, ctx))
    .catch(err => logger.warn(`trigger ${event}: ${err}`)); });
};
