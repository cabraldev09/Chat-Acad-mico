import { Client } from "pg";

import { logger } from "../utils/logger";

// Two backends on the same WhatsApp session kick each other off ("conflict"),
// which is exactly the kind of behavior that gets a number flagged. Platforms
// that overlap old and new containers during a deploy cause this. Only the
// instance holding this Postgres advisory lock opens WhatsApp sessions and runs
// the workers; the others keep serving the API and wait.
//
// Needs a session-level connection (Supabase: direct 5432 or the session
// pooler, NOT the transaction pooler on 6543).
const LOCK_KEY = 7420131;
const RETRY_MS = 15000;

const connect = async (): Promise<any> => {
  const cfg = require("../config/database");
  const client = new Client({
    host: cfg.host,
    port: cfg.port || 5432,
    user: cfg.username,
    password: cfg.password,
    database: cfg.database,
    ssl: cfg.dialectOptions?.ssl || undefined
  });
  await client.connect();
  return client;
};

export const whenLeader = (start: () => void): void => {
  const cfg = require("../config/database");
  if (cfg.dialect !== "postgres" || process.env.SINGLE_INSTANCE_LOCK === "false") {
    start();
    return;
  }

  let waitingLogged = false;
  const attempt = async (): Promise<void> => {
    try {
      const client = await connect();
      const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
      if (rows[0].ok) {
        logger.info("Leader lock acquired: starting WhatsApp sessions and workers");
        // losing the connection releases the lock: another instance may take over
        client.on("error", (err: Error) => logger.error(`Leader lock connection lost: ${err.message}`));
        client.on("end", () => {
          logger.error("Leader lock connection ended, exiting so the supervisor restarts us cleanly");
          process.exit(1);
        });
        start();
        return;
      }
      await client.end();
      if (!waitingLogged) {
        logger.warn("Another instance owns the WhatsApp sessions; serving the API only until it stops");
        waitingLogged = true;
      }
    } catch (err) {
      logger.error(`Leader lock check failed: ${err.message}`);
    }
    setTimeout(attempt, RETRY_MS);
  };
  attempt();
};
