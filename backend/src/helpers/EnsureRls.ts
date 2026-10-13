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
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
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
    logger.warn(`Could not enforce row level security: ${err}`);
  }
};
