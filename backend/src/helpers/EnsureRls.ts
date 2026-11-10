import sequelize from "../database";
import { logger } from "../utils/logger";

// Supabase publishes every table of the public schema through its REST API
// (anon key). All access here goes through this backend (direct Postgres
// connection), so every table gets Row Level Security with NO policy = closed to
// the REST API, and the API roles lose their grants. Idempotent; also covers
// tables that future migrations create.
export const ensureRls = async (): Promise<void> => {
  if (sequelize.getDialect() !== "postgres") return;
  try {
    await sequelize.query(`
      DO $$
      DECLARE r record;
      BEGIN
        -- only the tables still open: ALTER TABLE takes a heavy lock, and every restart would pay it on all of them
        FOR r IN SELECT c.relname AS tablename FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity LOOP
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
        END LOOP;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
          REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
          REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
        END IF;
      END $$;
    `);
  } catch (err) {
    logger.error(`Could not enforce row level security: ${err}`);
    throw err;
  }
};
